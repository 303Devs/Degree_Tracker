import { describe, expect, it } from "vitest";
import { buildAuditDashboardViewModel } from "@/lib/audit-dashboard-view";
import type { Course, RequirementGroup, Semester } from "@/lib/types";

const courses: Course[] = [
  { id: "DONE-1000", number: "DONE 1000", name: "Done", credits: 3, prereqs: null, coreqs: null, status: "completed" },
  { id: "IP-1000", number: "IP 1000", name: "In Progress", credits: 3, prereqs: null, coreqs: null, status: "in_progress" },
  { id: "PLAN-1000", number: "PLAN 1000", name: "Planned", credits: 3, prereqs: null, coreqs: null, status: "planned" },
  { id: "TODO-1000", number: "TODO 1000", name: "Todo", credits: 3, prereqs: null, coreqs: null, status: "not_started" },
];

const semesters: Semester[] = [];

function group(overrides: Partial<RequirementGroup> & { id: string; name: string; coursePool: string[] }): RequirementGroup {
  const { id, name, coursePool, ...rest } = overrides;
  return {
    id,
    name,
    category: "Core",
    type: "complete_all",
    coursePool,
    ...rest,
  };
}

describe("audit dashboard view model", () => {
  it("summarizes requirements and credits for the dashboard", () => {
    const requirements = [
      group({ id: "complete", name: "Complete area", coursePool: ["DONE-1000"] }),
      group({ id: "active", name: "Active area", coursePool: ["IP-1000"] }),
      group({ id: "remaining", name: "Remaining area", coursePool: ["TODO-1000"] }),
    ];

    const view = buildAuditDashboardViewModel({ courses, requirements, semesters });

    expect(view.summary.totalRequirements).toBe(3);
    expect(view.summary.completeRequirements).toBe(1);
    expect(view.summary.inProgressRequirements).toBe(1);
    expect(view.summary.remainingRequirements).toBe(1);
    expect(view.summary.percentComplete).toBe(33);
    expect(view.summary.creditsCompleted).toBe(3);
    expect(view.summary.creditsInProgress).toBe(3);
    expect(view.summary.creditsPlanned).toBe(3);
  });

  it("groups requirements by action/status instead of raw audit order", () => {
    const requirements = [
      group({ id: "remaining", name: "Remaining area", coursePool: ["TODO-1000"] }),
      group({ id: "complete", name: "Complete area", coursePool: ["DONE-1000"] }),
      group({ id: "active", name: "Active area", coursePool: ["PLAN-1000"] }),
    ];

    const view = buildAuditDashboardViewModel({ courses, requirements, semesters });

    expect(view.sections.remaining.map((item) => item.id)).toEqual(["remaining"]);
    expect(view.sections.complete.map((item) => item.id)).toEqual(["complete"]);
    expect(view.sections.in_progress.map((item) => item.id)).toEqual(["active"]);
  });

  it("creates simple deterministic next actions", () => {
    const requirements = [
      group({ id: "active", name: "Active area", coursePool: ["IP-1000"] }),
      group({ id: "remaining", name: "Remaining area", coursePool: ["TODO-1000"] }),
    ];

    const view = buildAuditDashboardViewModel({ courses, requirements, semesters });

    expect(view.nextActions.map((action) => action.title)).toEqual([
      "Confirm Active area",
      "Choose next course for Remaining area",
    ]);
    expect(view.nextActions[1].detail).toContain("TODO 1000");
  });
});
