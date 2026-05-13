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
      <body className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)] antialiased">
        <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
          <Sidebar />
          <main className="min-w-0 w-full flex-1 overflow-x-hidden pb-40 md:pb-0 md:pl-14">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
