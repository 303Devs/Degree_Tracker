"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, type NavItem } from "@/lib/navigation";

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  upload: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  plan: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  planner: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2zm2-6h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01" />
    </svg>
  ),
  library: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  gpa: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href === "/" && pathname === "/degree-plan");
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-extrabold tracking-tight text-white shadow-sm shadow-sky-100">
        DT
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold tracking-tight text-[var(--text)]">Degree Tracker</p>
        <p className="text-xs font-medium text-[var(--text-secondary)]">CU Boulder</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const navItems = PRIMARY_NAV.map((item) => ({ ...item, active: isActive(pathname, item.href) }));

  return (
    <>
      <header className="sticky top-0 z-30 w-screen max-w-full overflow-hidden border-b border-[var(--border)] bg-white shadow-sm shadow-slate-200/60 md:hidden">
        <div className="px-4 py-3">
          <BrandMark />
        </div>
        <nav className="grid w-full grid-cols-1 gap-2 px-3 pb-3" aria-label="Primary navigation">
          {navItems.map(({ href, label, shortLabel, icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 max-w-full items-center justify-start gap-2 overflow-hidden rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "border-sky-200 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:border-sky-200 hover:text-[var(--accent-strong)]"
              }`}
            >
              <span className="shrink-0">{ICONS[icon]}</span>
              <span className="truncate">{shortLabel ?? label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white shadow-[10px_0_30px_rgba(15,23,42,0.06)] md:flex">
        <div className="border-b border-[var(--border)] px-5 py-5">
          <BrandMark />
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-5" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-colors ${
                active
                  ? "border-sky-200 bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)] shadow-sm shadow-slate-100"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--accent-strong)]"
              }`}
            >
              <span className={`shrink-0 rounded-xl p-1.5 ${active ? "bg-white text-[var(--accent)]" : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"}`}>
                {ICONS[icon]}
              </span>
              <span className="leading-tight">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] px-5 py-5">
          <p className="text-sm font-bold text-[var(--text)]">Anthony Merino</p>
          <p className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">B.S. Stats &amp; DS + CS Minor</p>
        </div>
      </aside>
    </>
  );
}
