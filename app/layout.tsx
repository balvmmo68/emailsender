import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sendroom — Bản tin Crypto, Forex & Tài chính",
  description: "Nhận bản tin ngắn gọn, chọn lọc về crypto, forex và tài chính.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a43" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
