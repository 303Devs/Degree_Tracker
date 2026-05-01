/**
 * Shared prerequisite validation utilities.
 * Used by both the semester planner and GPA calculator.
 * No server-only imports — safe for client components.
 */

import type { Course, PrereqRule, RequirementGroup, Semester } from "./types";

// ---------------------------------------------------------------------------
// Grade scale
// ---------------------------------------------------------------------------

export const GRADE_SCALE: Record<string, number> = {
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
};

export const GRADE_OPTIONS = [
  "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F",
] as const;
export type Grade = typeof GRADE_OPTIONS[number];

export function gradeToPoints(grade: string): number {
  return GRADE_SCALE[grade] ?? -1;
}

// ---------------------------------------------------------------------------
// Semester ordering
// ---------------------------------------------------------------------------

const TYPE_ORD: Record<string, number> = { spring: 0, summer: 1, fall: 2 };

export function semesterOrder(sem: Semester): number {
  return sem.year * 3 + (TYPE_ORD[sem.type] ?? 0);
}

export function sortSemesters(sems: Semester[]): Semester[] {
  return [...sems].sort((a, b) => semesterOrder(a) - semesterOrder(b));
}

// ---------------------------------------------------------------------------
// Prereq rule helpers
// ---------------------------------------------------------------------------

/** Collect every courseId leaf from a rule tree */
export function collectCourseIds(rule: PrereqRule): string[] {
  if (rule.type === "course") return [rule.courseId];
  return rule.rules.flatMap(collectCourseIds);
}

/** Whether a rule is satisfied given the set of available course IDs */
export function isRuleSatisfied(rule: PrereqRule, available: Set<string>): boolean {
  if (rule.type === "course") return available.has(rule.courseId);
  if (rule.type === "and") return rule.rules.every((r) => isRuleSatisfied(r, available));
  if (rule.type === "or") return rule.rules.some((r) => isRuleSatisfied(r, available));
  return false;
}

/** Get the minimal set of missing course IDs for a rule */
export function getMissingIds(rule: PrereqRule, available: Set<string>): string[] {
  if (rule.type === "course") {
    return available.has(rule.courseId) ? [] : [rule.courseId];
  }
  if (rule.type === "and") {
    return rule.rules.flatMap((r) => getMissingIds(r, available));
  }
  if (rule.type === "or") {
    // If any branch satisfied, nothing is missing
    if (rule.rules.some((r) => isRuleSatisfied(r, available))) return [];
    // Return the branch with fewest missing items
    const branches = rule.rules.map((r) => getMissingIds(r, available));
    return branches.sort((a, b) => a.length - b.length)[0] ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Drop validation
// ---------------------------------------------------------------------------

export interface DropValidation {
  valid: boolean;
  missingPrereqs: string[];
  missingCoreqs: string[];
}

/**
 * Validate whether a course can be dropped into a target semester.
 *
 * assignments: Map<courseId, semId | 'unplanned'> — the current planner state,
 * which may differ from course.semester if the user has made pending moves.
 */
export function validateDrop(
  course: Course,
  targetSemId: string,
  allCourses: Course[],
  sortedSems: Semester[],
  assignments: Map<string, string>
): DropValidation {
  if (targetSemId === "unplanned") {
    return { valid: true, missingPrereqs: [], missingCoreqs: [] };
  }

  const targetIdx = sortedSems.findIndex((s) => s.id === targetSemId);
  if (targetIdx === -1) {
    return { valid: true, missingPrereqs: [], missingCoreqs: [] };
  }

  const beforeTarget = new Set<string>();
  const atOrBefore = new Set<string>();

  for (const c of allCourses) {
    if (c.id === course.id) continue;

    // Completed courses are available unless they have a non-degree-credit grade
    // (W, NR, IP don't count — a withdrawn course can't satisfy a prereq)
    if (c.status === "completed") {
      if (!c.grade || !NON_DEGREE_CREDIT_GRADES.has(c.grade)) {
        beforeTarget.add(c.id);
        atOrBefore.add(c.id);
      }
      continue;
    }

    const semId = assignments.get(c.id) ?? "unplanned";
    if (semId === "unplanned") continue;

    const semIdx = sortedSems.findIndex((s) => s.id === semId);
    if (semIdx === -1) continue;

    if (semIdx < targetIdx) {
      beforeTarget.add(c.id);
      atOrBefore.add(c.id);
    } else if (semIdx === targetIdx) {
      atOrBefore.add(c.id);
    }
  }

  const missingPrereqs = course.prereqs
    ? getMissingIds(course.prereqs, beforeTarget)
    : [];
  const missingCoreqs = course.coreqs
    ? getMissingIds(course.coreqs, atOrBefore)
    : [];

  return {
    valid: missingPrereqs.length === 0 && missingCoreqs.length === 0,
    missingPrereqs,
    missingCoreqs,
  };
}

// ---------------------------------------------------------------------------
// Cascade warnings
// ---------------------------------------------------------------------------

export interface CascadeItem {
  number: string;
  name: string;
  semLabel: string;
}

/**
 * When moving a course to a LATER semester, find courses whose prereqs/coreqs
 * would be broken as a result.
 */
export function getCascadeWarnings(
  movedCourseId: string,
  fromSemId: string,
  toSemId: string,
  allCourses: Course[],
  sortedSems: Semester[],
  assignments: Map<string, string>
): CascadeItem[] {
  if (fromSemId === "unplanned" || toSemId === "unplanned") return [];

  const fromIdx = sortedSems.findIndex((s) => s.id === fromSemId);
  const toIdx = sortedSems.findIndex((s) => s.id === toSemId);

  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return [];

  const broken: CascadeItem[] = [];

  for (const course of allCourses) {
    if (course.id === movedCourseId) continue;

    const semId = assignments.get(course.id) ?? "unplanned";
    if (semId === "unplanned") continue;

    const semIdx = sortedSems.findIndex((s) => s.id === semId);
    if (semIdx === -1) continue;

    const semLabel = sortedSems[semIdx]?.label ?? semId;

    // Prereq: course expects movedCourse before it — if course is planned
    // at or before the new position of movedCourse, the prereq chain breaks
    if (course.prereqs) {
      const prereqIds = collectCourseIds(course.prereqs);
      if (prereqIds.includes(movedCourseId) && semIdx <= toIdx) {
        broken.push({ number: course.number, name: course.name, semLabel });
        continue;
      }
    }
    // Coreq: course expects movedCourse same-or-earlier — if movedCourse goes later, breaks
    if (course.coreqs) {
      const coreqIds = collectCourseIds(course.coreqs);
      if (coreqIds.includes(movedCourseId) && semIdx < toIdx) {
        broken.push({ number: course.number, name: course.name, semLabel });
      }
    }
  }

  return broken;
}

// ---------------------------------------------------------------------------
// GPA utilities
// ---------------------------------------------------------------------------

export function calcGPA(courses: Course[], whatIf?: Map<string, string>): number {
  let totalPoints = 0;
  let totalCredits = 0;

  for (const c of courses) {
    // Skip courses explicitly excluded from GPA
    if (c.countsTowardGPA === false) continue;
    const grade = whatIf?.get(c.id) ?? c.grade;
    if (!grade || grade === "HS" || c.credits <= 0) continue;
    const pts = gradeToPoints(grade);
    if (pts < 0) continue;
    totalPoints += pts * c.credits;
    totalCredits += c.credits;
  }

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

// ---------------------------------------------------------------------------
// Progress calculation (shared by dashboard server component and client pages)
// ---------------------------------------------------------------------------

/**
 * Check whether a course meets a requirement group's minGrade threshold.
 * Returns true if no minGrade is set, grade is absent, or grade meets/exceeds the minimum.
 */
function meetsMinGrade(course: Course, group: RequirementGroup): boolean {
  if (!group.minGrade) return true;
  if (!course.grade) return true; // no grade yet — don't penalize in-progress
  const coursePoints = GRADE_SCALE[course.grade];
  const minPoints = GRADE_SCALE[group.minGrade];
  // If minGrade is a valid letter grade but the course grade is not on the scale
  // (e.g., W, HS, P, NR), it cannot satisfy a minimum grade requirement
  if (coursePoints === undefined && minPoints !== undefined) return false;
  if (coursePoints === undefined || minPoints === undefined) return true;
  return coursePoints >= minPoints;
}

/** Grades that never earn degree credit regardless of minGrade setting. */
export const NON_DEGREE_CREDIT_GRADES = new Set(["W", "NR", "IP"]);

/**
 * Check whether a completed course actually satisfies degree progress for a requirement.
 * Must be counted toward degree, have a degree-creditable grade, AND meet the group's minGrade.
 */
function isCourseDegreeSatisfied(course: Course, group: RequirementGroup): boolean {
  if (course.countedTowardDegree === false) return false;
  // W, NR, IP never earn degree credit — exclude from requirement satisfaction
  if (course.grade && NON_DEGREE_CREDIT_GRADES.has(course.grade)) return false;
  if (!meetsMinGrade(course, group)) return false;
  return true;
}

export function calcProgress(
  group: RequirementGroup,
  courses: Course[],
  options?: { includePlanned?: boolean },
): { completed: number; inProgress: number; planned: number; total: number; pct: number } {
  const countPlanned = options?.includePlanned ?? false;

  if (group.type === "minimum_hours") {
    const hrs = group.requiredHours ?? 0;
    let earned = 0;
    let inProg = 0;
    let plan = 0;
    for (const cId of group.coursePool) {
      const c = courses.find((x) => x.id === cId);
      if (!c) continue;
      if (c.status === "completed" && isCourseDegreeSatisfied(c, group)) earned += c.credits;
      else if (c.status === "in_progress" || c.status === "registered") inProg += c.credits;
      else if (countPlanned && c.status === "planned") plan += c.credits;
    }
    return { completed: earned, inProgress: inProg, planned: plan, total: hrs, pct: hrs > 0 ? earned / hrs : 0 };
  }

  const pool =
    group.type === "pick_n" || group.type === "pick_one"
      ? group.selectedCourses?.length
        ? group.selectedCourses
        : group.coursePool
      : group.coursePool;

  let completed = 0;
  let inProgress = 0;
  let planned = 0;
  const total = group.type === "pick_n" ? (group.required ?? pool.length) : pool.length;

  for (const cId of pool) {
    const c = courses.find((x) => x.id === cId);
    if (!c) continue;
    if (c.status === "completed" && isCourseDegreeSatisfied(c, group)) completed++;
    else if (c.status === "in_progress" || c.status === "registered") inProgress++;
    else if (countPlanned && c.status === "planned") planned++;
  }

  return { completed, inProgress, planned, total, pct: total > 0 ? completed / total : 0 };
}

/**
 * Find the minimum grade needed in targetCourse to reach targetGPA,
 * given the current state of all other courses.
 */
export function solveTargetGrade(
  targetGPA: number,
  targetCourse: Course,
  allCourses: Course[],
  whatIf: Map<string, string>
): { grade: string | null; needed: number } {
  let existingPoints = 0;
  let existingCredits = 0;

  for (const c of allCourses) {
    if (c.id === targetCourse.id) continue;
    const grade = whatIf.get(c.id) ?? c.grade;
    if (!grade || grade === "HS" || c.credits <= 0) continue;
    const pts = gradeToPoints(grade);
    if (pts < 0) continue;
    existingPoints += pts * c.credits;
    existingCredits += c.credits;
  }

  const totalCredits = existingCredits + targetCourse.credits;
  const needed = (targetGPA * totalCredits - existingPoints) / targetCourse.credits;

  if (needed > 4.0) return { grade: null, needed };
  if (needed <= 0) return { grade: "F", needed: 0 };

  // Find minimum grade (iterate lowest → highest)
  const gradeAsc: Array<[string, number]> = [
    ["F", 0.0], ["D-", 0.7], ["D", 1.0], ["D+", 1.3],
    ["C-", 1.7], ["C", 2.0], ["C+", 2.3],
    ["B-", 2.7], ["B", 3.0], ["B+", 3.3],
    ["A-", 3.7], ["A", 4.0],
  ];

  for (const [grade, pts] of gradeAsc) {
    if (pts >= needed) return { grade, needed };
  }

  return { grade: null, needed };
}
