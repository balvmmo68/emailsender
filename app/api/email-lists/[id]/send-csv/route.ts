import { NextResponse } from "next/server";
import { Resend } from "resend";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts, emailLists } from "@/db/schema";
import { rejectCrossOrigin } from "@/lib/request-security";

function csvCell(value: string | null | undefined) {
  const text = value || "";
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilename(subject: string) {
  const slug = subject.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${slug || "email-list"}.csv`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;

  const recipient = process.env.EMAIL_LIST_EXPORT_TO?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: "Thiếu hoặc sai email nhận. Hãy cấu hình EMAIL_LIST_EXPORT_TO trong Vercel rồi deploy lại." }, { status: 503 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Chưa cấu hình RESEND_API_KEY để gửi file CSV." }, { status: 503 });

  try {
    await ensureDatabase();
    const { id } = await params;
    const [list] = await db.select({ id: emailLists.id, subject: emailLists.subject }).from(emailLists).where(eq(emailLists.id, id)).limit(1);
    if (!list) return NextResponse.json({ error: "Chủ đề danh sách không tồn tại hoặc đã bị xóa." }, { status: 404 });

    const contacts = await db.select({ email: emailListContacts.email, name: emailListContacts.name })
      .from(emailListContacts).where(eq(emailListContacts.listId, id)).orderBy(asc(emailListContacts.email));
    if (!contacts.length) return NextResponse.json({ error: "Danh sách hiện không có email để gửi." }, { status: 400 });

    const csv = [
      "email,name",
      ...contacts.map((contact) => `${csvCell(contact.email)},${csvCell(contact.name)}`),
    ].join("\r\n");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: recipient,
      subject: `CSV email list: ${list.subject}`,
      text: `Attached is the CSV export for “${list.subject}”. It contains ${contacts.length} contacts.`,
      attachments: [{ filename: safeFilename(list.subject), content: Buffer.from(`\uFEFF${csv}`, "utf8"), contentType: "text/csv; charset=utf-8" }],
    });
    if (error) {
      console.error("[email-list-export] Resend rejected CSV delivery:", error.message);
      return NextResponse.json({ error: `Không thể gửi file CSV qua Resend: ${error.message}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentCount: contacts.length, id: data?.id });
  } catch (error) {
    console.error("[email-list-export] Không thể gửi CSV:", error);
    return NextResponse.json({ error: "Không thể tạo hoặc gửi file CSV. Vui lòng thử lại." }, { status: 500 });
  }
}
