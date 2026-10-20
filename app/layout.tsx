import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sendroom — Crypto, Forex & Finance Briefing",
  description: "Concise, curated updates on crypto, forex, and finance.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a43" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
