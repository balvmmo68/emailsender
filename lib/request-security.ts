import { NextResponse } from "next/server";

export function isSameOriginUnsafeRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function rejectCrossOrigin(request: Request) {
  return isSameOriginUnsafeRequest(request)
    ? null
    : NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
}
