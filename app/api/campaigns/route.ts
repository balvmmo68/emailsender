import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { count, desc, like, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { z } from "zod";

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
  try {
    await ensureDatabase();
    const form = await req.formData();
    const parsed = schema.parse({ name: form.get("name"), subject: form.get("subject"), html: form.get("html"), text: form.get("text") });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "CSV tối đa 5MB" }, { status: 400 });

    const csv = await file.text();
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim().toLowerCase() });
    const rows = result.data;
    const emailKey = Object.keys(rows[0] || {}).find((key) => key.toLowerCase() === "email");
    if (!emailKey) return NextResponse.json({ error: "CSV phải có cột email" }, { status: 400 });
    const valid = rows.filter((row) => /^\S+@\S+\.\S+$/.test((row[emailKey] || "").trim())).slice(0, 10000);
    if (!valid.length) return NextResponse.json({ error: "Không có email hợp lệ" }, { status: 400 });

    const id = randomUUID();
    const now = Date.now();
    await db.insert(campaigns).values({ id, name: parsed.name, subject: parsed.subject, htmlContent: parsed.html, textContent: parsed.text, recipientCount: valid.length, createdAt: now, updatedAt: now });
    await db.insert(recipients).values(valid.map((row) => ({ id: randomUUID(), campaignId: id, email: row[emailKey].trim().toLowerCase(), name: row.name?.trim() || null, variablesJson: JSON.stringify(row), status: "pending", createdAt: now })));
    return NextResponse.json({ id, count: valid.length });
  } catch (error) {
    console.error("[campaigns] Không thể tạo campaign:", error);
    return NextResponse.json({ error: "Không thể tạo campaign. Kiểm tra kết nối Turso và file CSV." }, { status: 500 });
  }
}
