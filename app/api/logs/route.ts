import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { providerErrorLogs } from "@/db/schema";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const url = new URL(req.url);
  const requestedPage = Number(url.searchParams.get("page") || "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const pageSize = 20;
  const total = Number((await db.select({ value: count() }).from(providerErrorLogs))[0]?.value || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const logs = await db.select().from(providerErrorLogs).orderBy(desc(providerErrorLogs.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);
  return NextResponse.json({ logs, page: currentPage, totalPages, total });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  await ensureDatabase();
  const parsed = z.object({ id: z.string().min(1).optional(), all: z.literal(true).optional() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.id && parsed.data.all)) return NextResponse.json({ error: "Cần chỉ rõ id hoặc all=true." }, { status: 400 });
  if (parsed.data.id) await db.delete(providerErrorLogs).where(eq(providerErrorLogs.id, parsed.data.id));
  else if (parsed.data.all === true) await db.delete(providerErrorLogs);
  else return NextResponse.json({ error: "Cần chỉ rõ id hoặc all=true." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
