import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { emailListContacts, emailLists } from "@/db/schema";
import { rejectCrossOrigin } from "@/lib/request-security";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const { id } = await params;
  try {
    await ensureDatabase();
    const [list] = await db.select({ id: emailLists.id, subject: emailLists.subject })
      .from(emailLists).where(eq(emailLists.id, id)).limit(1);
    if (!list) return NextResponse.json({ error: "Chủ đề danh sách không tồn tại." }, { status: 404 });

    const result = await db.transaction(async (tx) => {
      const contacts = await tx.select({ id: emailListContacts.id, email: emailListContacts.email })
        .from(emailListContacts).where(eq(emailListContacts.listId, id))
        .orderBy(asc(emailListContacts.createdAt), asc(emailListContacts.id));
      const seen = new Set<string>();
      const duplicateIds: string[] = [];
      for (const contact of contacts) {
        const normalizedEmail = contact.email.trim().toLowerCase();
        if (normalizedEmail && seen.has(normalizedEmail)) duplicateIds.push(contact.id);
        else if (normalizedEmail) seen.add(normalizedEmail);
      }
      for (let offset = 0; offset < duplicateIds.length; offset += 500) {
        const batch = duplicateIds.slice(offset, offset + 500);
        await tx.delete(emailListContacts).where(and(eq(emailListContacts.listId, id), inArray(emailListContacts.id, batch)));
      }
      return { scanned: contacts.length, removed: duplicateIds.length, kept: contacts.length - duplicateIds.length };
    });
    return NextResponse.json({
      ok: true,
      list,
      ...result,
    });
  } catch (error) {
    console.error("[email-lists] Could not deduplicate contacts:", error);
    return NextResponse.json({ error: "Không thể lọc email trùng trong chủ đề danh sách." }, { status: 500 });
  }
}
