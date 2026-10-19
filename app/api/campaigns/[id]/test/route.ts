import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, emailSettings, providerUsage } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { sendViaProvider, supportedProviderEnvs } from "@/lib/email-providers";

function parseObject(value: string | null | undefined) {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {}; } catch { return {}; }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = z.object({ to: z.string().email() }).safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
  await ensureDatabase();
  const campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
  const configs = parseObject(settings?.providerConfigsJson);
  const today = new Date().toISOString().slice(0, 10);
  const usageRows = await db.select().from(providerUsage).where(eq(providerUsage.usageDate, today));
  const usage = Object.fromEntries(usageRows.map((item) => [item.providerEnv, item.sentCount]));
  const candidates = supportedProviderEnvs.filter((env) => process.env[env]).sort((a, b) => {
    const aConfig = configs[a] || { dailyLimit: 100 };
    const bConfig = configs[b] || { dailyLimit: 100 };
    return (usage[a] || 0) / aConfig.dailyLimit - (usage[b] || 0) / bConfig.dailyLimit;
  });
  const available = candidates.filter((env) => {
    const limit = Number(configs[env]?.dailyLimit || 100);
    return (usage[env] || 0) < Math.floor(limit * 0.9);
  });
  if (!available.length) return NextResponse.json({ error: "Tất cả provider đã gần chạm 90% hạn mức/ngày hoặc chưa có adapter gửi." }, { status: 429 });
  const failures: string[] = [];
  for (const env of available) {
    try {
      const messageId = await sendViaProvider(env, { to: body.data.to, subject: `[TEST] ${campaign.subject}`, html: campaign.htmlContent, text: campaign.textContent });
      await db.insert(providerUsage).values({ providerEnv: env, usageDate: today, sentCount: 1 }).onConflictDoUpdate({ target: [providerUsage.providerEnv, providerUsage.usageDate], set: { sentCount: sql`${providerUsage.sentCount} + 1` } });
      return NextResponse.json({ id: messageId, provider: env, rotated: env !== candidates[0], usedToday: (usage[env] || 0) + 1 });
    } catch (error) {
      failures.push(`${env}: ${error instanceof Error ? error.message : "gửi thất bại"}`);
    }
  }
  return NextResponse.json({ error: `Không gửi được qua provider nào. ${failures.join("; ")}` }, { status: 502 });
}
