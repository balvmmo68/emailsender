import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { sendViaProvider } from "@/lib/email-providers";
import { recordProviderError } from "@/lib/provider-error-log";
import { z } from "zod";

const bodySchema = z.object({
  env: z.enum(["RESEND_API_KEY", "BREVO_API_KEY", "MAILGUN_API_KEY", "POSTMARK_SERVER_TOKEN", "MAILERSEND_API_TOKEN", "SMTP2GO_API_KEY"]),
  to: z.string().email(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Provider hoặc email nhận không hợp lệ" }, { status: 400 });
  try {
    const id = await sendViaProvider(parsed.data.env, {
      to: parsed.data.to,
      subject: "[TEST] Kiểm tra cấu hình gửi email",
      html: `<p>Đây là email test từ hệ thống Sendroom.</p><p>Provider: <strong>${parsed.data.env}</strong></p>`,
      text: `Đây là email test từ hệ thống Sendroom. Provider: ${parsed.data.env}`,
    });
    return NextResponse.json({ ok: true, id, provider: parsed.data.env, to: parsed.data.to });
  } catch (error) {
    await recordProviderError(parsed.data.env, "send-test", error, parsed.data.to).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gửi email test thất bại" }, { status: 502 });
  }
}
