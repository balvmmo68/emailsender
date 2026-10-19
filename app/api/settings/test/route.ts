import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { testProvider } from "@/lib/email-providers";
import { recordProviderError } from "@/lib/provider-error-log";

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const env = typeof body.env === "string" ? body.env : "";
  if (!env) return NextResponse.json({ error: "Thiếu tên provider" }, { status: 400 });
  try {
    await testProvider(env);
    return NextResponse.json({ ok: true, message: `${env} phản hồi thành công.` });
  } catch (error) {
    await recordProviderError(env, "api-test", error).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kiểm tra provider thất bại" }, { status: 502 });
  }
}
