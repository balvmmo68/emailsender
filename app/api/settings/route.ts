import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailSettings } from "@/db/schema";
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

const settingsSchema = z.object({
  delaySeconds: z.number().int().min(1).max(86400),
  dailyLimit: z.number().int().min(1).max(1000000),
  providerLimits: z.record(z.string().regex(/^[A-Z0-9_]+$/), z.string().trim().max(120)),
});

function parseProviderLimits(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getKeyMetadata(providerLimits: Record<string, string>) {
  return keyDefinitions.map(({ provider, env }) => ({
    provider,
    env,
    configured: Boolean(process.env[env]),
    providerLimit: providerLimits[env] || "Chưa xác định — nhập hạn mức thủ công",
    freeDaily: keyDefinitions.find((item) => item.env === env)?.freeDaily || "Không nêu",
    freeMonthly: keyDefinitions.find((item) => item.env === env)?.freeMonthly || "Không nêu",
  }));
}

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email) ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const rows = await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1);
  const row = rows[0];
  const providerLimits = parseProviderLimits(row?.providerLimitsJson);
  return NextResponse.json({
    settings: { delaySeconds: row?.delaySeconds ?? 10, dailyLimit: row?.dailyLimit ?? 100, providerLimits },
    keys: getKeyMetadata(providerLimits),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = settingsSchema.parse(await req.json());
    await ensureDatabase();
    const providerLimitsJson = JSON.stringify(input.providerLimits);
    await db.insert(emailSettings).values({ id: 1, delaySeconds: input.delaySeconds, dailyLimit: input.dailyLimit, providerLimitsJson, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: emailSettings.id, set: { delaySeconds: input.delaySeconds, dailyLimit: input.dailyLimit, providerLimitsJson, updatedAt: Date.now() } });
    return NextResponse.json({ ok: true, settings: input });
  } catch {
    return NextResponse.json({ error: "Giá trị cấu hình không hợp lệ" }, { status: 400 });
  }
}
