"use client";

import Link from "next/link";
import RequirementsWorkspace from "@/components/RequirementsWorkspace";

export default function DegreePlanPage() {
  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          body { display: block; }
          body > aside { display: none !important; }
          body > main { width: 100vw; min-height: 100vh; overflow: visible; }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50 px-4 py-6 pb-12 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
          <header className="rounded-[2rem] border border-white/80 bg-white/90 px-5 py-5 shadow-lg shadow-sky-100/60 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sky-600">Degree Tracker</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Audit Plan</h1>
                <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                  See what is done, what remains, and which courses can help you finish.
                </p>
              </div>
              <Link href="/planner" className="inline-flex w-fit items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100">
                Open Planner
              </Link>
            </div>
          </header>

          <main className="grid gap-5">
            <section aria-labelledby="audit-plan" className="min-w-0 rounded-[2rem] border border-white/80 bg-white/90 p-4 shadow-lg shadow-sky-100/60 sm:p-6">
              <div className="mb-4 flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="audit-plan" className="text-xl font-semibold text-slate-950">Requirements and course options</h2>
                  <p className="mt-1 text-sm text-slate-500">Open a card to choose or plan a course.</p>
                </div>
              </div>
              <RequirementsWorkspace embedded />
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
