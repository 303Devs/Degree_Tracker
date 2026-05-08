"use client";

import RequirementsWorkspace from "@/components/RequirementsWorkspace";
import PlannerWorkspace from "@/components/PlannerWorkspace";

export default function DegreePlanPage() {
  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          body {
            display: block;
          }

          body > aside {
            display: none !important;
          }

          body > main {
            width: 100vw;
            min-height: 100vh;
            overflow: visible;
          }
        }
      `}</style>
      <div className="min-h-screen bg-[#080812] px-4 py-5 pb-10 text-[#d0d0e8] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-5">
        <header className="rounded-2xl border border-[#1e1e34] bg-[#101020]/95 px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d4a843]">Audit Plan</p>
                <span className="rounded-full border border-[#2a2a3e] bg-[#0d0d1a] px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#8888a8]">
                  current audit snapshot
                </span>
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f1ff] sm:text-2xl">Requirement-first academic plan</h1>
              <p className="mt-1 max-w-4xl text-sm leading-relaxed text-[#8888a8]">
                Use the audit requirements as the workspace. Course options and semester timing stay close enough to make decisions, but secondary enough to keep the spine readable.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-medium uppercase tracking-wide sm:grid-cols-4 lg:w-auto lg:min-w-[420px]">
              <span className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-green-400">completed</span>
              <span className="rounded-lg border border-[#d4a843]/25 bg-[#d4a843]/10 px-3 py-2 text-[#d4a843]">in progress</span>
              <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-indigo-300">planned</span>
              <span className="rounded-lg border border-[#2a2a3e] bg-[#0d0d1a] px-3 py-2 text-[#8888a8]">remaining</span>
            </div>
          </div>
        </header>

        <main className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-labelledby="requirements-spine" className="min-w-0 rounded-2xl border border-[#1e1e34] bg-[#0d0d1a] p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-2 border-b border-[#1e1e34] pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="requirements-spine" className="text-base font-semibold text-[#f1f1ff]">Requirements spine</h2>
                <p className="mt-1 text-sm text-[#8888a8]">Requirement rows are the primary surface; options expand beneath the audit group they satisfy.</p>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4a4a6a]">workbook context</p>
            </div>
            <RequirementsWorkspace embedded />
          </section>

          <aside aria-labelledby="semester-attachments" className="min-w-0 rounded-2xl border border-[#1e1e34] bg-[#0d0d1a] p-3 shadow-sm sm:p-4 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-2.5rem)] 2xl:overflow-auto">
            <div className="mb-3 border-b border-[#1e1e34] pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#4a4a6a]">supporting context</p>
              <h2 id="semester-attachments" className="mt-1 text-base font-semibold text-[#f1f1ff]">Semester planning</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#8888a8]">
                Secondary view for timing and prereq risk. Keep heavy drag/drop work out of the requirement scan path.
              </p>
            </div>
            <PlannerWorkspace embedded compact />
          </aside>
        </main>
      </div>
      </div>
    </>
  );
}
