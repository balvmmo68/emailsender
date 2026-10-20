import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailSettings, providerUsage } from "@/db/schema";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";
import { providerDailyAllowance } from "@/lib/provider-quota";
import { missingProviderEnvVariables } from "@/lib/email-providers";

const keyDefinitions = [
  { provider: "Resend", url: "https://resend.com", env: "RESEND_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
  { provider: "Brevo", url: "https://www.brevo.com", env: "BREVO_API_KEY", freeDaily: "300", freeMonthly: "Không giới hạn theo tháng" },
  { provider: "Mailjet", url: "https://www.mailjet.com", env: "MAILJET_API_KEY", freeDaily: "200", freeMonthly: "6.000" },
  { provider: "Mailtrap Email Sending", url: "https://mailtrap.io", env: "MAILTRAP_API_TOKEN", freeDaily: "150", freeMonthly: "4.000" },
  { provider: "Mailgun", url: "https://www.mailgun.com", env: "MAILGUN_API_KEY", freeDaily: "100", freeMonthly: "Không giới hạn theo tháng" },
  { provider: "Postmark", url: "https://postmarkapp.com", env: "POSTMARK_SERVER_TOKEN", freeDaily: "Không nêu", freeMonthly: "100" },
  { provider: "MailerSend", url: "https://www.mailersend.com", env: "MAILERSEND_API_TOKEN", freeDaily: "Không nêu", freeMonthly: "500" },
  { provider: "SMTP2GO", url: "https://www.smtp2go.com", env: "SMTP2GO_API_KEY", freeDaily: "Không nêu", freeMonthly: "1.000" },
  { provider: "Mailofly", url: "https://mailofly.com", env: "MAILOFLY_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
  { provider: "Lettr", url: "https://lettr.com", env: "LETTR_API_KEY", freeDaily: "Không nêu", freeMonthly: "3.000" },
  { provider: "AgentMail", url: "https://agentmail.to", env: "AGENTMAIL_API_KEY", freeDaily: "100", freeMonthly: "3.000" },
];

const providerConfigSchema = z.object({
  delaySeconds: z.number().int().min(1).max(86400),
  dailyLimit: z.number().int().min(1).max(1000000),
  providerLimit: z.string().trim().max(120),
  enabled: z.boolean().default(true),
});
const knownProviderEnvs = new Set(keyDefinitions.map(({ env }) => env));
const settingsSchema = z.object({
  activeProvider: z.string().regex(/^[A-Z0-9_]+$/),
  testRecipient: z.union([z.literal(""), z.string().email()]),
  providerConfigs: z.record(z.string().regex(/^[A-Z0-9_]+$/), providerConfigSchema),
}).superRefine((input, context) => {
  if (!knownProviderEnvs.has(input.activeProvider)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["activeProvider"], message: "Provider không hợp lệ" });
  for (const env of Object.keys(input.providerConfigs)) {
    if (!knownProviderEnvs.has(env)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["providerConfigs", env], message: "Provider không được hỗ trợ" });
  }
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
      enabled: value?.enabled !== false,
    } satisfies ProviderConfig];
  }));
}

function getKeyMetadata(row: { providerConfigsJson?: string | null; providerLimitsJson?: string | null } | undefined, usage: Record<string, number>) {
  const configs = getProviderConfigs(row);
  return keyDefinitions.map((definition) => {
    const missingVariables = missingProviderEnvVariables(definition.env);
    return {
      ...definition,
      configured: missingVariables.length === 0,
      missingVariables,
      config: configs[definition.env],
      usedToday: usage[definition.env] || 0,
      rotationThreshold: providerDailyAllowance(configs[definition.env].dailyLimit),
    };
  });
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
    settings: { activeProvider: "RESEND_API_KEY", testRecipient: row?.testRecipient || "", providerConfigs },
    keys: getKeyMetadata(row, usage),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  try {
    const input = settingsSchema.parse(await req.json());
    await ensureDatabase();
    const providerLimitsJson = JSON.stringify(Object.fromEntries(Object.entries(input.providerConfigs).map(([env, config]) => [env, config.providerLimit])));
    const providerConfigsJson = JSON.stringify(input.providerConfigs);
    await db.insert(emailSettings).values({ id: 1, delaySeconds: 10, dailyLimit: 100, providerLimitsJson, providerConfigsJson, testRecipient: input.testRecipient, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: emailSettings.id, set: { providerLimitsJson, providerConfigsJson, testRecipient: input.testRecipient, updatedAt: Date.now() } });
    return NextResponse.json({ ok: true, settings: input });
  } catch {
    return NextResponse.json({ error: "Giá trị cấu hình provider không hợp lệ" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const parsed = z.object({
    env: z.string().refine((env) => knownProviderEnvs.has(env), "Provider không được hỗ trợ"),
    enabled: z.boolean(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Trạng thái provider không hợp lệ" }, { status: 400 });

  try {
    await ensureDatabase();
    await db.transaction(async (tx) => {
      const row = (await tx.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
      const providerConfigs = parseJson(row?.providerConfigsJson);
      const current = providerConfigs[parsed.data.env] && typeof providerConfigs[parsed.data.env] === "object"
        ? providerConfigs[parsed.data.env] as Partial<ProviderConfig>
        : {};
      providerConfigs[parsed.data.env] = {
        delaySeconds: current.delaySeconds || 10,
        dailyLimit: current.dailyLimit || 100,
        providerLimit: current.providerLimit || "",
        enabled: parsed.data.enabled,
      } satisfies ProviderConfig;
      const providerConfigsJson = JSON.stringify(providerConfigs);
      await tx.insert(emailSettings).values({
        id: 1,
        delaySeconds: row?.delaySeconds || 10,
        dailyLimit: row?.dailyLimit || 100,
        providerLimitsJson: row?.providerLimitsJson || "{}",
        providerConfigsJson,
        testRecipient: row?.testRecipient || "",
        updatedAt: Date.now(),
      }).onConflictDoUpdate({
        target: emailSettings.id,
        set: { providerConfigsJson, updatedAt: Date.now() },
      });
    });
    return NextResponse.json({ ok: true, env: parsed.data.env, enabled: parsed.data.enabled });
  } catch (error) {
    console.error("[settings] Could not update provider enabled state:", error);
    return NextResponse.json({ error: "Không thể lưu trạng thái provider." }, { status: 500 });
  }
}
