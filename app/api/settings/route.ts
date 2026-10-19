import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailSettings } from "@/db/schema";
import { z } from "zod";

const settingsSchema = z.object({
  delaySeconds: z.number().int().min(1).max(86400),
  dailyLimit: z.number().int().min(1).max(1000000),
});

const keyDefinitions = [
  { provider: "Resend", env: "RESEND_API_KEY" },
  { provider: "SendGrid", env: "SENDGRID_API_KEY" },
  { provider: "Mailgun", env: "MAILGUN_API_KEY" },
  { provider: "Postmark", env: "POSTMARK_SERVER_TOKEN" },
  { provider: "Amazon SES", env: "AWS_ACCESS_KEY_ID" },
];

function getKeyMetadata() {
  return keyDefinitions.map(({ provider, env }) => ({
    provider,
    env,
    configured: Boolean(process.env[env]),
    providerLimit: "Chưa xác định — kiểm tra dashboard nhà cung cấp",
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
  const settings = rows[0] ?? { delaySeconds: 10, dailyLimit: 100 };
  return NextResponse.json({ settings, keys: getKeyMetadata() });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = settingsSchema.parse(await req.json());
    await ensureDatabase();
    await db.insert(emailSettings).values({ id: 1, ...input, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: emailSettings.id, set: { ...input, updatedAt: Date.now() } });
    return NextResponse.json({ ok: true, settings: input });
  } catch {
    return NextResponse.json({ error: "Giá trị cấu hình không hợp lệ" }, { status: 400 });
  }
}
