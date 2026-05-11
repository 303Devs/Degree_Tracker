"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DESKTOP_PRIMARY_NAV,
  DESKTOP_SECONDARY_NAV,
  MOBILE_MORE_NAV,
  MOBILE_TAB_NAV,
  type NavIcon,
  type NavItem,
} from "@/lib/navigation";

const iconProps = {
  className: "h-4 w-4",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

const ICONS: Record<NavIcon, React.ReactNode> = {
  audit: (
    <svg {...iconProps}>
      <path d="M9 11l2 2 4-4" />
      <path d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  ),
  planner: (
    <svg {...iconProps}>
      <path d="M8 3v4M16 3v4M5 11h14" />
      <path d="M7 5h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z" />
    </svg>
  ),
  courses: (
    <svg {...iconProps}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
    </svg>
  ),
  gpa: (
    <svg {...iconProps}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </svg>
  ),
  upload: (
    <svg {...iconProps}>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <path d="M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.88l.05.05a2 2 0 01-2.83 2.83l-.05-.05A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 1.55V21a2 2 0 01-4 0v-.05A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.88.34l-.05.05a2 2 0 01-2.83-2.83l.05-.05A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.55-1H3a2 2 0 010-4h.05A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.88l-.05-.05a2 2 0 012.83-2.83l.05.05A1.7 1.7 0 009 4.6a1.7 1.7 0 001-1.55V3a2 2 0 014 0v.05A1.7 1.7 0 0015 4.6a1.7 1.7 0 001.88-.34l.05-.05a2 2 0 012.83 2.83l-.05.05A1.7 1.7 0 0019.4 9a1.7 1.7 0 001.55 1H21a2 2 0 010 4h-.05A1.7 1.7 0 0019.4 15z" />
    </svg>
  ),
  more: (
    <svg {...iconProps}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  ),
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href === "/" && pathname === "/degree-plan");
}

function DesktopNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
      }`}
    >
      {active && <span className="absolute left-0 h-6 w-0.5 rounded-full bg-[var(--accent)]" />}
      {ICONS[item.icon]}
    </Link>
  );
}

function MobileTab({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
        active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
      }`}
    >
      {ICONS[item.icon]}
      <span className="truncate">{item.shortLabel ?? item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const moreActive = MOBILE_MORE_NAV.some((item) => isActive(pathname, item.href));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="flex h-14 items-center justify-center border-b border-[var(--border)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[11px] font-bold text-white" title="Degree Tracker">
            DT
          </span>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1 py-3" aria-label="Primary navigation">
          {DESKTOP_PRIMARY_NAV.map((item) => <DesktopNavItem key={item.href} item={item} />)}
          <div className="my-2 h-px w-7 bg-[var(--border)]" />
          {DESKTOP_SECONDARY_NAV.map((item) => <DesktopNavItem key={item.href} item={item} />)}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)] shadow-[0_-1px_3px_rgba(0,0,0,0.07)] md:hidden" aria-label="Mobile navigation">
        {MOBILE_TAB_NAV.map((item) => <MobileTab key={item.href} item={item} />)}
        <button
          type="button"
          aria-label="More navigation"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
            moreOpen || moreActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
          }`}
        >
          {ICONS.more}
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-20 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-elevated)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">More</div>
            {MOBILE_MORE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                <span className="text-[var(--text-muted)]">{ICONS[item.icon]}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
