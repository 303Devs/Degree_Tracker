"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, type NavItem } from "@/lib/navigation";

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  upload: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  plan: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  planner: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2zm2-6h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01" />
    </svg>
  ),
  library: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  gpa: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();
  const navItems = PRIMARY_NAV.map(({ href, label, icon }) => {
    const active = pathname === href || (href === "/" && pathname === "/degree-plan");

    return { active, href, icon, label };
  });

  return (
    <>
      <header className="md:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-sky-100 shadow-sm shadow-sky-100/60">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 shadow-md shadow-sky-200 flex items-center justify-center">
            <span className="text-white text-xs font-extrabold tracking-tight">DT</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-950 tracking-tight leading-none">Degree Tracker</h1>
            <p className="text-xs font-medium text-sky-700 mt-1">CU Boulder</p>
          </div>
        </div>
        <nav className="px-3 pb-3 flex gap-2 overflow-x-auto">
          {navItems.map(({ active, href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-full text-xs transition-all border ${
                active
                  ? "bg-sky-50 text-sky-800 font-bold border-sky-200"
                  : "text-slate-600 bg-white border-slate-200"
              }`}
            >
              <span className={active ? "text-sky-700" : "text-slate-400"}>{ICONS[icon]}</span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-gradient-to-b from-white via-[#f7fbff] to-[#eef8ff] border-r border-sky-100 min-h-screen shadow-[12px_0_35px_rgba(14,116,144,0.08)]">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-sky-100/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 shadow-lg shadow-sky-200 flex items-center justify-center">
            <span className="text-white text-sm font-extrabold tracking-tight">DT</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-950 tracking-tight leading-none">
              Degree Tracker
            </h1>
            <p className="text-xs font-medium text-sky-700 mt-1">CU Boulder</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1.5">
        {navItems.map(({ active, href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm transition-all duration-150 border ${
              active
                ? "bg-white text-sky-800 font-bold border-sky-200 shadow-sm shadow-sky-100"
                : "text-slate-600 border-transparent hover:text-sky-800 hover:bg-white/75 hover:border-sky-100"
            }`}
          >
            <span className={`shrink-0 rounded-xl p-1.5 ${active ? "bg-sky-100 text-sky-700" : "bg-white/70 text-slate-400"}`}>
              {ICONS[icon]}
            </span>
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-sky-100/80">
        <p className="text-sm font-bold text-slate-800">Anthony Merino</p>
        <p className="text-xs text-slate-500 mt-1 leading-snug">B.S. Stats &amp; DS + CS Minor</p>
      </div>
      </aside>
    </>
  );
}
