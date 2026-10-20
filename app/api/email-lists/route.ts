import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { count, desc, eq, like, or } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts, emailLists } from "@/db/schema";

async function isAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureDatabase();
    const params = new URL(req.url).searchParams;
    const search = (params.get("search") || "").trim().slice(0, 160);
    const requestedPage = Number.parseInt(params.get("page") || "1", 10);
    const pageSize = 25;
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const where = search
      ? or(like(emailListContacts.email, `%${search}%`), like(emailListContacts.name, `%${search}%`), like(emailLists.subject, `%${search}%`))
      : undefined;
    const [countRow] = await db.select({ value: count() }).from(emailListContacts).innerJoin(emailLists, eq(emailListContacts.listId, emailLists.id)).where(where);
    const total = Number(countRow?.value || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const contacts = await db.select({
      id: emailListContacts.id,
      listId: emailListContacts.listId,
      email: emailListContacts.email,
      name: emailListContacts.name,
      createdAt: emailListContacts.createdAt,
      subject: emailLists.subject,
    }).from(emailListContacts).innerJoin(emailLists, eq(emailListContacts.listId, emailLists.id)).where(where)
      .orderBy(desc(emailListContacts.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);
    return NextResponse.json({ contacts, page: currentPage, pageSize, total, totalPages });
  } catch (error) {
    console.error("[email-lists] Không thể tải email từ Turso:", error);
    return NextResponse.json({ error: "Không thể tải danh sách email từ Turso." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureDatabase();
    const form = await req.formData();
    const subject = String(form.get("subject") || "").trim();
    const file = form.get("file");
    if (!subject || subject.length > 120) return NextResponse.json({ error: "Chủ đề bắt buộc và tối đa 120 ký tự." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file CSV." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "CSV tối đa 5MB." }, { status: 400 });

    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });
    const rows = parsed.data;
    const emailKey = Object.keys(rows[0] || {}).find((key) => key === "email");
    if (!emailKey) return NextResponse.json({ error: "CSV phải có cột email." }, { status: 400 });

    const unique = new Map<string, { email: string; name: string | null }>();
    for (const row of rows) {
      const email = (row[emailKey] || "").trim().toLowerCase();
      if (/^\S+@\S+\.\S+$/.test(email) && !unique.has(email)) unique.set(email, { email, name: row.name?.trim() || null });
    }
    const contacts = Array.from(unique.values()).slice(0, 10000);
    if (!contacts.length) return NextResponse.json({ error: "CSV không có email hợp lệ." }, { status: 400 });

    const listId = randomUUID();
    const now = Date.now();
    await db.insert(emailLists).values({ id: listId, subject, createdAt: now });
    for (let offset = 0; offset < contacts.length; offset += 100) {
      await db.insert(emailListContacts).values(contacts.slice(offset, offset + 100).map((contact) => ({
        id: randomUUID(), listId, email: contact.email, name: contact.name, createdAt: now,
      })));
    }
    return NextResponse.json({ ok: true, listId, imported: contacts.length, skipped: rows.length - contacts.length });
  } catch (error) {
    console.error("[email-lists] Không thể nhập CSV vào Turso:", error);
    return NextResponse.json({ error: "Không thể lưu email vào Turso. Vui lòng thử lại." }, { status: 500 });
  }
}
