import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { supportedProviderEnvs, testProvider } from "@/lib/email-providers";
import { recordProviderError } from "@/lib/provider-error-log";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/request-security";

const bodySchema = z.object({ env: z.enum(supportedProviderEnvs) });

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Provider không hợp lệ" }, { status: 400 });
  const env = body.data.env;
  try {
    await testProvider(env);
    return NextResponse.json({ ok: true, message: `${env} phản hồi thành công.` });
  } catch (error) {
    await recordProviderError(env, "api-test", error).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kiểm tra provider thất bại" }, { status: 502 });
  }
}
