import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { client, ensureDatabase } from "@/db/client";
import { rejectCrossOrigin } from "@/lib/request-security";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên.").max(120),
  email: z.string().trim().email("Email chưa đúng định dạng.").max(254),
  consent: z.literal(true, { errorMap: () => ({ message: "Vui lòng xác nhận đồng ý nhận bản tin." }) }),
  website: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Thông tin đăng ký chưa hợp lệ." }, { status: 400 });
  }

  // Honeypot: quietly acknowledge bot submissions without storing them.
  if (parsed.data.website) return NextResponse.json({ ok: true });

  try {
    await ensureDatabase();
    await client.execute({
      sql: `INSERT OR IGNORE INTO email_list_contacts (id, list_id, email, name, created_at)
        VALUES (?, 'default-newsletters', ?, ?, ?)`,
      args: [randomUUID(), parsed.data.email.toLowerCase(), parsed.data.name, Date.now()],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[newsletter] Could not save signup:", error);
    return NextResponse.json({ error: "Đăng ký chưa lưu được. Vui lòng thử lại sau." }, { status: 500 });
  }
}
