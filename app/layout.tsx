import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Sendroom", description: "CSV to email campaign console" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a43" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
