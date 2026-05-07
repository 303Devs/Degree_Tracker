"use client";

import RequirementsWorkspace from "@/components/RequirementsWorkspace";
import PlannerWorkspace from "@/components/PlannerWorkspace";

export default function DegreePlanPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] px-6 py-8 pb-12 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-indigo-700">Audit Plan</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Requirement-first academic plan</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
                Audit groups are the spine. Open each workbook-style row to see completed, in-progress,
                planned, and remaining courses; then use the attached semester context to evaluate timing
                and prerequisite risk without leaving the audit.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-medium uppercase tracking-wide sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">completed</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">in progress</span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700">planned</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">remaining</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="requirements-spine" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="requirements-spine" className="text-base font-semibold text-slate-950">Requirements spine</h2>
              <p className="mt-1 text-sm text-slate-500">Requirements are the primary unit; course options stay under the audit group they can satisfy.</p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">workbook context</p>
          </div>
          <RequirementsWorkspace embedded />
        </section>

        <section aria-labelledby="semester-attachments" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 border-b border-slate-100 pb-4">
            <h2 id="semester-attachments" className="text-base font-semibold text-slate-950">Semester planning context</h2>
            <p className="mt-1 text-sm text-slate-500">
              The timeline remains attached to the audit plan. Use it to adjust placement after reviewing requirement-level options and warnings above.
            </p>
          </div>
          <PlannerWorkspace embedded />
        </section>
      </div>
    </div>
  );
}
