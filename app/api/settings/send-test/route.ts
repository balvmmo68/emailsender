import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { sendViaProvider, supportedProviderEnvs } from "@/lib/email-providers";
import { recordProviderError } from "@/lib/provider-error-log";
import { reserveProviderUsage, releaseRejectedProviderUsage } from "@/lib/provider-quota";
import { db, ensureDatabase } from "@/db/client";
import { emailSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";

const bodySchema = z.object({ env: z.enum(supportedProviderEnvs), to: z.string().email() });

function parseObject(value: string | null | undefined): Record<string, { dailyLimit?: number }> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const input = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) {
    const providerEnv = input && typeof input.env === "string" && (supportedProviderEnvs as readonly string[]).includes(input.env) ? input.env : undefined;
    if (providerEnv) await recordProviderError(providerEnv, "send-test-validation", parsed.error.issues.map((issue) => issue.message).join("; "), typeof input.to === "string" ? input.to : undefined).catch(() => undefined);
    return NextResponse.json({ error: "Provider hoặc email nhận không hợp lệ" }, { status: 400 });
  }

  const { env, to } = parsed.data;
  await ensureDatabase();
  const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
  const configs = parseObject(settings?.providerConfigsJson);
  const dailyLimit = configs[env]?.dailyLimit || 100;
  const usageDate = new Date().toISOString().slice(0, 10);
  const reserved = await reserveProviderUsage(env, usageDate, dailyLimit);
  if (!reserved) return NextResponse.json({ error: "Provider đã chạm ngưỡng gửi trong ngày." }, { status: 429 });

  try {
    const id = await sendViaProvider(env, {
      to,
      subject: "[TEST] Kiểm tra cấu hình gửi email",
      html: `<p>Đây là email test từ hệ thống Sendroom.</p><p>Provider: <strong>${env}</strong></p>`,
      text: `Đây là email test từ hệ thống Sendroom. Provider: ${env}`,
    });
    return NextResponse.json({ ok: true, id, provider: env, to });
  } catch (error) {
    await releaseRejectedProviderUsage(env, usageDate, error).catch(() => undefined);
    await recordProviderError(env, "send-test", error, to).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gửi email test thất bại" }, { status: 502 });
  }
}
