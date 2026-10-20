import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  html: z.string().max(200000),
  text: z.string().max(200000),
});

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu campaign không hợp lệ" }, { status: 400 });
  await ensureDatabase();
  const result = await db.update(campaigns).set({ name: parsed.data.name, subject: parsed.data.subject, htmlContent: parsed.data.html, textContent: parsed.data.text, updatedAt: Date.now() }).where(eq(campaigns.id, id));
  if (!result.rowsAffected) return NextResponse.json({ error: "Campaign không tồn tại" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await ensureDatabase();
  const campaign = (await db.select({ id: campaigns.id, sendStatus: campaigns.sendStatus }).from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) return NextResponse.json({ error: "Campaign không tồn tại" }, { status: 404 });
  if (campaign.sendStatus === "sending") return NextResponse.json({ error: "Không thể xóa campaign đang gửi. Hãy tạm dừng hoặc dừng campaign trước." }, { status: 409 });
  await db.delete(recipients).where(eq(recipients.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
