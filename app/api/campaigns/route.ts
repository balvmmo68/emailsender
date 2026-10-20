import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, emailListContacts, emailLists, recipients } from "@/db/schema";
import { count, desc, like, or } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";

const schema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  html: z.string().max(200000),
  text: z.string().max(200000),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDatabase();
    const params = new URL(req.url).searchParams;
    const search = (params.get("search") || "").trim().slice(0, 120);
    const requestedPage = Number.parseInt(params.get("page") || "1", 10);
    const pageSize = 10;
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const where = search ? or(like(campaigns.name, `%${search}%`), like(campaigns.subject, `%${search}%`)) : undefined;
    const [countRow] = await db.select({ value: count() }).from(campaigns).where(where);
    const total = Number(countRow?.value || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const rows = await db.select().from(campaigns).where(where).orderBy(desc(campaigns.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);

    return NextResponse.json({ campaigns: rows, page: currentPage, pageSize, total, totalPages });
  } catch (error) {
    console.error("[campaigns] Không thể đọc danh sách:", error);
    return NextResponse.json({ error: "Không thể tải danh sách campaigns từ Turso." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  try {
    await ensureDatabase();
    const form = await req.formData();
    const parsed = schema.parse({ name: form.get("name"), subject: form.get("subject"), html: form.get("html"), text: form.get("text") });
    const listId = form.get("listId");
    if (typeof listId !== "string" || !listId) return NextResponse.json({ error: "Vui lòng chọn chủ đề danh sách email." }, { status: 400 });
    const [emailList] = await db.select({ id: emailLists.id }).from(emailLists).where(eq(emailLists.id, listId)).limit(1);
    if (!emailList) return NextResponse.json({ error: "Chủ đề danh sách email không tồn tại. Hãy làm mới và chọn lại." }, { status: 404 });
    const contacts = await db.select({ email: emailListContacts.email, name: emailListContacts.name })
      .from(emailListContacts).where(eq(emailListContacts.listId, listId)).orderBy(desc(emailListContacts.createdAt));
    if (!contacts.length) return NextResponse.json({ error: "Chủ đề này chưa có email. Hãy chọn danh sách có email." }, { status: 400 });

    const id = randomUUID();
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.insert(campaigns).values({ id, name: parsed.name, subject: parsed.subject, htmlContent: parsed.html, textContent: parsed.text, recipientCount: contacts.length, createdAt: now, updatedAt: now });
      for (let offset = 0; offset < contacts.length; offset += 100) {
        await tx.insert(recipients).values(contacts.slice(offset, offset + 100).map((contact) => ({
          id: randomUUID(), campaignId: id, email: contact.email, name: contact.name,
          variablesJson: JSON.stringify({ email: contact.email, name: contact.name || "" }), status: "pending", createdAt: now,
        })));
      }
    });
    return NextResponse.json({ id, count: contacts.length });
  } catch (error) {
    console.error("[campaigns] Không thể tạo campaign:", error);
    return NextResponse.json({ error: "Không thể tạo campaign. Kiểm tra danh sách email đã chọn và kết nối Turso." }, { status: 500 });
  }
}
