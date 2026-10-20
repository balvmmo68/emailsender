import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { rejectCrossOrigin } from "@/lib/request-security";

const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const { id: sourceId } = await params;

  try {
    await ensureDatabase();
    const now = Date.now();
    const cutoff = now - RESEND_COOLDOWN_MS;
    const newId = randomUUID();

    const result = await db.transaction(async (tx) => {
      const source = (await tx.select().from(campaigns).where(eq(campaigns.id, sourceId)).limit(1))[0];
      if (!source) throw new Error("RESEND_SOURCE_NOT_FOUND");
      if (source.sendStatus !== "completed") throw new Error("RESEND_NOT_COMPLETED");
      const completedAt = source.completedAt ?? source.updatedAt;
      const cooldownAnchor = Math.max(completedAt, source.lastResentAt ?? 0);
      if (cooldownAnchor > cutoff) throw new Error(`RESEND_COOLDOWN:${cooldownAnchor + RESEND_COOLDOWN_MS}`);

      const sourceRecipients = await tx.select({ email: recipients.email, name: recipients.name, variablesJson: recipients.variablesJson })
        .from(recipients).where(eq(recipients.campaignId, sourceId))
        .orderBy(asc(recipients.createdAt), asc(recipients.id));
      if (!sourceRecipients.length) throw new Error("RESEND_NO_RECIPIENTS");

      const reserved = await tx.update(campaigns).set({ lastResentAt: now, updatedAt: now })
        .where(and(
          eq(campaigns.id, sourceId),
          eq(campaigns.sendStatus, "completed"),
          sql`COALESCE(${campaigns.lastResentAt}, ${campaigns.completedAt}) <= ${cutoff}`,
        ));
      if (reserved.rowsAffected !== 1) throw new Error("RESEND_COOLDOWN_CONFLICT");

      await tx.insert(campaigns).values({
        id: newId,
        name: `${source.name.slice(0, 110)} (gửi lại)`,
        subject: source.subject,
        htmlContent: source.htmlContent,
        textContent: source.textContent,
        recipientCount: sourceRecipients.length,
        selectedProviderEnv: source.selectedProviderEnv,
        sendStatus: "draft",
        sendCursor: 0,
        createdAt: now,
        updatedAt: now,
      });
      for (let offset = 0; offset < sourceRecipients.length; offset += 100) {
        await tx.insert(recipients).values(sourceRecipients.slice(offset, offset + 100).map((recipient, index) => ({
          id: randomUUID(),
          campaignId: newId,
          email: recipient.email,
          name: recipient.name,
          variablesJson: recipient.variablesJson,
          status: "pending",
          createdAt: now + offset + index,
        })));
      }
      return { id: newId, recipientCount: sourceRecipients.length };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "RESEND_SOURCE_NOT_FOUND") return NextResponse.json({ error: "Không tìm thấy campaign gốc." }, { status: 404 });
      if (error.message === "RESEND_NOT_COMPLETED") return NextResponse.json({ error: "Chỉ có thể gửi lại campaign đã hoàn tất." }, { status: 409 });
      if (error.message.startsWith("RESEND_COOLDOWN:")) {
        const availableAt = Number(error.message.split(":")[1]);
        return NextResponse.json({ error: "Campaign cần chờ đủ 24 giờ trước lần gửi lại tiếp theo.", availableAt }, { status: 429 });
      }
      if (error.message === "RESEND_NO_RECIPIENTS") return NextResponse.json({ error: "Campaign không có recipient để tạo bản gửi lại." }, { status: 409 });
      if (error.message === "RESEND_COOLDOWN_CONFLICT") return NextResponse.json({ error: "Một lần gửi lại vừa được tạo ở phiên khác. Tải lại trang để kiểm tra." }, { status: 409 });
    }
    console.error("[campaign-resend] Could not create resend campaign:", error);
    return NextResponse.json({ error: "Không thể tạo bản gửi lại campaign." }, { status: 500 });
  }
}
