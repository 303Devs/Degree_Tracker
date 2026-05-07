"use client";

import RequirementsWorkspace from "@/components/RequirementsWorkspace";
import PlannerWorkspace from "@/components/PlannerWorkspace";

export default function DegreePlanPage() {
  return (
    <div className="px-8 py-8 pb-12 space-y-6 max-w-[1400px]">
      <div className="rounded-2xl border border-[#1e1e34] bg-[#111120] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#d4a843] font-semibold">Audit Plan</p>
            <h2 className="text-2xl font-bold text-[#d0d0e8] mt-2">Audit-first planning workspace</h2>
            <p className="text-[#6a6a8a] text-sm mt-2 max-w-3xl leading-relaxed">
              Audit groups are the spine. Open each group to see completed, missing, planned, and elective work;
              then use the attached semester timeline to place remaining courses without leaving this workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wider sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <span className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-green-400">completed</span>
            <span className="rounded-lg border border-[#d4a843]/20 bg-[#d4a843]/10 px-2 py-1 text-[#d4a843]">in progress</span>
            <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-indigo-300">planned</span>
            <span className="rounded-lg border border-[#2a2a3a] bg-[#1e1e34] px-2 py-1 text-[#6a6a8a]">missing</span>
          </div>
        </div>
      </div>

      <section aria-labelledby="requirements-spine" className="rounded-2xl border border-[#1e1e34] bg-[#0d0d1a] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#1e1e34] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="requirements-spine" className="text-sm font-semibold text-[#d0d0e8]">Requirements spine</h3>
            <p className="text-xs text-[#6a6a8a] mt-1">Audit groups organize the plan; rows expand only when course-level detail is needed.</p>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-[#4a4a6a]">electives stay in context</p>
        </div>
        <RequirementsWorkspace embedded />
      </section>

      <section aria-labelledby="semester-attachments" className="rounded-2xl border border-[#1e1e34] bg-[#0d0d1a] p-4 sm:p-5">
        <div className="mb-4 border-b border-[#1e1e34] pb-4">
          <h3 id="semester-attachments" className="text-sm font-semibold text-[#d0d0e8]">Semester attachments</h3>
          <p className="text-xs text-[#6a6a8a] mt-1">The timeline is part of the audit plan, not a second embedded page. Prereq/coreq warnings remain contextual while placing courses.</p>
        </div>
        <PlannerWorkspace embedded />
      </section>
    </div>
  );
}
