import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Sendroom", description: "CSV to email campaign console" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
