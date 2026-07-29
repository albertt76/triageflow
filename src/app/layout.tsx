import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "TriageFlow — Support Triage for TechFlow",
  description:
    "Auto-triage the support queue, catch SLA breaches before they happen, and learn from resolved-ticket data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
