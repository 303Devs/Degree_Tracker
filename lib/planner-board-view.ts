import type { Course, RequirementGroup, Semester } from "./types";
import { getMissingIds, NON_DEGREE_CREDIT_GRADES, sortSemesters } from "./prereqs";
import type { PlannerValidationSummary } from "./planner-validation";

export type CoursePlacementGroupId = "blocked" | "required" | "available" | "other";
export type LoadTone = "empty" | "good" | "attention" | "overloaded";

export interface PlannerCoursePlacement {
  course: Course;
  requirementLabels: string[];
  blockedReasons: string[];
  groupId: CoursePlacementGroupId;
}

export interface PlannerCourseGroup {
  id: CoursePlacementGroupId;
  title: string;
  detail: string;
  courses: PlannerCoursePlacement[];
}

export interface PlannerSemesterSummary {
  semester: Semester;
  credits: number;
  courseCount: number;
  loadTone: LoadTone;
  conflicts: number;
}

export interface PlannerBoardViewModel {
  summary: {
    unplannedCount: number;
    blockedCount: number;
    conflictCount: number;
    projectedCompletionLabel: string | null;
  };
  courseGroups: PlannerCourseGroup[];
  semesterSummaries: PlannerSemesterSummary[];
}

const groupCopy: Record<CoursePlacementGroupId, { title: string; detail: string }> = {
  blocked: { title: "Blocked right now", detail: "Place prerequisites or corequisites first." },
  required: { title: "Needed for requirements", detail: "These still need a semester." },
  available: { title: "Available to place", detail: "Good candidates for upcoming terms." },
  other: { title: "Other unplanned courses", detail: "Lower-priority or uncategorized courses." },
};

export function buildPlannerBoardViewModel({
  courses,
  semesters,
  requirements,
  assignments,
  validation,
}: {
  courses: Course[];
  semesters: Semester[];
  requirements: RequirementGroup[];
  assignments: Map<string, string>;
  validation: PlannerValidationSummary;
}): PlannerBoardViewModel {
  const requirementMap = buildRequirementMap(requirements);
  const sortedSems = sortSemesters(semesters);
  const unplanned = courses.filter((course) => isPlaceableUnplanned(course, assignments));
  const groups: Record<CoursePlacementGroupId, PlannerCoursePlacement[]> = {
    blocked: [],
    required: [],
    available: [],
    other: [],
  };

  for (const course of unplanned) {
    const requirementLabels = requirementMap.get(course.id) ?? [];
    const blockedReasons = getBlockedReasons(course, courses, sortedSems, assignments);
    const groupId: CoursePlacementGroupId = blockedReasons.length > 0
      ? "blocked"
      : requirementLabels.length > 0
        ? "required"
        : course.status === "not_started"
          ? "available"
          : "other";
    groups[groupId].push({ course, requirementLabels, blockedReasons, groupId });
  }

  const courseGroups = (Object.keys(groupCopy) as CoursePlacementGroupId[])
    .map((id) => ({ id, ...groupCopy[id], courses: groups[id] }))
    .filter((group) => group.courses.length > 0);

  const semesterSummaries = sortedSems.map((semester) => {
    const semesterCourses = courses.filter((course) => (assignments.get(course.id) ?? course.semester ?? "unplanned") === semester.id);
    const credits = semesterCourses.reduce((sum, course) => sum + course.credits, 0);
    const conflicts = validation.prereqViolations.filter((item) => item.semesterId === semester.id).length +
      validation.coreqViolations.filter((item) => item.semesterId === semester.id).length +
      validation.termLoadIssues.filter((item) => item.semesterId === semester.id).length;
    return {
      semester,
      credits,
      courseCount: semesterCourses.length,
      loadTone: getLoadTone(credits, semester.status),
      conflicts,
    };
  });

  return {
    summary: {
      unplannedCount: unplanned.length,
      blockedCount: groups.blocked.length,
      conflictCount: validation.prereqViolations.length + validation.coreqViolations.length + validation.termLoadIssues.length,
      projectedCompletionLabel: validation.projectedCompletionTerm?.semesterLabel ?? null,
    },
    courseGroups,
    semesterSummaries,
  };
}

function buildRequirementMap(requirements: RequirementGroup[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const requirement of requirements) {
    for (const courseId of requirement.coursePool) {
      const labels = map.get(courseId) ?? [];
      labels.push(requirement.name);
      map.set(courseId, labels);
    }
  }
  return map;
}

function isPlaceableUnplanned(course: Course, assignments: Map<string, string>): boolean {
  if (course.id.endsWith("-0000")) return false;
  if (course.status === "completed" || course.status === "in_progress" || course.status === "registered") return false;
  return (assignments.get(course.id) ?? course.semester ?? "unplanned") === "unplanned";
}

function getBlockedReasons(course: Course, courses: Course[], sortedSems: Semester[], assignments: Map<string, string>): string[] {
  const nextSemester = sortedSems.find((semester) => semester.status !== "completed");
  if (!nextSemester) return [];
  const targetIdx = sortedSems.findIndex((semester) => semester.id === nextSemester.id);
  const beforeTarget = new Set<string>();
  const atOrBefore = new Set<string>();

  for (const candidate of courses) {
    if (candidate.id === course.id) continue;
    if (candidate.status === "completed") {
      if (!candidate.grade || !NON_DEGREE_CREDIT_GRADES.has(candidate.grade)) {
        beforeTarget.add(candidate.id);
        atOrBefore.add(candidate.id);
      }
      continue;
    }
    const semId = assignments.get(candidate.id) ?? candidate.semester ?? "unplanned";
    if (semId === "unplanned") continue;
    const semIdx = sortedSems.findIndex((semester) => semester.id === semId);
    if (semIdx === -1) continue;
    if (semIdx < targetIdx) {
      beforeTarget.add(candidate.id);
      atOrBefore.add(candidate.id);
    } else if (semIdx === targetIdx) {
      atOrBefore.add(candidate.id);
    }
  }

  const missingPrereqs = course.prereqs ? getMissingIds(course.prereqs, beforeTarget) : [];
  const missingCoreqs = course.coreqs ? getMissingIds(course.coreqs, atOrBefore) : [];
  return [
    ...missingPrereqs.map((id) => `Needs ${formatCourseId(id)} first`),
    ...missingCoreqs.map((id) => `Needs ${formatCourseId(id)} with or before it`),
  ];
}

function getLoadTone(credits: number, status: Semester["status"]): LoadTone {
  if (credits === 0) return "empty";
  if (credits > 18) return "overloaded";
  if (credits < 12 && status === "planned") return "attention";
  return "good";
}

function formatCourseId(id: string): string {
  return id.replaceAll("-", " ");
}
