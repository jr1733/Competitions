import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Comper", template: "%s · Comper" },
  description: "Work through UK prize competitions faster. You enter each one yourself.",
  applicationName: "Comper",
  appleWebApp: { capable: true, title: "Comper", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c12" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh font-sans text-zinc-900 antialiased dark:text-zinc-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
