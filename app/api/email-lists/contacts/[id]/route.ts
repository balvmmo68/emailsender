import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts } from "@/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await ensureDatabase();
    const result = await db.delete(emailListContacts).where(eq(emailListContacts.id, id));
    if (!result.rowsAffected) return NextResponse.json({ error: "Email không tồn tại." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email-lists] Không thể xóa email:", error);
    return NextResponse.json({ error: "Không thể xóa email khỏi Turso." }, { status: 500 });
  }
}
