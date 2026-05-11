import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Degree Tracker — CU Boulder",
  description: "Track your degree progress at CU Boulder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col text-[var(--text)] antialiased md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
