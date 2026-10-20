import { NextResponse } from "next/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { client, db, ensureDatabase } from "@/db/client";
import { campaigns, emailSettings, providerUsage, recipients } from "@/db/schema";
import { isProviderConfigured, isProviderEnabled, sendViaProvider, supportedProviderEnvs } from "@/lib/email-providers";
import { hasProviderDailyCapacity, isDefinitiveProviderRejection, providerDailyAllowance, releaseRejectedProviderUsage, reserveProviderUsage } from "@/lib/provider-quota";
import { recordProviderError } from "@/lib/provider-error-log";
import { rejectCrossOrigin } from "@/lib/request-security";

const actionSchema = z.object({ action: z.enum(["start", "pause", "resume", "stop", "tick", "select-provider", "resolve-unknown"]), providerEnv: z.string().nullable().optional(), resolution: z.enum(["sent", "retry"]).optional() });
const runnableStates = ["draft", "paused", "stopped"] as const;
const CLAIM_LEASE_MS = 120_000;
const PROVIDER_SWITCH_DELAY_MS = 60_000;
const PROVIDER_FAILURE_THRESHOLD = 4;
const PROVIDER_NAMES: Record<string, string> = { RESEND_API_KEY: "Resend", BREVO_API_KEY: "Brevo", MAILJET_API_KEY: "Mailjet", MAILTRAP_API_TOKEN: "Mailtrap", MAILGUN_API_KEY: "Mailgun", POSTMARK_SERVER_TOKEN: "Postmark", MAILERSEND_API_TOKEN: "MailerSend", SMTP2GO_API_KEY: "SMTP2GO", MAILOFLY_API_KEY: "Mailofly", AGENTMAIL_API_KEY: "AgentMail" };

function parseObject(value: string | null | undefined): Record<string, any> {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function responseFor(campaign: typeof campaigns.$inferSelect, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ status: campaign.sendStatus, cursor: campaign.sendCursor, total: campaign.recipientCount, error: campaign.sendError, ...extra });
}

async function getCampaign(id: string) {
  return (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await ensureDatabase();
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
  const configs = parseObject(settings?.providerConfigsJson);
  const usageDate = new Date().toISOString().slice(0, 10);
  const [usageRows, sentRows] = await Promise.all([
    db.select().from(providerUsage).where(eq(providerUsage.usageDate, usageDate)),
    db.select({ providerEnv: recipients.providerEnv, sentCount: count() }).from(recipients)
      .where(and(eq(recipients.campaignId, id), eq(recipients.status, "sent"))).groupBy(recipients.providerEnv),
  ]);
  const usage = Object.fromEntries(usageRows.map((item) => [item.providerEnv, item.sentCount]));
  const campaignSent = Object.fromEntries(sentRows.filter((item) => item.providerEnv).map((item) => [item.providerEnv as string, item.sentCount]));
  const lastRecipient = campaign.sendCursor > 0 ? await recipientAtCursor(id, campaign.sendCursor - 1) : undefined;
  const historicalProviderEnv = campaign.activeProviderEnv || lastRecipient?.providerEnv || null;
  const currentProviderEnv = historicalProviderEnv && isProviderConfigured(historicalProviderEnv) && isProviderEnabled(configs, historicalProviderEnv) ? historicalProviderEnv : null;
  const disabledCurrentProviderEnv = historicalProviderEnv && !isProviderEnabled(configs, historicalProviderEnv) ? historicalProviderEnv : null;
  const providers = supportedProviderEnvs.flatMap((env) => {
    if (!isProviderConfigured(env) || !isProviderEnabled(configs, env)) return [];
    const configuredLimit = Number(configs[env]?.dailyLimit || 100);
    const allowance = providerDailyAllowance(configuredLimit);
    const usedToday = usage[env] || 0;
    return [{ env, name: PROVIDER_NAMES[env] || env, dailyLimit: configuredLimit, allowance, usedToday, remaining: Math.max(0, allowance - usedToday), campaignSent: campaignSent[env] || 0 }];
  });
  return NextResponse.json({
    status: campaign.sendStatus,
    cursor: campaign.sendCursor,
    total: campaign.recipientCount,
    currentProviderEnv,
    selectedProviderEnv: campaign.selectedProviderEnv || null,
    disabledCurrentProviderEnv,
    pendingProviderEnv: campaign.pendingProviderEnv || null,
    providerSwitchAfter: campaign.providerSwitchAfter || null,
    providerFailureEnv: campaign.providerFailureEnv || null,
    providerFailureCount: campaign.providerFailureCount || 0,
    dailyLimit: providers.reduce((sum, provider) => sum + provider.dailyLimit, 0),
    dailyAllowance: providers.reduce((sum, provider) => sum + provider.allowance, 0),
    dailyUsed: providers.reduce((sum, provider) => sum + provider.usedToday, 0),
    dailyRemaining: providers.reduce((sum, provider) => sum + provider.remaining, 0),
    providers,
  });
}

async function recipientAtCursor(campaignId: string, cursor: number) {
  return (await db.select().from(recipients).where(eq(recipients.campaignId, campaignId))
    .orderBy(asc(recipients.createdAt), asc(recipients.id)).limit(1).offset(cursor))[0];
}

async function releaseUnsentClaim(campaignId: string, recipientId: string, reason: string) {
  try {
    await db.transaction(async (tx) => {
      await tx.update(recipients).set({ status: "pending", sendClaimedAt: null })
        .where(and(eq(recipients.id, recipientId), eq(recipients.status, "sending")));
      await tx.update(campaigns).set({ sendStatus: "paused", sendError: reason, updatedAt: Date.now() })
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending")));
      await tx.update(campaigns).set({ sendError: reason, updatedAt: Date.now() })
        .where(and(eq(campaigns.id, campaignId), inArray(campaigns.sendStatus, ["paused", "stopped"])));
    });
  } catch (error) {
    console.error("[campaign-send] Could not release unsubmitted recipient claim:", error);
  }
}

async function beginProviderSwitch(campaignId: string, recipientId: string, providerEnv: string, switchAfter: number, retryRange?: { startCursor: number; count: number; fromProvider: string; expectedCursor: number; expectedFailureCount: number }, expectedCursor?: number) {
  await db.transaction(async (tx) => {
    const currentCampaign = (await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1))[0];
    if (!currentCampaign || currentCampaign.sendStatus !== "sending") throw new Error("Campaign no longer sending");
    if (!retryRange && expectedCursor !== undefined && currentCampaign.sendCursor !== expectedCursor) throw new Error("Campaign cursor changed before provider switch.");
    if (retryRange && (currentCampaign.sendCursor !== retryRange.expectedCursor || currentCampaign.providerFailureEnv !== retryRange.fromProvider || currentCampaign.providerFailureCount !== retryRange.expectedFailureCount)) {
      throw new Error("Provider failure streak changed before retry switch.");
    }
    if (retryRange) {
      const retryRecipients = await tx.select({ id: recipients.id }).from(recipients)
        .where(eq(recipients.campaignId, campaignId)).orderBy(asc(recipients.createdAt), asc(recipients.id))
        .limit(retryRange.count).offset(retryRange.startCursor);
      if (retryRecipients.length !== retryRange.count) throw new Error("Không tìm thấy đầy đủ recipient trong chuỗi lỗi provider.");
      const changed = await tx.update(recipients).set({ status: "pending", sendClaimedAt: null, providerEnv: retryRange.fromProvider })
        .where(and(inArray(recipients.id, retryRecipients.map((recipient) => recipient.id)), inArray(recipients.status, ["failed", "sending", "pending"])));
      if (changed.rowsAffected !== retryRange.count) throw new Error("Recipient retry group changed before provider switch.");
    } else {
      const released = await tx.update(recipients).set({ status: "pending", sendClaimedAt: null })
        .where(and(eq(recipients.id, recipientId), eq(recipients.status, "sending")));
      if (released.rowsAffected !== 1) throw new Error("Recipient claim changed before provider switch.");
    }
    const switched = await tx.update(campaigns).set({
      ...(retryRange ? { sendCursor: retryRange.startCursor } : {}),
      pendingProviderEnv: providerEnv,
      providerSwitchAfter: switchAfter,
      providerFailureEnv: null,
      providerFailureCount: 0,
      providerFailureStartCursor: null,
      sendError: null,
      updatedAt: Date.now(),
    }).where(retryRange
      ? and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending"), eq(campaigns.sendCursor, retryRange.expectedCursor), eq(campaigns.providerFailureEnv, retryRange.fromProvider), eq(campaigns.providerFailureCount, retryRange.expectedFailureCount))
      : and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending"), eq(campaigns.sendCursor, expectedCursor ?? currentCampaign.sendCursor)));
    if (switched.rowsAffected !== 1) throw new Error("Campaign changed before provider switch.");
  });
}

async function pauseForProviderFailureStreak(campaignId: string, startCursor: number, failureCount: number, providerEnv: string, reason: string, expectedCursor: number, expectedStoredFailureCount: number) {
  await db.transaction(async (tx) => {
    const failedRecipients = await tx.select({ id: recipients.id }).from(recipients)
      .where(eq(recipients.campaignId, campaignId)).orderBy(asc(recipients.createdAt), asc(recipients.id))
      .limit(failureCount).offset(startCursor);
    if (failedRecipients.length !== failureCount) throw new Error("Không tìm thấy đầy đủ recipient trong chuỗi lỗi provider.");
    const changed = await tx.update(recipients).set({ status: "pending", sendClaimedAt: null, providerEnv })
      .where(and(inArray(recipients.id, failedRecipients.map((recipient) => recipient.id)), inArray(recipients.status, ["failed", "sending", "pending"])));
    if (changed.rowsAffected !== failureCount) throw new Error("Recipient failure group changed before pause.");
    const paused = await tx.update(campaigns).set({
      sendStatus: "paused",
      sendCursor: startCursor,
      activeProviderEnv: providerEnv,
      providerFailureEnv: providerEnv,
      providerFailureCount: failureCount,
      providerFailureStartCursor: startCursor,
      sendError: reason,
      updatedAt: Date.now(),
    }).where(and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending"), eq(campaigns.sendCursor, expectedCursor), eq(campaigns.providerFailureEnv, providerEnv), eq(campaigns.providerFailureCount, expectedStoredFailureCount)));
    if (paused.rowsAffected !== 1) throw new Error("Campaign changed before provider failure pause.");
  });
}

async function markUnknownClaim(campaignId: string, recipientId: string, reason: string, providerEnv?: string) {
  try {
    await db.transaction(async (tx) => {
      await tx.update(recipients).set({ status: "unknown", sendClaimedAt: null, ...(providerEnv ? { providerEnv } : {}) })
        .where(and(eq(recipients.id, recipientId), eq(recipients.status, "sending")));
      await tx.update(campaigns).set({ sendStatus: "paused", sendError: reason, updatedAt: Date.now() })
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending")));
      await tx.update(campaigns).set({ sendError: reason, updatedAt: Date.now() })
        .where(and(eq(campaigns.id, campaignId), inArray(campaigns.sendStatus, ["paused", "stopped"])));
    });
  } catch (error) {
    console.error("[campaign-send] Could not persist uncertain recipient state; lease recovery will handle it:", error);
  }
}

async function recoverStaleClaim(campaignId: string, recipient: typeof recipients.$inferSelect) {
  const reason = `Trạng thái gửi tới ${recipient.email} không được xác nhận trong thời hạn xử lý. Hãy đối soát provider trước khi gửi lại.`;
  try {
    await db.transaction(async (tx) => {
      await tx.update(recipients).set({ status: "unknown", sendClaimedAt: null })
        .where(and(eq(recipients.id, recipient.id), eq(recipients.status, "sending")));
      await tx.update(campaigns).set({ sendStatus: "paused", sendError: reason, updatedAt: Date.now() })
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.sendStatus, "sending")));
    });
  } catch (error) {
    console.error("[campaign-send] Stale claim recovery failed:", error);
  }
  return reason;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Thao tác gửi không hợp lệ" }, { status: 400 });
  await ensureDatabase();
  let campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const action = parsed.data.action;

  if (action === "select-provider") {
    if (campaign.sendStatus === "sending") return NextResponse.json({ error: "Hãy tạm dừng campaign trước khi đổi API provider." }, { status: 409 });
    const providerEnv = parsed.data.providerEnv || null;
    if (providerEnv && !(supportedProviderEnvs as readonly string[]).includes(providerEnv)) return NextResponse.json({ error: "API provider không hợp lệ." }, { status: 400 });
    if (providerEnv) {
      const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
      const configs = parseObject(settings?.providerConfigsJson);
      if (!isProviderConfigured(providerEnv) || !isProviderEnabled(configs, providerEnv)) return NextResponse.json({ error: "Provider chưa được cấu hình đầy đủ hoặc đang tắt." }, { status: 400 });
    }
    const selection = await client.execute({
      sql: "UPDATE campaigns SET selected_provider_env = ?, pending_provider_env = NULL, provider_switch_after = NULL, updated_at = ? WHERE id = ? AND send_status <> 'sending'",
      args: [providerEnv, Date.now(), id],
    });
    if (selection.rowsAffected !== 1) return NextResponse.json({ error: "Campaign vừa bắt đầu gửi hoặc không còn khả dụng. Hãy làm mới rồi thử lại." }, { status: 409 });
    campaign = await getCampaign(id);
    return NextResponse.json({ status: campaign?.sendStatus, selectedProviderEnv: campaign?.selectedProviderEnv || null });
  }

  if (action === "resolve-unknown") {
    if (campaign.sendStatus === "sending" || campaign.sendStatus === "completed" || campaign.sendStatus === "deleting") {
      return NextResponse.json({ error: "Chỉ có thể đối soát recipient khi campaign đang tạm dừng hoặc đã dừng." }, { status: 409 });
    }
    if (!parsed.data.resolution) return NextResponse.json({ error: "Chưa chọn cách xử lý recipient." }, { status: 400 });
    const current = await recipientAtCursor(id, campaign.sendCursor);
    if (!current || current.status !== "unknown") return NextResponse.json({ error: "Không còn recipient chưa xác định tại vị trí hiện tại. Hãy làm mới trạng thái campaign." }, { status: 409 });
    try {
      await db.transaction(async (tx) => {
        const changed = await tx.update(recipients).set(parsed.data.resolution === "sent"
          ? { status: "sent", sendClaimedAt: null, providerEnv: current.providerEnv || campaign.selectedProviderEnv || campaign.activeProviderEnv || null }
          : { status: "pending", sendClaimedAt: null })
          .where(and(eq(recipients.id, current.id), eq(recipients.status, "unknown")));
        if (changed.rowsAffected !== 1) throw new Error("RECIPIENT_STATE_CONFLICT");
        const campaignUpdate = parsed.data.resolution === "sent"
          ? tx.update(campaigns).set({
            sendCursor: campaign.sendCursor + 1,
            sendStatus: campaign.sendCursor + 1 >= campaign.recipientCount ? "completed" : campaign.sendStatus,
            sendError: null,
            updatedAt: Date.now(),
          })
          : tx.update(campaigns).set({ sendError: null, updatedAt: Date.now() });
        const saved = await campaignUpdate.where(and(eq(campaigns.id, id), eq(campaigns.sendCursor, campaign.sendCursor), inArray(campaigns.sendStatus, ["paused", "stopped"])));
        if (saved.rowsAffected !== 1) throw new Error("CAMPAIGN_STATE_CONFLICT");
      });
    } catch (error) {
      console.error("[campaign-send] Could not resolve unknown recipient:", error);
      return NextResponse.json({ error: "Không thể cập nhật trạng thái recipient. Hãy tải lại campaign rồi thử lại." }, { status: 409 });
    }
    const updated = await getCampaign(id);
    return updated ? responseFor(updated, { resolvedRecipient: current.email, resolution: parsed.data.resolution }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (action === "pause") {
    await client.execute({
      sql: `UPDATE campaigns SET send_status = 'paused', updated_at = ? WHERE id = ? AND send_status = 'sending'
        AND NOT EXISTS (SELECT 1 FROM recipients WHERE campaign_id = ? AND status = 'sending')`,
      args: [Date.now(), id, id],
    });
    campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.sendStatus === "sending") return NextResponse.json({ error: "Đang có email được xử lý. Hãy chờ hoàn tất rồi thử tạm dừng lại." }, { status: 409 });
    if (campaign.sendStatus === "deleting") return NextResponse.json({ error: "Campaign đang được xóa." }, { status: 409 });
    return responseFor(campaign);
  }
  if (action === "stop") {
    await client.execute({
      sql: `UPDATE campaigns SET send_status = 'stopped', updated_at = ? WHERE id = ?
        AND send_status IN ('draft', 'sending', 'paused', 'stopped')
        AND NOT EXISTS (SELECT 1 FROM recipients WHERE campaign_id = ? AND status = 'sending')`,
      args: [Date.now(), id, id],
    });
    campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.sendStatus === "sending") return NextResponse.json({ error: "Đang có email được xử lý. Hãy chờ hoàn tất rồi thử dừng lại." }, { status: 409 });
    if (campaign.sendStatus === "deleting") return NextResponse.json({ error: "Campaign đang được xóa." }, { status: 409 });
    return responseFor(campaign);
  }

  if (action === "start" || action === "resume") {
    if (campaign.sendStatus === "completed") return responseFor(campaign);
    if (campaign.sendCursor < campaign.recipientCount) {
      const current = await recipientAtCursor(id, campaign.sendCursor);
      if (current?.status === "unknown") {
        return NextResponse.json({ error: `Trạng thái gửi tới ${current.email} chưa xác định. Hãy đối soát với provider, sau đó chọn đã gửi hoặc chủ động gửi lại.`, unknownRecipient: { id: current.id, email: current.email, providerEnv: current.providerEnv || campaign.selectedProviderEnv || campaign.activeProviderEnv || null } }, { status: 409 });
      }
      if (current?.status === "sending") {
        if (!current.sendClaimedAt || Date.now() - current.sendClaimedAt >= CLAIM_LEASE_MS) {
          const reason = await recoverStaleClaim(id, current);
          return NextResponse.json({ error: reason, unknownRecipient: { id: current.id, email: current.email, providerEnv: current.providerEnv || campaign.selectedProviderEnv || campaign.activeProviderEnv || null } }, { status: 409 });
        }
        return responseFor(campaign, { delayMs: 3000, busyRecipient: current.email });
      }
      if (current?.status === "sent") {
        const nextCursor = campaign.sendCursor + 1;
        const recovered = await db.update(campaigns)
          .set({ sendCursor: nextCursor, sendStatus: nextCursor >= campaign.recipientCount ? "completed" : "sending", sendError: null, updatedAt: Date.now() })
          .where(and(eq(campaigns.id, id), eq(campaigns.sendCursor, campaign.sendCursor), inArray(campaigns.sendStatus, runnableStates)));
        if (!recovered.rowsAffected) return NextResponse.json({ error: "Campaign vừa thay đổi trạng thái; hãy làm mới rồi thử lại." }, { status: 409 });
        campaign = await getCampaign(id);
        return campaign ? responseFor(campaign, { recovered: true }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      if (current?.status === "failed") await db.update(recipients).set({ status: "pending", sendClaimedAt: null }).where(and(eq(recipients.id, current.id), eq(recipients.status, "failed")));
    }
    const started = await db.update(campaigns).set({ sendStatus: "sending", sendError: null, updatedAt: Date.now() })
      .where(and(eq(campaigns.id, id), inArray(campaigns.sendStatus, runnableStates)));
    if (!started.rowsAffected) {
      campaign = await getCampaign(id);
      if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      if (campaign.sendStatus === "sending") return responseFor(campaign);
      return NextResponse.json({ error: "Campaign đang được xóa hoặc trạng thái không cho phép gửi." }, { status: 409 });
    }
    campaign = await getCampaign(id);
    return campaign ? responseFor(campaign) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.sendStatus !== "sending") return responseFor(campaign);
  const recipient = await recipientAtCursor(id, campaign.sendCursor);
  if (!recipient) {
    await db.update(campaigns).set({ sendStatus: "completed", providerFailureEnv: null, providerFailureCount: 0, providerFailureStartCursor: null, sendError: null, updatedAt: Date.now() })
      .where(and(eq(campaigns.id, id), eq(campaigns.sendStatus, "sending")));
    campaign = await getCampaign(id);
    return campaign ? responseFor(campaign, { done: true }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (recipient.status === "sending") {
    if (!recipient.sendClaimedAt || Date.now() - recipient.sendClaimedAt >= CLAIM_LEASE_MS) {
      const reason = await recoverStaleClaim(id, recipient);
      campaign = await getCampaign(id);
      return NextResponse.json({ error: reason, status: campaign?.sendStatus }, { status: 409 });
    }
    return responseFor(campaign, { delayMs: 3000, busyRecipient: recipient.email });
  }
  if (recipient.status !== "pending") return NextResponse.json({ error: `Recipient ${recipient.email} cần được đối soát trước khi gửi tiếp.` }, { status: 409 });

  const claimedAt = Date.now();
  const claim = await client.execute({
    sql: `UPDATE recipients SET status = 'sending', send_claimed_at = ? WHERE id = ? AND campaign_id = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM campaigns WHERE id = ? AND send_status = 'sending')`,
    args: [claimedAt, recipient.id, id, id],
  });
  if (claim.rowsAffected !== 1) {
    const latest = await getCampaign(id);
    return latest ? responseFor(latest, { ...(latest.sendStatus === "sending" ? { delayMs: 1500, busyRecipient: recipient.email } : {}) }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    campaign = await getCampaign(id);
    if (!campaign || campaign.sendStatus !== "sending") {
      await releaseUnsentClaim(id, recipient.id, "Campaign được tạm dừng trước khi provider nhận email.");
      return campaign ? responseFor(campaign) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
    const configs = parseObject(settings?.providerConfigsJson);
    const usageDate = new Date().toISOString().slice(0, 10);
    const usageRows = await db.select().from(providerUsage).where(eq(providerUsage.usageDate, usageDate));
    const usage = Object.fromEntries(usageRows.map((item) => [item.providerEnv, item.sentCount]));
    const candidates = supportedProviderEnvs.filter((env) => (!campaign.selectedProviderEnv || env === campaign.selectedProviderEnv) && isProviderConfigured(env) && isProviderEnabled(configs, env)).sort((a, b) => {
      const aLimit = Number(configs[a]?.dailyLimit || 100);
      const bLimit = Number(configs[b]?.dailyLimit || 100);
      return (usage[a] || 0) / aLimit - (usage[b] || 0) / bLimit;
    });
    const available = candidates.filter((env) => hasProviderDailyCapacity(usage[env] || 0, configs[env]?.dailyLimit || 100));
    if (!available.length) {
      const reason = "Tất cả provider đã hết hạn mức cấu hình/ngày, đang tắt hoặc chưa cấu hình.";
      await recordProviderError(campaign.activeProviderEnv || "NO_PROVIDER", `campaign-blocked:${id}`, reason, recipient.email).catch((logError) => console.error("[campaign-send] Could not write blocked log:", logError));
      await releaseUnsentClaim(id, recipient.id, reason);
      campaign = await getCampaign(id);
      return campaign ? responseFor(campaign, { blocked: true }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const cursorBeforeSend = campaign.sendCursor;
    const lastSentRecipient = cursorBeforeSend > 0 ? await recipientAtCursor(id, cursorBeforeSend - 1) : undefined;
    const lastTriedProvider = campaign.activeProviderEnv || lastSentRecipient?.providerEnv || null;
    const preferredProvider = campaign.pendingProviderEnv && available.includes(campaign.pendingProviderEnv as typeof available[number])
      ? campaign.pendingProviderEnv
      : campaign.activeProviderEnv && available.includes(campaign.activeProviderEnv as typeof available[number]) ? campaign.activeProviderEnv
      : lastTriedProvider && available.includes(lastTriedProvider as typeof available[number]) ? lastTriedProvider : available[0];
    const orderedAvailable = [preferredProvider];
    if (campaign.providerFailureCount >= PROVIDER_FAILURE_THRESHOLD && campaign.providerFailureEnv) {
      const nextProvider = available.find((env) => env !== campaign.providerFailureEnv);
      const failureStart = campaign.providerFailureStartCursor ?? Math.max(0, cursorBeforeSend - campaign.providerFailureCount);
      if (!nextProvider) {
        await pauseForProviderFailureStreak(id, failureStart, campaign.providerFailureCount, campaign.providerFailureEnv, `${campaign.providerFailureEnv} đã lỗi ${campaign.providerFailureCount} email liên tiếp; chưa có provider khác khả dụng. Đã tạm dừng và giữ các email để thử lại.`, cursorBeforeSend, campaign.providerFailureCount);
        const pausedCampaign = await getCampaign(id);
        return pausedCampaign ? responseFor(pausedCampaign) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      const switchAfter = Date.now() + PROVIDER_SWITCH_DELAY_MS;
      await beginProviderSwitch(id, recipient.id, nextProvider, switchAfter, { startCursor: failureStart, count: campaign.providerFailureCount, fromProvider: campaign.providerFailureEnv, expectedCursor: cursorBeforeSend, expectedFailureCount: campaign.providerFailureCount });
      const latest = await getCampaign(id);
      return latest ? responseFor(latest, { delayMs: PROVIDER_SWITCH_DELAY_MS, providerSwitch: { from: campaign.providerFailureEnv, to: nextProvider, remainingMs: PROVIDER_SWITCH_DELAY_MS, failureCount: campaign.providerFailureCount } }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    for (const env of orderedAvailable) {
      let currentState;
      try { currentState = await getCampaign(id); }
      catch (error) {
        await releaseUnsentClaim(id, recipient.id, "Không đọc được trạng thái campaign trước khi gửi; chưa gọi provider.");
        console.error("[campaign-send] Could not recheck campaign before provider call:", error);
        return NextResponse.json({ error: "Không đọc được trạng thái campaign; chưa gửi email." }, { status: 503 });
      }
      if (!currentState || currentState.sendStatus !== "sending") {
        await releaseUnsentClaim(id, recipient.id, "Campaign được tạm dừng trước khi provider nhận email.");
        return currentState ? responseFor(currentState) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      const pendingSwitch = campaign.pendingProviderEnv === env ? campaign.providerSwitchAfter : null;
      if ((lastTriedProvider && env !== lastTriedProvider) || pendingSwitch) {
        if (pendingSwitch && pendingSwitch > Date.now()) {
          await beginProviderSwitch(id, recipient.id, env, pendingSwitch, undefined, cursorBeforeSend);
          return responseFor(campaign, { delayMs: pendingSwitch - Date.now(), providerSwitch: { from: lastTriedProvider, to: env, remainingMs: pendingSwitch - Date.now() } });
        }
        if (!(pendingSwitch && pendingSwitch <= Date.now())) {
          const switchAfter = Date.now() + PROVIDER_SWITCH_DELAY_MS;
          await beginProviderSwitch(id, recipient.id, env, switchAfter, undefined, cursorBeforeSend);
          const latest = await getCampaign(id);
          return latest ? responseFor(latest, { delayMs: PROVIDER_SWITCH_DELAY_MS, providerSwitch: { from: lastTriedProvider, to: env, remainingMs: PROVIDER_SWITCH_DELAY_MS } }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }
      }

      let reserved = false;
      try { reserved = await reserveProviderUsage(env, usageDate, configs[env]?.dailyLimit || 100); }
      catch (error) {
        await recordProviderError(env, `campaign-quota-check:${id}`, error, recipient.email).catch((logError) => console.error("[campaign-send] Could not write quota log:", logError));
        await releaseUnsentClaim(id, recipient.id, "Không đặt được quota provider; chưa gọi provider.");
        console.error("[campaign-send] Could not reserve provider quota:", error);
        return NextResponse.json({ error: "Không thể kiểm tra quota provider; chưa gửi email." }, { status: 503 });
      }
      if (!reserved) {
        const nextProvider = available.find((candidate) => candidate !== env);
        if (nextProvider) {
          const switchAfter = Date.now() + PROVIDER_SWITCH_DELAY_MS;
          await beginProviderSwitch(id, recipient.id, nextProvider, switchAfter, undefined, cursorBeforeSend);
          const latest = await getCampaign(id);
          return latest ? responseFor(latest, { delayMs: PROVIDER_SWITCH_DELAY_MS, providerSwitch: { from: env, to: nextProvider, remainingMs: PROVIDER_SWITCH_DELAY_MS } }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }
        const quotaError = `${env} đã hết hạn mức cấu hình/ngày và không còn provider khác khả dụng.`;
        await recordProviderError(env, `campaign-quota:${id}`, quotaError, recipient.email).catch((logError) => console.error("[campaign-send] Could not write quota log:", logError));
        await releaseUnsentClaim(id, recipient.id, quotaError);
        const latest = await getCampaign(id);
        return latest ? responseFor(latest) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      let messageId: string | undefined;
      try {
        messageId = await sendViaProvider(env, { to: recipient.email, subject: campaign.subject, html: campaign.htmlContent, text: campaign.textContent });
      } catch (error) {
        await releaseRejectedProviderUsage(env, usageDate, error).catch(() => undefined);
        if (!isDefinitiveProviderRejection(error)) {
          const reason = `${env}: kết quả giao thư chưa xác định; cần đối soát provider trước khi retry.`;
          await recordProviderError(env, `campaign-send-uncertain:${id}`, error, recipient.email).catch((logError) => console.error("[campaign-send] Could not write uncertain-send log:", logError));
          await markUnknownClaim(id, recipient.id, reason, env);
          const latestCampaign = await getCampaign(id).catch(() => undefined);
          return latestCampaign ? responseFor(latestCampaign, { uncertainRecipient: recipient.email }) : NextResponse.json({ error: reason }, { status: 503 });
        }
        const errorDetail = error instanceof Error ? error.message : "gửi thất bại";
        await recordProviderError(env, `campaign-send-rejected:${id}`, error, recipient.email).catch((logError) => console.error("[campaign-send] Could not write provider rejection log:", logError));
        const previousFailures = campaign.providerFailureEnv === env ? campaign.providerFailureCount : 0;
        const consecutiveFailures = previousFailures + 1;
        const failureStartCursor = previousFailures > 0 ? campaign.providerFailureStartCursor ?? cursorBeforeSend : cursorBeforeSend;
        if (consecutiveFailures >= PROVIDER_FAILURE_THRESHOLD) {
          const nextProvider = available.find((candidate) => candidate !== env);
          if (nextProvider) {
            const switchAfter = Date.now() + PROVIDER_SWITCH_DELAY_MS;
            await beginProviderSwitch(id, recipient.id, nextProvider, switchAfter, {
              startCursor: failureStartCursor,
              count: consecutiveFailures,
              fromProvider: env,
              expectedCursor: cursorBeforeSend,
              expectedFailureCount: previousFailures,
            });
            const latest = await getCampaign(id);
            return latest ? responseFor(latest, {
              delayMs: PROVIDER_SWITCH_DELAY_MS,
              providerSwitch: { from: env, to: nextProvider, remainingMs: PROVIDER_SWITCH_DELAY_MS, failureCount: consecutiveFailures, failureDetail: errorDetail },
            }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
          }
          await pauseForProviderFailureStreak(id, failureStartCursor, consecutiveFailures, env,
            `${PROVIDER_NAMES[env] || env} đã lỗi ${consecutiveFailures} email liên tiếp. Chưa có provider khác khả dụng; campaign đã tạm dừng và giữ các email để thử lại.`, cursorBeforeSend, previousFailures);
          const pausedCampaign = await getCampaign(id);
          return pausedCampaign ? responseFor(pausedCampaign, { failedRecipient: recipient.email, providerFailureCount: consecutiveFailures, providerFailure: { provider: env, count: consecutiveFailures, threshold: PROVIDER_FAILURE_THRESHOLD, recipient: recipient.email, detail: errorDetail } }) : NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        try {
          await db.transaction(async (tx) => {
            const failedRecipient = await tx.update(recipients).set({ status: "failed", sendClaimedAt: null, providerEnv: env })
              .where(and(eq(recipients.id, recipient.id), eq(recipients.status, "sending")));
            if (failedRecipient.rowsAffected !== 1) throw new Error("RECIPIENT_STATE_CONFLICT");
            const advanced = await tx.update(campaigns).set({
              sendCursor: cursorBeforeSend + 1,
              activeProviderEnv: env,
              providerFailureEnv: env,
              providerFailureCount: consecutiveFailures,
              providerFailureStartCursor: failureStartCursor,
              sendError: null,
              updatedAt: Date.now(),
            }).where(and(eq(campaigns.id, id), eq(campaigns.sendCursor, cursorBeforeSend), eq(campaigns.sendStatus, "sending")));
            if (advanced.rowsAffected !== 1) throw new Error("CAMPAIGN_STATE_CONFLICT");
          });
        } catch (persistError) {
          console.error("[campaign-send] Could not persist definite provider rejection:", persistError);
          await markUnknownClaim(id, recipient.id, "Provider đã từ chối email nhưng không lưu được trạng thái; cần đối soát trước khi tiếp tục.", env);
          const latest = await getCampaign(id).catch(() => undefined);
          return latest ? responseFor(latest, { uncertainRecipient: recipient.email }) : NextResponse.json({ error: "Không lưu được lỗi provider." }, { status: 503 });
        }
        const latest = await getCampaign(id).catch(() => undefined);
        return latest ? responseFor(latest, {
          delayMs: Number(configs[env]?.delaySeconds || 10) * 1000,
          providerFailure: { provider: env, count: consecutiveFailures, threshold: PROVIDER_FAILURE_THRESHOLD, recipient: recipient.email, detail: errorDetail },
        }) : NextResponse.json({ error: "Campaign đã lưu lỗi provider nhưng không đọc lại được trạng thái." }, { status: 503 });
      }

      try {
        await db.transaction(async (tx) => {
          const sentRecipient = await tx.update(recipients).set({ status: "sent", sendClaimedAt: null, providerEnv: env })
            .where(and(eq(recipients.id, recipient.id), eq(recipients.status, "sending")));
          if (sentRecipient.rowsAffected !== 1) throw new Error("RECIPIENT_STATE_CONFLICT");
          const advanced = await tx.update(campaigns)
            .set({ sendCursor: cursorBeforeSend + 1, pendingProviderEnv: null, providerSwitchAfter: null, activeProviderEnv: env, providerFailureEnv: null, providerFailureCount: 0, providerFailureStartCursor: null, sendError: null, updatedAt: Date.now() })
            .where(and(eq(campaigns.id, id), eq(campaigns.sendCursor, cursorBeforeSend), eq(campaigns.sendStatus, "sending")));
          if (advanced.rowsAffected !== 1) throw new Error("CAMPAIGN_STATE_CONFLICT");
        });
      } catch (error) {
        console.error("[campaign-send] Provider accepted email but state persistence failed:", error);
        let storedRecipient: { status: string } | undefined;
        try { storedRecipient = (await db.select({ status: recipients.status }).from(recipients).where(eq(recipients.id, recipient.id)).limit(1))[0]; }
        catch (readError) { console.error("[campaign-send] Could not read recipient after transaction error:", readError); }
        const latestCampaign = await getCampaign(id).catch((readError) => { console.error("[campaign-send] Could not read campaign after transaction error:", readError); return undefined; });
        if (storedRecipient?.status === "sent" && latestCampaign && latestCampaign.sendCursor > cursorBeforeSend) {
          return responseFor(latestCampaign, { provider: env, recipient: recipient.email, messageId });
        }
        await markUnknownClaim(id, recipient.id, "Provider có thể đã nhận email nhưng trạng thái chưa lưu được; đối soát trước khi tiếp tục.", env);
        const finalCampaign = await getCampaign(id).catch(() => undefined);
        return NextResponse.json({ error: "Provider có thể đã nhận email nhưng trạng thái chưa lưu được. Đối soát email trước khi tiếp tục campaign.", status: finalCampaign?.sendStatus }, { status: 503 });
      }

      const updatedCampaign = await getCampaign(id).catch((error) => { console.error("[campaign-send] Could not read campaign after successful send:", error); return undefined; });
      return updatedCampaign ? responseFor(updatedCampaign, { provider: env, recipient: recipient.email, messageId, delayMs: Number(configs[env]?.delaySeconds || 10) * 1000 })
        : NextResponse.json({ error: "Email đã được gửi; không đọc lại được trạng thái campaign. Làm mới để xác nhận tiến độ." }, { status: 503 });
    }

    await releaseUnsentClaim(id, recipient.id, "Không có provider khả dụng; chưa gọi API gửi email.");
    const noProviderCampaign = await getCampaign(id).catch(() => undefined);
    return noProviderCampaign ? responseFor(noProviderCampaign) : NextResponse.json({ error: "Không có provider khả dụng." }, { status: 503 });
  } catch (error) {
    // No provider request has been sent on this path; release the claim and pause safely.
    console.error("[campaign-send] Failed before provider submission:", error);
    await releaseUnsentClaim(id, recipient.id, "Lỗi nội bộ trước khi gọi provider; email chưa được gửi.");
    return NextResponse.json({ error: "Không thể xử lý recipient; chưa gửi email." }, { status: 503 });
  }
}
