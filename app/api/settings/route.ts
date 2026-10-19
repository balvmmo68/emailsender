import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailSettings, providerUsage } from "@/db/schema";
import { z } from "zod";

const keyDefinitions = [
  { provider: "Resend", env: "RESEND_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
  { provider: "Brevo", env: "BREVO_API_KEY", freeDaily: "300", freeMonthly: "Không giới hạn theo tháng" },
  { provider: "Mailjet", env: "MAILJET_API_KEY", freeDaily: "200", freeMonthly: "6.000" },
  { provider: "Mailtrap Email Sending", env: "MAILTRAP_API_TOKEN", freeDaily: "150", freeMonthly: "4.000" },
  { provider: "Mailgun", env: "MAILGUN_API_KEY", freeDaily: "100", freeMonthly: "Không giới hạn theo tháng" },
  { provider: "Postmark", env: "POSTMARK_SERVER_TOKEN", freeDaily: "Không nêu", freeMonthly: "100" },
  { provider: "MailerSend", env: "MAILERSEND_API_TOKEN", freeDaily: "Không nêu", freeMonthly: "500" },
  { provider: "SMTP2GO", env: "SMTP2GO_API_KEY", freeDaily: "Không nêu", freeMonthly: "1.000" },
  { provider: "Mailofly", env: "MAILOFLY_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
  { provider: "Lettr", env: "LETTR_API_KEY", freeDaily: "Không nêu", freeMonthly: "3.000" },
  { provider: "AgentMail", env: "AGENTMAIL_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
];

const providerConfigSchema = z.object({
  delaySeconds: z.number().int().min(1).max(86400),
  dailyLimit: z.number().int().min(1).max(1000000),
  providerLimit: z.string().trim().max(120),
});
const settingsSchema = z.object({
  activeProvider: z.string().regex(/^[A-Z0-9_]+$/),
  providerConfigs: z.record(z.string().regex(/^[A-Z0-9_]+$/), providerConfigSchema),
});

type ProviderConfig = z.infer<typeof providerConfigSchema>;

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getProviderConfigs(row?: { providerConfigsJson?: string | null; providerLimitsJson?: string | null }) {
  const stored = parseJson(row?.providerConfigsJson);
  const legacyLimits = parseJson(row?.providerLimitsJson) as Record<string, unknown>;
  return Object.fromEntries(keyDefinitions.map(({ env }) => {
    const value = stored[env] as Partial<ProviderConfig> | undefined;
    return [env, {
      delaySeconds: value?.delaySeconds || 10,
      dailyLimit: value?.dailyLimit || 100,
      providerLimit: value?.providerLimit || String(legacyLimits[env] || ""),
    } satisfies ProviderConfig];
  }));
}

function getKeyMetadata(row: { providerConfigsJson?: string | null; providerLimitsJson?: string | null } | undefined, usage: Record<string, number>) {
  const configs = getProviderConfigs(row);
  return keyDefinitions.map((definition) => ({
    ...definition,
    configured: Boolean(process.env[definition.env]),
    config: configs[definition.env],
    usedToday: usage[definition.env] || 0,
    rotationThreshold: Math.floor(configs[definition.env].dailyLimit * 0.9),
  }));
}

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email) ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const row = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
  const providerConfigs = getProviderConfigs(row);
  const usageRows = await db.select().from(providerUsage).where(eq(providerUsage.usageDate, new Date().toISOString().slice(0, 10)));
  const usage = Object.fromEntries(usageRows.map((item) => [item.providerEnv, item.sentCount]));
  return NextResponse.json({
    settings: { activeProvider: "RESEND_API_KEY", providerConfigs },
    keys: getKeyMetadata(row, usage),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = settingsSchema.parse(await req.json());
    await ensureDatabase();
    const providerLimitsJson = JSON.stringify(Object.fromEntries(Object.entries(input.providerConfigs).map(([env, config]) => [env, config.providerLimit])));
    const providerConfigsJson = JSON.stringify(input.providerConfigs);
    await db.insert(emailSettings).values({ id: 1, delaySeconds: 10, dailyLimit: 100, providerLimitsJson, providerConfigsJson, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: emailSettings.id, set: { providerLimitsJson, providerConfigsJson, updatedAt: Date.now() } });
    return NextResponse.json({ ok: true, settings: input });
  } catch {
    return NextResponse.json({ error: "Giá trị cấu hình provider không hợp lệ" }, { status: 400 });
  }
}
