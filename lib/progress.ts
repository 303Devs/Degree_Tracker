/**
 * Progress semantics — explains how each course counts.
 *
 * Surfaces the nuance:
 *   - counts toward degree requirements?
 *   - counts toward GPA?
 *   - counts toward earned hours?
 *   - excluded and why?
 *
 * No server imports — pure domain logic safe for client components.
 */

import type { Course, RequirementGroup } from "./types";
import { GRADE_SCALE, NON_DEGREE_CREDIT_GRADES } from "./prereqs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CountingBucket = "degree" | "gpa" | "earned_hours";

export interface CourseCountingSummary {
  courseId: string;
  courseNumber: string;
  courseName: string;
  credits: number;
  grade: string | null;
  status: string;

  /** Counts toward degree requirement fulfillment */
  countsTowardDegree: boolean;
  /** Counts toward GPA calculation */
  countsTowardGPA: boolean;
  /** Counts toward earned credit hours */
  countsTowardEarnedHours: boolean;
  /** Human-readable explanation of exclusion */
  excludeReason: string | null;
  /** Which requirement groups this course satisfies */
  requirementGroups: string[];
}

export interface ProgressSemanticsSummary {
  courses: CourseCountingSummary[];

  /** Aggregate stats */
  totalCourses: number;
  degreeCountedCourses: number;
  gpaCountedCourses: number;
  earnedHoursCountedCourses: number;

  degreeCountedCredits: number;
  gpaCountedCredits: number;
  earnedHoursCountedCredits: number;

  /** Courses excluded from at least one bucket, with reasons */
  exclusions: CourseCountingSummary[];
}

// ---------------------------------------------------------------------------
// Grade helpers
// ---------------------------------------------------------------------------

function hasGradableGrade(course: Course): boolean {
  if (!course.grade) return false;
  // Non-GPA grades: HS, W, P, NR, IP, etc.
  return GRADE_SCALE[course.grade] !== undefined;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compute counting semantics for all courses.
 *
 * @param courses      All courses
 * @param requirements Requirement groups (used to identify which reqs a course satisfies)
 */
export function computeProgressSemantics(
  courses: Course[],
  requirements: RequirementGroup[],
): ProgressSemanticsSummary {
  // Build course → requirement group mapping
  const courseReqGroups = new Map<string, string[]>();
  for (const group of requirements) {
    const pool =
      (group.type === "pick_n" || group.type === "pick_one") &&
      group.selectedCourses?.length
        ? group.selectedCourses
        : group.coursePool;

    for (const cId of pool) {
      if (!courseReqGroups.has(cId)) courseReqGroups.set(cId, []);
      courseReqGroups.get(cId)!.push(group.name);
    }
  }

  const summaries: CourseCountingSummary[] = [];

  for (const c of courses) {
    // Degree: defaults to true unless explicitly excluded or grade is W/NR/IP (no credit)
    const countsTowardDegree =
      c.countedTowardDegree !== false &&
      !(c.status === "completed" && c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade));

    // GPA: defaults to true unless explicitly excluded or non-gradable grade
    const countsTowardGPA =
      c.countsTowardGPA !== false &&
      c.status === "completed" &&
      hasGradableGrade(c);

    // Earned hours: defaults to true for completed courses unless explicitly excluded
    // F grades don't earn hours; W/NR/IP don't earn hours (non-degree-credit grades)
    const earnedExplicit = c.countsTowardEarnedHours;
    let countsTowardEarnedHours: boolean;
    if (earnedExplicit !== undefined) {
      countsTowardEarnedHours = earnedExplicit;
    } else if (c.status !== "completed") {
      countsTowardEarnedHours = false;
    } else if (c.grade === "F") {
      countsTowardEarnedHours = false;
    } else if (c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)) {
      countsTowardEarnedHours = false;
    } else {
      countsTowardEarnedHours = true;
    }

    // Build exclude reason
    let excludeReason: string | null = c.excludeReason ?? null;
    if (!excludeReason) {
      const reasons: string[] = [];
      if (!countsTowardDegree && c.countedTowardDegree === false) {
        reasons.push("excluded from degree");
      }
      if (c.grade === "F" && !countsTowardEarnedHours) {
        reasons.push("F grade — no earned hours");
      }
      if (c.grade === "W") {
        reasons.push("withdrawn — no credit");
      }
      if (c.grade === "NR") {
        reasons.push("not reported — no credit");
      }
      if (c.grade === "IP") {
        reasons.push("in progress — no credit yet");
      }
      if (c.grade === "HS" || (c.grade && !hasGradableGrade(c) && c.grade !== "F" && c.grade !== "W")) {
        reasons.push(`${c.grade} grade — not included in GPA`);
      }
      if (reasons.length > 0) excludeReason = reasons.join("; ");
    }

    summaries.push({
      courseId: c.id,
      courseNumber: c.number,
      courseName: c.name,
      credits: c.credits,
      grade: c.grade ?? null,
      status: c.status,
      countsTowardDegree,
      countsTowardGPA,
      countsTowardEarnedHours,
      excludeReason,
      requirementGroups: courseReqGroups.get(c.id) ?? [],
    });
  }

  // Aggregates
  const completed = summaries.filter((s) => s.status === "completed");
  const degreeCountedCourses = completed.filter((s) => s.countsTowardDegree).length;
  const gpaCountedCourses = completed.filter((s) => s.countsTowardGPA).length;
  const earnedHoursCountedCourses = completed.filter((s) => s.countsTowardEarnedHours).length;

  const degreeCountedCredits = completed
    .filter((s) => s.countsTowardDegree)
    .reduce((sum, s) => sum + s.credits, 0);
  const gpaCountedCredits = completed
    .filter((s) => s.countsTowardGPA)
    .reduce((sum, s) => sum + s.credits, 0);
  const earnedHoursCountedCredits = completed
    .filter((s) => s.countsTowardEarnedHours)
    .reduce((sum, s) => sum + s.credits, 0);

  // Exclusions: completed courses excluded from at least one bucket
  const exclusions = completed.filter(
    (s) => !s.countsTowardDegree || !s.countsTowardGPA || !s.countsTowardEarnedHours,
  );

  return {
    courses: summaries,
    totalCourses: courses.length,
    degreeCountedCourses,
    gpaCountedCourses,
    earnedHoursCountedCourses,
    degreeCountedCredits,
    gpaCountedCredits,
    earnedHoursCountedCredits,
    exclusions,
  };
}
