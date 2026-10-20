import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts, emailLists } from "@/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await ensureDatabase();
    const [list] = await db.select({ id: emailLists.id }).from(emailLists).where(eq(emailLists.id, id)).limit(1);
    if (!list) return NextResponse.json({ error: "Chủ đề danh sách không tồn tại." }, { status: 404 });
    await db.delete(emailListContacts).where(eq(emailListContacts.listId, id));
    await db.delete(emailLists).where(eq(emailLists.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email-lists] Không thể xóa chủ đề:", error);
    return NextResponse.json({ error: "Không thể xóa chủ đề danh sách khỏi Turso." }, { status: 500 });
  }
}
