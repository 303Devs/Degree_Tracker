/**
 * Planner validation summary — shared logic for plan-level validation.
 *
 * Produces a single summary object covering:
 *   - unmet requirement groups
 *   - prereq violations
 *   - coreq violations
 *   - overloaded terms (>18 credits)
 *   - underloaded planned terms (<12 credits)
 *   - unplanned required courses
 *   - projected completion term
 *
 * No UI, no server imports — pure domain logic safe for client components.
 */

import type { Course, RequirementGroup, Semester } from "./types";
import {
  sortSemesters,
  semesterOrder,
  calcProgress,
  isRuleSatisfied,
  getMissingIds,
  collectCourseIds,
  NON_DEGREE_CREDIT_GRADES,
} from "./prereqs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrereqViolation {
  courseId: string;
  courseNumber: string;
  semesterId: string;
  semesterLabel: string;
  missing: string[];
}

export interface CoreqViolation {
  courseId: string;
  courseNumber: string;
  semesterId: string;
  semesterLabel: string;
  missing: string[];
}

export interface TermLoadIssue {
  semesterId: string;
  semesterLabel: string;
  credits: number;
  kind: "overloaded" | "underloaded";
}

export interface UnmetRequirement {
  groupId: string;
  groupName: string;
  category: string;
  completed: number;
  total: number;
  inProgress: number;
}

export interface UnplannedRequired {
  courseId: string;
  courseNumber: string;
  /** Which requirement groups need this course */
  groups: string[];
}

export interface PlannerValidationSummary {
  prereqViolations: PrereqViolation[];
  coreqViolations: CoreqViolation[];
  termLoadIssues: TermLoadIssue[];
  unmetRequirements: UnmetRequirement[];
  unplannedRequired: UnplannedRequired[];
  /** Last semester with a planned/in-progress/registered course, or null if all done */
  projectedCompletionTerm: { semesterId: string; semesterLabel: string } | null;
  /** Quick boolean: true if no violations, no unmet reqs, no unplanned required courses */
  clean: boolean;
}

// ---------------------------------------------------------------------------
// Overload / underload thresholds
// ---------------------------------------------------------------------------

export const MAX_TERM_CREDITS = 18;
export const MIN_TERM_CREDITS = 12;

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate an entire planner state.
 *
 * @param courses     All courses in the system
 * @param semesters   All semesters
 * @param requirements All requirement groups
 * @param assignments Map<courseId, semId | "unplanned"> — the current planner
 *                    layout. If omitted, falls back to course.semester.
 */
export function validatePlan(
  courses: Course[],
  semesters: Semester[],
  requirements: RequirementGroup[],
  assignments?: Map<string, string>,
): PlannerValidationSummary {
  const sorted = sortSemesters(semesters);
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  // Resolve assignment for a course
  const getSemId = (c: Course): string =>
    assignments?.get(c.id) ?? c.semester ?? "unplanned";

  // ------- Build semester index -------
  const semIndexMap = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    semIndexMap.set(sorted[i].id, i);
  }

  const semLabelMap = new Map<string, string>();
  for (const s of sorted) {
    semLabelMap.set(s.id, s.label);
  }

  // ------- Build per-semester credit totals & course lists -------
  const semCredits = new Map<string, number>();
  const semCourses = new Map<string, Course[]>();
  for (const s of sorted) {
    semCredits.set(s.id, 0);
    semCourses.set(s.id, []);
  }

  for (const c of courses) {
    const semId = getSemId(c);
    if (semId === "unplanned") continue;
    if (!semCredits.has(semId)) continue;
    semCredits.set(semId, (semCredits.get(semId) ?? 0) + c.credits);
    semCourses.get(semId)?.push(c);
  }

  // ------- Prereq & coreq violations -------
  const prereqViolations: PrereqViolation[] = [];
  const coreqViolations: CoreqViolation[] = [];

  for (const course of courses) {
    const semId = getSemId(course);
    if (semId === "unplanned") continue;
    const targetIdx = semIndexMap.get(semId);
    if (targetIdx === undefined) continue;

    // Build available sets
    const beforeTarget = new Set<string>();
    const atOrBefore = new Set<string>();

    for (const c of courses) {
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

      const cSemId = getSemId(c);
      if (cSemId === "unplanned") continue;
      const cIdx = semIndexMap.get(cSemId);
      if (cIdx === undefined) continue;

      if (cIdx < targetIdx) {
        beforeTarget.add(c.id);
        atOrBefore.add(c.id);
      } else if (cIdx === targetIdx) {
        atOrBefore.add(c.id);
      }
    }

    if (course.prereqs) {
      const missing = getMissingIds(course.prereqs, beforeTarget);
      if (missing.length > 0) {
        prereqViolations.push({
          courseId: course.id,
          courseNumber: course.number,
          semesterId: semId,
          semesterLabel: semLabelMap.get(semId) ?? semId,
          missing,
        });
      }
    }

    if (course.coreqs) {
      const missing = getMissingIds(course.coreqs, atOrBefore);
      if (missing.length > 0) {
        coreqViolations.push({
          courseId: course.id,
          courseNumber: course.number,
          semesterId: semId,
          semesterLabel: semLabelMap.get(semId) ?? semId,
          missing,
        });
      }
    }
  }

  // ------- Term load issues -------
  const termLoadIssues: TermLoadIssue[] = [];
  for (const sem of sorted) {
    const credits = semCredits.get(sem.id) ?? 0;
    if (credits === 0) continue; // skip empty semesters

    if (credits > MAX_TERM_CREDITS) {
      termLoadIssues.push({
        semesterId: sem.id,
        semesterLabel: sem.label,
        credits,
        kind: "overloaded",
      });
    } else if (credits < MIN_TERM_CREDITS && sem.status === "planned") {
      termLoadIssues.push({
        semesterId: sem.id,
        semesterLabel: sem.label,
        credits,
        kind: "underloaded",
      });
    }
  }

  // ------- Unmet requirement groups -------
  const unmetRequirements: UnmetRequirement[] = [];
  for (const group of requirements) {
    const prog = calcProgress(group, courses);
    if (prog.pct < 1.0) {
      unmetRequirements.push({
        groupId: group.id,
        groupName: group.name,
        category: group.category,
        completed: prog.completed,
        total: prog.total,
        inProgress: prog.inProgress,
      });
    }
  }

  // ------- Unplanned required courses -------
  // Courses that appear in requirement groups but are neither completed
  // nor assigned to any semester
  const unplannedRequired: UnplannedRequired[] = [];
  const requiredCourseGroups = new Map<string, string[]>();

  for (const group of requirements) {
    const pool =
      (group.type === "pick_n" || group.type === "pick_one") &&
      group.selectedCourses?.length
        ? group.selectedCourses
        : group.coursePool;

    for (const cId of pool) {
      if (!requiredCourseGroups.has(cId)) {
        requiredCourseGroups.set(cId, []);
      }
      requiredCourseGroups.get(cId)!.push(group.name);
    }
  }

  for (const [courseId, groups] of requiredCourseGroups) {
    const course = courseMap.get(courseId);
    if (!course) continue;
    if (course.status === "completed") continue;
    if (course.status === "in_progress" || course.status === "registered") continue;

    const semId = getSemId(course);
    if (semId !== "unplanned") continue;

    unplannedRequired.push({
      courseId: course.id,
      courseNumber: course.number,
      groups,
    });
  }

  // ------- Projected completion term -------
  let projectedCompletionTerm: PlannerValidationSummary["projectedCompletionTerm"] = null;

  // Find the last semester that has a non-completed course assigned to it
  for (let i = sorted.length - 1; i >= 0; i--) {
    const sem = sorted[i];
    const coursesInSem = semCourses.get(sem.id) ?? [];
    const hasIncomplete = coursesInSem.some(
      (c) => c.status !== "completed"
    );
    if (hasIncomplete) {
      projectedCompletionTerm = {
        semesterId: sem.id,
        semesterLabel: sem.label,
      };
      break;
    }
  }

  const clean =
    prereqViolations.length === 0 &&
    coreqViolations.length === 0 &&
    termLoadIssues.length === 0 &&
    unmetRequirements.length === 0 &&
    unplannedRequired.length === 0;

  return {
    prereqViolations,
    coreqViolations,
    termLoadIssues,
    unmetRequirements,
    unplannedRequired,
    projectedCompletionTerm,
    clean,
  };
}
