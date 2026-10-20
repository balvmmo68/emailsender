import { NextRequest, NextResponse } from "next/server";

// Base64 obfuscation (not encryption) keeps the canonical URL out of plain-text source.
const CANONICAL_URL = atob("aHR0cHM6Ly9rcnlleC54eXo=");
const ALLOWED_HOSTS = new Set(["kryex.xyz", "sender.kryex.xyz"]);

function hostnameFromRequest(request: NextRequest) {
  const hostHeader = request.headers.get("host");
  let hostname = request.nextUrl.hostname;
  if (hostHeader) {
    try { hostname = new URL(`http://${hostHeader}`).hostname; }
    catch { return ""; }
  }
  hostname = hostname.toLowerCase().replace(/\.$/, "");
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

export function middleware(request: NextRequest) {
  // Keep local development and local production smoke tests usable.
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const hostname = hostnameFromRequest(request);
  if (ALLOWED_HOSTS.has(hostname) || isLocalHost(hostname)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This host is not configured for this service." }, { status: 421 });
  }

  return NextResponse.redirect(new URL(CANONICAL_URL), 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
