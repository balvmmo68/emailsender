import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts, emailLists } from "@/db/schema";
import { rejectCrossOrigin } from "@/lib/request-security";

async function isAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

async function readCsv(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) throw new Error("Vui lòng chọn file CSV.");
  if (file.size > 5 * 1024 * 1024) throw new Error("CSV tối đa 5MB.");

  const parsed = Papa.parse<Record<string, string>>(await file.text(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  if (parsed.errors.length) {
    throw new Error(`CSV có ${parsed.errors.length} lỗi cấu trúc. Hãy sửa file rồi tải lại để tránh cập nhật thiếu dữ liệu.`);
  }
  const emailKey = Object.keys(parsed.data[0] || {}).find((key) => key === "email");
  if (!emailKey) throw new Error("CSV phải có cột email.");

  const unique = new Map<string, { email: string; name: string | null }>();
  const invalidSamples: Array<{ row: number; email: string }> = [];
  let invalidCount = 0;
  let duplicateCount = 0;
  parsed.data.forEach((row, index) => {
    const email = (row[emailKey] || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      invalidCount += 1;
      if (invalidSamples.length < 20) invalidSamples.push({ row: index + 2, email });
      return;
    }
    if (unique.has(email)) {
      duplicateCount += 1;
      return;
    }
    unique.set(email, { email, name: row.name?.trim() || null });
  });

  const contacts = Array.from(unique.values());
  if (contacts.length > 10000) throw new Error("CSV có hơn 10.000 email hợp lệ duy nhất. Hãy chia danh sách thành các file nhỏ hơn.");
  if (!contacts.length) throw new Error("CSV không có email hợp lệ. Danh sách cũ chưa bị thay đổi.");
  return { contacts, invalidCount, duplicateCount, invalidSamples, totalRows: parsed.data.length };
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
    const listId = params.get("listId");

    if (listId) {
      const [list] = await db.select({ id: emailLists.id, subject: emailLists.subject, createdAt: emailLists.createdAt }).from(emailLists).where(eq(emailLists.id, listId)).limit(1);
      if (!list) return NextResponse.json({ error: "Không tìm thấy chủ đề danh sách." }, { status: 404 });
      const contactSearch = search ? or(like(emailListContacts.email, `%${search}%`), like(emailListContacts.name, `%${search}%`)) : undefined;
      const where = contactSearch ? and(eq(emailListContacts.listId, listId), contactSearch) : eq(emailListContacts.listId, listId);
      const [countRow] = await db.select({ value: count() }).from(emailListContacts).where(where);
      const total = Number(countRow?.value || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(page, totalPages);
      const contacts = await db.select({ id: emailListContacts.id, email: emailListContacts.email, name: emailListContacts.name, createdAt: emailListContacts.createdAt })
        .from(emailListContacts).where(where).orderBy(desc(emailListContacts.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);
      return NextResponse.json({ list, contacts, page: currentPage, pageSize, total, totalPages });
    }

    if (params.get("forSelect") === "1") {
      const lists = await db.select({ id: emailLists.id, subject: emailLists.subject, createdAt: emailLists.createdAt, emailCount: count(emailListContacts.id) })
        .from(emailLists).leftJoin(emailListContacts, eq(emailListContacts.listId, emailLists.id))
        .groupBy(emailLists.id).orderBy(desc(emailLists.createdAt));
      return NextResponse.json({ lists });
    }

    const listSearch = search ? like(emailLists.subject, `%${search}%`) : undefined;
    const [countRow] = await db.select({ value: count() }).from(emailLists).where(listSearch);
    const total = Number(countRow?.value || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const lists = await db.select({ id: emailLists.id, subject: emailLists.subject, createdAt: emailLists.createdAt, emailCount: count(emailListContacts.id) })
      .from(emailLists).leftJoin(emailListContacts, eq(emailListContacts.listId, emailLists.id)).where(listSearch)
      .groupBy(emailLists.id).orderBy(desc(emailLists.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);
    return NextResponse.json({ lists, page: currentPage, pageSize, total, totalPages });
  } catch (error) {
    console.error("[email-lists] Không thể tải email từ Turso:", error);
    return NextResponse.json({ error: "Không thể tải dữ liệu email từ Turso." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  try {
    await ensureDatabase();
    const form = await req.formData();
    const action = String(form.get("action") || "create");
    const { contacts, invalidCount, duplicateCount, invalidSamples, totalRows } = await readCsv(form.get("file"));

    if (action === "preview" || action === "replace") {
      const listId = String(form.get("listId") || "").trim();
      if (!listId) return NextResponse.json({ error: "Vui lòng chọn chủ đề danh sách cần cập nhật." }, { status: 400 });
      const [list] = await db.select({ id: emailLists.id, subject: emailLists.subject }).from(emailLists).where(eq(emailLists.id, listId)).limit(1);
      if (!list) return NextResponse.json({ error: "Chủ đề danh sách không tồn tại hoặc đã bị xóa." }, { status: 404 });

      if (action === "preview") {
        return NextResponse.json({
          ok: true,
          list,
          validCount: contacts.length,
          invalidCount,
          duplicateCount,
          totalRows,
          invalidSamples,
        });
      }

      const now = Date.now();
      await db.transaction(async (tx) => {
        await tx.delete(emailListContacts).where(eq(emailListContacts.listId, listId));
        for (let offset = 0; offset < contacts.length; offset += 100) {
          await tx.insert(emailListContacts).values(contacts.slice(offset, offset + 100).map((contact) => ({ id: randomUUID(), listId, email: contact.email, name: contact.name, createdAt: now })));
        }
      });
      return NextResponse.json({
        ok: true,
        list,
        imported: contacts.length,
        removedInvalid: invalidCount,
        removedDuplicates: duplicateCount,
      });
    }

    if (action !== "create") return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    const subject = String(form.get("subject") || "").trim();
    if (!subject || subject.length > 120) return NextResponse.json({ error: "Chủ đề bắt buộc và tối đa 120 ký tự." }, { status: 400 });

    const listId = randomUUID();
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.insert(emailLists).values({ id: listId, subject, createdAt: now });
      for (let offset = 0; offset < contacts.length; offset += 100) {
        await tx.insert(emailListContacts).values(contacts.slice(offset, offset + 100).map((contact) => ({ id: randomUUID(), listId, email: contact.email, name: contact.name, createdAt: now })));
      }
    });
    return NextResponse.json({ ok: true, listId, imported: contacts.length, skipped: totalRows - contacts.length });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Vui lòng") || error.message.startsWith("CSV") || error.message.startsWith("CSV "))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[email-lists] Không thể nhập hoặc cập nhật CSV trong Turso:", error);
    return NextResponse.json({ error: "Không thể lưu email vào Turso. Danh sách cũ được giữ nguyên nếu cập nhật thất bại." }, { status: 500 });
  }
}
