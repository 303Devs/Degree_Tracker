import {
  buildAuditRequirementViewModels,
  type AuditRequirementViewModel,
} from "./audit-plan-view";
import type { Course, RequirementGroup, Semester } from "./types";

export type DashboardRequirementStatus = "attention" | "in_progress" | "remaining" | "complete";

export interface DashboardRequirement {
  id: string;
  name: string;
  category: string;
  status: DashboardRequirementStatus;
  progressLabel: string;
  remainingLabel: string;
  helperText: string;
  completed: number;
  total: number;
  percent: number;
  warnings: string[];
  sampleCourses: string[];
}

export interface DashboardNextAction {
  id: string;
  title: string;
  detail: string;
  requirementId: string;
  tone: "attention" | "progress" | "remaining" | "complete";
}

export interface AuditDashboardViewModel {
  summary: {
    totalRequirements: number;
    completeRequirements: number;
    inProgressRequirements: number;
    attentionRequirements: number;
    remainingRequirements: number;
    percentComplete: number;
    creditsCompleted: number;
    creditsInProgress: number;
    creditsPlanned: number;
  };
  nextActions: DashboardNextAction[];
  sections: Record<DashboardRequirementStatus, DashboardRequirement[]>;
}

export function buildAuditDashboardViewModel({
  courses,
  requirements,
  semesters = [],
}: {
  courses: Course[];
  requirements: RequirementGroup[];
  semesters?: Semester[];
}): AuditDashboardViewModel {
  const views = buildAuditRequirementViewModels({ courses, requirements, semesters });
  const items = views.map(toDashboardRequirement);
  const sections: AuditDashboardViewModel["sections"] = {
    attention: items.filter((item) => item.status === "attention"),
    in_progress: items.filter((item) => item.status === "in_progress"),
    remaining: items.filter((item) => item.status === "remaining"),
    complete: items.filter((item) => item.status === "complete"),
  };

  return {
    summary: {
      totalRequirements: items.length,
      completeRequirements: sections.complete.length,
      inProgressRequirements: sections.in_progress.length,
      attentionRequirements: sections.attention.length,
      remainingRequirements: sections.remaining.length,
      percentComplete: items.length === 0 ? 0 : Math.round((sections.complete.length / items.length) * 100),
      creditsCompleted: sumCredits(courses, ["completed"]),
      creditsInProgress: sumCredits(courses, ["in_progress", "registered"]),
      creditsPlanned: sumCredits(courses, ["planned"]),
    },
    nextActions: buildNextActions(sections),
    sections,
  };
}

function toDashboardRequirement(view: AuditRequirementViewModel): DashboardRequirement {
  const warnings = view.courseOptions
    .filter((option) => option.warning?.severity === "warning")
    .map((option) => option.warning?.message ?? "Needs review");
  const status = getRequirementStatus(view, warnings.length);
  const total = Math.max(view.progress.total, 0);
  const completed = Math.max(view.progress.completed, 0);
  const percent = total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
  const sampleCourses = [
    ...view.buckets.remaining,
    ...view.buckets.in_progress,
    ...view.buckets.planned,
    ...view.buckets.completed,
    ...view.buckets.unknown,
  ].slice(0, 4).map((option) => option.courseNumber);

  return {
    id: view.group.id,
    name: view.group.name,
    category: view.group.category,
    status,
    progressLabel: total === 0 ? "Review requirement" : `${completed} of ${total} ${view.progress.unit === "hours" ? "hours" : "done"}`,
    remainingLabel: view.remainingLabel,
    helperText: buildHelperText(view, status),
    completed,
    total,
    percent,
    warnings: Array.from(new Set(warnings)),
    sampleCourses,
  };
}

function getRequirementStatus(view: AuditRequirementViewModel, warningCount: number): DashboardRequirementStatus {
  if (warningCount > 0) return "attention";
  if (view.progress.pct >= 1) return "complete";
  if (view.counts.inProgress > 0 || view.counts.planned > 0) return "in_progress";
  return "remaining";
}

function buildHelperText(view: AuditRequirementViewModel, status: DashboardRequirementStatus): string {
  if (status === "complete") return "This area is complete. Keep it collapsed unless you need details.";
  if (status === "attention") return "Review timing, prerequisites, or a course choice before relying on this area.";
  if (status === "in_progress") return "You have coursework underway or planned here. Confirm it still fits your path.";
  if (view.group.type === "pick_one") return "Pick one course that fits this requirement.";
  if (view.group.type === "pick_n") return `Choose ${view.group.required ?? "the required number of"} courses for this requirement.`;
  if (view.group.type === "minimum_hours") return "Add enough credits from this area to finish the requirement.";
  return "Choose remaining courses to finish this requirement.";
}

function buildNextActions(sections: AuditDashboardViewModel["sections"]): DashboardNextAction[] {
  const actions: DashboardNextAction[] = [];

  for (const item of sections.attention.slice(0, 2)) {
    actions.push({
      id: `attention-${item.id}`,
      title: `Review ${item.name}`,
      detail: item.warnings[0] ?? "This requirement needs attention before it is safe to count on.",
      requirementId: item.id,
      tone: "attention",
    });
  }

  for (const item of sections.in_progress.slice(0, 2)) {
    actions.push({
      id: `progress-${item.id}`,
      title: `Confirm ${item.name}`,
      detail: `${item.progressLabel}. Make sure current or planned courses still satisfy this area.`,
      requirementId: item.id,
      tone: "progress",
    });
  }

  for (const item of sections.remaining.slice(0, 3)) {
    actions.push({
      id: `remaining-${item.id}`,
      title: `Choose next course for ${item.name}`,
      detail: `${item.remainingLabel}. Start with ${item.sampleCourses.slice(0, 2).join(" or ") || "an eligible course"}.`,
      requirementId: item.id,
      tone: "remaining",
    });
  }

  if (actions.length === 0 && sections.complete.length > 0) {
    const item = sections.complete[0];
    actions.push({
      id: `complete-${item.id}`,
      title: "All tracked requirements look complete",
      detail: "Review completed areas only if your audit or program changed.",
      requirementId: item.id,
      tone: "complete",
    });
  }

  return actions.slice(0, 5);
}

function sumCredits(courses: Course[], statuses: Course["status"][]): number {
  const statusSet = new Set(statuses);
  return courses
    .filter((course) => statusSet.has(course.status) && course.countsTowardEarnedHours !== false)
    .reduce((sum, course) => sum + course.credits, 0);
}
