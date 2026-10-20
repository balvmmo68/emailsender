import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { client, ensureDatabase } from "@/db/client";
import { rejectCrossOrigin } from "@/lib/request-security";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().email("Please enter a valid email address.").max(254),
  consent: z.literal(true, { errorMap: () => ({ message: "Please confirm that you agree to receive the newsletter." }) }),
  website: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check your signup details." }, { status: 400 });
  }

  // Honeypot: quietly acknowledge bot submissions without storing them.
  if (parsed.data.website) return NextResponse.json({ ok: true });

  try {
    await ensureDatabase();
    await client.execute({
      sql: `INSERT OR IGNORE INTO email_list_contacts (id, list_id, email, name, created_at)
        VALUES (?, 'default-newsletters', ?, ?, ?)`,
      args: [randomUUID(), parsed.data.email.toLowerCase(), parsed.data.name, Date.now()],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[newsletter] Could not save signup:", error);
    return NextResponse.json({ error: "We couldn't save your signup. Please try again later." }, { status: 500 });
  }
}
