import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, emailSettings, providerUsage, recipients } from "@/db/schema";
import { sendViaProvider, supportedProviderEnvs } from "@/lib/email-providers";

const actionSchema = z.object({ action: z.enum(["start", "pause", "resume", "stop", "tick"]) });

function parseObject(value: string | null | undefined): Record<string, any> {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}

function responseFor(campaign: typeof campaigns.$inferSelect, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ status: campaign.sendStatus, cursor: campaign.sendCursor, total: campaign.recipientCount, error: campaign.sendError, ...extra });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Thao tác gửi không hợp lệ" }, { status: 400 });
  await ensureDatabase();
  let campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const action = parsed.data.action;

  if (action === "pause") {
    if (campaign.sendStatus === "sending") await db.update(campaigns).set({ sendStatus: "paused", updatedAt: Date.now() }).where(eq(campaigns.id, id));
    campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    return responseFor(campaign);
  }
  if (action === "stop") {
    await db.update(campaigns).set({ sendStatus: "stopped", updatedAt: Date.now() }).where(eq(campaigns.id, id));
    campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    return responseFor(campaign);
  }
  if (action === "start" || action === "resume") {
    if (campaign.sendStatus !== "completed") {
      await db.update(campaigns).set({ sendStatus: "sending", sendError: null, updatedAt: Date.now() }).where(eq(campaigns.id, id));
      campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    }
    return responseFor(campaign);
  }
  if (campaign.sendStatus !== "sending") return responseFor(campaign);

  const recipient = (await db.select().from(recipients).where(eq(recipients.campaignId, id)).orderBy(asc(recipients.createdAt)).limit(1).offset(campaign.sendCursor))[0];
  if (!recipient) {
    await db.update(campaigns).set({ sendStatus: "completed", sendError: null, updatedAt: Date.now() }).where(eq(campaigns.id, id));
    campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    return responseFor(campaign, { done: true });
  }

  const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
  const configs = parseObject(settings?.providerConfigsJson);
  const today = new Date().toISOString().slice(0, 10);
  const usageRows = await db.select().from(providerUsage).where(eq(providerUsage.usageDate, today));
  const usage = Object.fromEntries(usageRows.map((item) => [item.providerEnv, item.sentCount]));
  const candidates = supportedProviderEnvs.filter((env) => process.env[env]).sort((a, b) => (usage[a] || 0) / Number(configs[a]?.dailyLimit || 100) - (usage[b] || 0) / Number(configs[b]?.dailyLimit || 100));
  const available = candidates.filter((env) => (usage[env] || 0) < Math.floor(Number(configs[env]?.dailyLimit || 100) * 0.9));
  if (!available.length) {
    await db.update(campaigns).set({ sendStatus: "paused", sendError: "Tất cả provider đã gần chạm 90% hạn mức/ngày hoặc chưa cấu hình.", updatedAt: Date.now() }).where(eq(campaigns.id, id));
    campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    return responseFor(campaign, { blocked: true });
  }

  const failures: string[] = [];
  for (const env of available) {
    try {
      const messageId = await sendViaProvider(env, { to: recipient.email, subject: campaign.subject, html: campaign.htmlContent, text: campaign.textContent });
      await db.update(recipients).set({ status: "sent" }).where(eq(recipients.id, recipient.id));
      await db.insert(providerUsage).values({ providerEnv: env, usageDate: today, sentCount: 1 }).onConflictDoUpdate({ target: [providerUsage.providerEnv, providerUsage.usageDate], set: { sentCount: sql`${providerUsage.sentCount} + 1` } });
      await db.update(campaigns).set({ sendCursor: campaign.sendCursor + 1, sendError: null, updatedAt: Date.now() }).where(eq(campaigns.id, id));
      campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
      return responseFor(campaign, { provider: env, recipient: recipient.email, messageId, delayMs: Number(configs[env]?.delaySeconds || 10) * 1000 });
    } catch (error) {
      failures.push(`${env}: ${error instanceof Error ? error.message : "gửi thất bại"}`);
    }
  }
  await db.update(recipients).set({ status: "failed" }).where(eq(recipients.id, recipient.id));
  await db.update(campaigns).set({ sendStatus: "paused", sendError: failures.join("; "), updatedAt: Date.now() }).where(eq(campaigns.id, id));
  campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  return responseFor(campaign, { failedRecipient: recipient.email });
}
