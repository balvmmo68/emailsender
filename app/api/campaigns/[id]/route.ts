import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";

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
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu campaign không hợp lệ" }, { status: 400 });
  await ensureDatabase();
  const result = await db.update(campaigns).set({ name: parsed.data.name, subject: parsed.data.subject, htmlContent: parsed.data.html, textContent: parsed.data.text, updatedAt: Date.now() })
    .where(and(eq(campaigns.id, id), inArray(campaigns.sendStatus, ["draft", "paused", "stopped", "completed"])));
  if (!result.rowsAffected) {
    const current = (await db.select({ id: campaigns.id, sendStatus: campaigns.sendStatus }).from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    if (!current) return NextResponse.json({ error: "Campaign không tồn tại" }, { status: 404 });
    return NextResponse.json({ error: "Không thể sửa campaign khi đang gửi hoặc đang được xóa." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const { id } = await params;
  await ensureDatabase();
  const campaign = (await db.select({ id: campaigns.id, sendStatus: campaigns.sendStatus }).from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) return NextResponse.json({ error: "Campaign không tồn tại" }, { status: 404 });
  try {
    await db.transaction(async (tx) => {
      const claim = await tx.update(campaigns).set({ sendStatus: "deleting", updatedAt: Date.now() })
        .where(and(eq(campaigns.id, id), inArray(campaigns.sendStatus, ["draft", "paused", "stopped", "completed"])));
      if (!claim.rowsAffected) throw new Error("CAMPAIGN_STATE_CONFLICT");
      const inFlight = await tx.select({ id: recipients.id }).from(recipients)
        .where(and(eq(recipients.campaignId, id), inArray(recipients.status, ["sending", "unknown"]))).limit(1);
      if (inFlight.length) throw new Error("CAMPAIGN_SEND_IN_FLIGHT");
      await tx.delete(recipients).where(eq(recipients.campaignId, id));
      await tx.delete(campaigns).where(eq(campaigns.id, id));
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["CAMPAIGN_STATE_CONFLICT", "CAMPAIGN_SEND_IN_FLIGHT"].includes(error.message)) {
      return NextResponse.json({ error: "Campaign đang gửi hoặc còn email cần đối soát; chưa thể xóa." }, { status: 409 });
    }
    console.error("[campaigns] Không thể xóa campaign:", error);
    return NextResponse.json({ error: "Không thể xóa campaign khỏi Turso." }, { status: 500 });
  }
}
