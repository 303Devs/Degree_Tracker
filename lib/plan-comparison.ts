/**
 * Plan Comparison Engine
 *
 * Pure, deterministic comparison of two PlanVariant instances.
 * Produces structured diffs across courses, semesters, requirements,
 * and prerequisite risk. No recommendations, no ranking.
 *
 * Canonical repo: /Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
 */

import {
  PlanVariant,
  PlanComparison,
  PlanComparisonResult,
  PlanComparisonPlanSummary,
  PlanValidationIssue,
  CourseDiffs,
  MovedCourse,
  SemesterDiff,
  RequirementDiff,
  PrereqRiskDiff,
  ComparisonSummary,
  RiskLevel,
  CourseId,
  SemesterId,
} from './plan-types';
import { computeDerivedPlanData, validatePlansForComparison } from './plan-normalization';
import { isRuleSatisfied } from './prereqs';
import { calcProgress } from './prereqs';
import type { Course, RequirementGroup } from './types';

// ---------------------------------------------------------------------------
// Top-level comparison function
// ---------------------------------------------------------------------------

/**
 * Compare two plan variants and produce a structured diff.
 *
 * Validates both plans before comparison. If either plan has error-level
 * issues, comparison is blocked and success=false is returned.
 *
 * @param planA     Baseline plan variant (already normalized)
 * @param planB     Comparison plan variant (already normalized)
 * @param courses   Full course catalog for credit lookups and prereq data
 * @param requirements  Requirement groups for coverage analysis
 */
export function comparePlans(
  planA: PlanVariant,
  planB: PlanVariant,
  courses: Course[],
  requirements: RequirementGroup[],
): PlanComparisonResult {
  // Validate plans before comparison
  const issues: PlanValidationIssue[] = [];

  // Plan-level validation
  const pairIssues = validatePlansForComparison(planA, planB);
  issues.push(...pairIssues);

  // Check for duplicate course assignments within each plan
  issues.push(...detectDuplicateCourses(planA, 'A'));
  issues.push(...detectDuplicateCourses(planB, 'B'));

  // Compute derived data for both plans
  const derivedA = computeDerivedPlanData(planA, courses);
  const derivedB = computeDerivedPlanData(planB, courses);

  issues.push(...derivedA.issues);
  issues.push(...derivedB.issues);

  // Block on error-level issues
  const hasErrors = issues.some(i => i.type === 'error');
  if (hasErrors) {
    return { success: false, comparison: undefined, issues };
  }

  // Both plans must have derived data at this point
  if (!derivedA.normalizedPlan || !derivedB.normalizedPlan) {
    return { success: false, comparison: undefined, issues };
  }

  const normA = derivedA.normalizedPlan;
  const normB = derivedB.normalizedPlan;
  const courseMap = new Map(courses.map(c => [c.id, c]));

  // Build comparison dimensions
  const courseDiffs = compareCourseAssignments(planA, planB);
  const semesterDiffs = compareSemesterLoads(planA, planB, courseMap);
  const requirementDiffs = compareRequirementCoverage(planA, planB, courses, requirements);
  const prereqRiskDiffs = comparePrereqRisks(planA, planB, courses);

  // Build plan summaries
  const planASummary = buildPlanSummary(planA, normA);
  const planBSummary = buildPlanSummary(planB, normB);

  // Build aggregate summary
  const summary = buildComparisonSummary(
    courseDiffs,
    semesterDiffs,
    requirementDiffs,
    prereqRiskDiffs,
    normA,
    normB,
  );

  const comparison: PlanComparison = {
    planA: planASummary,
    planB: planBSummary,
    courseDiffs,
    semesterDiffs,
    requirementDiffs,
    prereqRiskDiffs,
    summary,
  };

  return { success: true, comparison, issues };
}

// ---------------------------------------------------------------------------
// Plan summary
// ---------------------------------------------------------------------------

function buildPlanSummary(
  plan: PlanVariant,
  normalized: { allCourses: string[]; totalCredits: number; creditsBysemester: Record<string, number> },
): PlanComparisonPlanSummary {
  const semCredits = Object.values(normalized.creditsBysemester);
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    semesterCount: Object.keys(plan.semesters).length,
    totalCourses: normalized.allCourses.length,
    totalCredits: normalized.totalCredits,
    maxSemesterCredits: semCredits.length > 0 ? Math.max(...semCredits) : 0,
  };
}

// ---------------------------------------------------------------------------
// Course diff
// ---------------------------------------------------------------------------

/**
 * Build course-level diff between two plans.
 * A course is "moved" if it exists in both plans but in different semesters.
 * Moved courses do NOT appear in onlyInA/onlyInB.
 */
export function compareCourseAssignments(
  planA: PlanVariant,
  planB: PlanVariant,
): CourseDiffs {
  // Build course → semester maps
  const mapA = buildCourseToSemesterMap(planA);
  const mapB = buildCourseToSemesterMap(planB);

  const allCourseIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const onlyInA: CourseId[] = [];
  const onlyInB: CourseId[] = [];
  const moved: MovedCourse[] = [];
  const unchanged: CourseId[] = [];

  for (const courseId of sorted(allCourseIds)) {
    const semA = mapA.get(courseId);
    const semB = mapB.get(courseId);

    if (semA && !semB) {
      onlyInA.push(courseId);
    } else if (!semA && semB) {
      onlyInB.push(courseId);
    } else if (semA && semB) {
      if (semA !== semB) {
        moved.push({ courseId, fromSemester: semA, toSemester: semB });
      } else {
        unchanged.push(courseId);
      }
    }
  }

  // Sort moved by fromSemester, then toSemester, then courseId
  moved.sort((a, b) =>
    a.fromSemester.localeCompare(b.fromSemester) ||
    a.toSemester.localeCompare(b.toSemester) ||
    a.courseId.localeCompare(b.courseId),
  );

  return { onlyInA, onlyInB, moved, unchanged };
}

// ---------------------------------------------------------------------------
// Semester diff
// ---------------------------------------------------------------------------

/**
 * Diff semester loads across the union of semesters from both plans.
 */
export function compareSemesterLoads(
  planA: PlanVariant,
  planB: PlanVariant,
  courseMap: Map<string, Course>,
): SemesterDiff[] {
  const allSemesterIds = new Set([
    ...Object.keys(planA.semesters),
    ...Object.keys(planB.semesters),
  ]);

  const diffs: SemesterDiff[] = [];

  for (const semId of canonicalSemesterSort([...allSemesterIds])) {
    const coursesA = planA.semesters[semId] ?? [];
    const coursesB = planB.semesters[semId] ?? [];

    const setA = new Set(coursesA);
    const setB = new Set(coursesB);

    const creditsA = sumCredits(coursesA, courseMap);
    const creditsB = sumCredits(coursesB, courseMap);

    const coursesOnlyInA = sorted(new Set([...coursesA].filter(c => !setB.has(c))));
    const coursesOnlyInB = sorted(new Set([...coursesB].filter(c => !setA.has(c))));

    diffs.push({
      semesterId: semId,
      creditsA,
      creditsB,
      creditDelta: creditsB - creditsA,
      coursesOnlyInA,
      coursesOnlyInB,
    });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Requirement coverage diff
// ---------------------------------------------------------------------------

/**
 * Compare requirement coverage between two plans.
 * Uses canonical calcProgress from prereqs.ts — no parallel engine.
 */
export function compareRequirementCoverage(
  planA: PlanVariant,
  planB: PlanVariant,
  courses: Course[],
  requirements: RequirementGroup[],
): RequirementDiff[] {
  // Build synthetic course lists for each plan by overlaying plan semester
  // assignments onto the base course data.
  const coursesA = buildPlanCourseView(planA, courses);
  const coursesB = buildPlanCourseView(planB, courses);

  const diffs: RequirementDiff[] = [];

  for (const group of requirements) {
    const progA = calcProgress(group, coursesA);
    const progB = calcProgress(group, coursesB);

    // Planned-coverage: completed + inProgress + planned courses
    const plannedProgA = calcProgress(group, coursesA, { includePlanned: true });
    const plannedProgB = calcProgress(group, coursesB, { includePlanned: true });
    const coveredA = plannedProgA.completed + plannedProgA.inProgress + plannedProgA.planned;
    const coveredB = plannedProgB.completed + plannedProgB.inProgress + plannedProgB.planned;

    diffs.push({
      groupId: group.id,
      groupName: group.name,
      completedA: progA.completed,
      completedB: progB.completed,
      total: progA.total, // same requirement, same total
      delta: progB.completed - progA.completed,
      coveredA,
      coveredB,
      coverageDelta: coveredB - coveredA,
    });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Prereq risk diff
// ---------------------------------------------------------------------------

/**
 * Compare prerequisite risk for courses across two plans.
 * Uses canonical isRuleSatisfied from prereqs.ts.
 *
 * A course's risk level:
 * - "ok": all prereqs satisfied by courses in earlier semesters
 * - "warning": course only exists in one plan (can't fully evaluate)
 * - "blocked": prereqs NOT satisfied by courses in earlier semesters
 */
export function comparePrereqRisks(
  planA: PlanVariant,
  planB: PlanVariant,
  courses: Course[],
): PrereqRiskDiff[] {
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const mapA = buildCourseToSemesterMap(planA);
  const mapB = buildCourseToSemesterMap(planB);

  const allCourseIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const diffs: PrereqRiskDiff[] = [];

  for (const courseId of sorted(allCourseIds)) {
    const course = courseMap.get(courseId);
    if (!course?.prereqs) continue; // No prereqs to validate

    const semA = mapA.get(courseId);
    const semB = mapB.get(courseId);

    const riskInA = semA
      ? evaluatePrereqRisk(courseId, semA, planA, courseMap)
      : 'warning' as RiskLevel;
    const riskInB = semB
      ? evaluatePrereqRisk(courseId, semB, planB, courseMap)
      : 'warning' as RiskLevel;

    const changed = riskInA !== riskInB;

    if (changed || riskInA === 'blocked' || riskInB === 'blocked') {
      let reason: string | undefined;
      if (riskInA === 'ok' && riskInB === 'blocked') {
        reason = `Prereq risk introduced in plan B`;
      } else if (riskInA === 'blocked' && riskInB === 'ok') {
        reason = `Prereq risk resolved in plan B`;
      } else if (!semA) {
        reason = `Course only in plan B`;
      } else if (!semB) {
        reason = `Course only in plan A`;
      }

      diffs.push({
        courseId,
        semesterA: semA,
        semesterB: semB,
        riskInA,
        riskInB,
        changed,
        reason,
      });
    }
  }

  return diffs;
}

/**
 * Evaluate prereq risk for a single course in a single plan.
 */
function evaluatePrereqRisk(
  courseId: string,
  semesterId: string,
  plan: PlanVariant,
  courseMap: Map<string, Course>,
): RiskLevel {
  const course = courseMap.get(courseId);
  if (!course?.prereqs) return 'ok';

  // Build set of courses available before this semester
  const semOrder = canonicalSemesterSort(Object.keys(plan.semesters));
  const targetIdx = semOrder.indexOf(semesterId);
  if (targetIdx === -1) return 'warning';

  const availableBefore = new Set<string>();
  for (let i = 0; i < targetIdx; i++) {
    const courses = plan.semesters[semOrder[i]] ?? [];
    for (const cId of courses) {
      availableBefore.add(cId);
    }
  }

  // Also include completed courses from the base data
  for (const [id, c] of courseMap) {
    if (c.status === 'completed' && c.grade && !['W', 'NR', 'IP'].includes(c.grade)) {
      availableBefore.add(id);
    }
  }

  return isRuleSatisfied(course.prereqs, availableBefore) ? 'ok' : 'blocked';
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildComparisonSummary(
  courseDiffs: CourseDiffs,
  semesterDiffs: SemesterDiff[],
  requirementDiffs: RequirementDiff[],
  prereqRiskDiffs: PrereqRiskDiff[],
  normA: { totalCredits: number; creditsBysemester: Record<string, number> },
  normB: { totalCredits: number; creditsBysemester: Record<string, number> },
): ComparisonSummary {
  const semCreditsA = Object.values(normA.creditsBysemester);
  const semCreditsB = Object.values(normB.creditsBysemester);

  return {
    movedCourseCount: courseDiffs.moved.length,
    coursesOnlyInACount: courseDiffs.onlyInA.length,
    coursesOnlyInBCount: courseDiffs.onlyInB.length,
    semestersWithChanges: semesterDiffs.filter(
      d => d.coursesOnlyInA.length > 0 || d.coursesOnlyInB.length > 0,
    ).length,
    requirementsImprovedInB: requirementDiffs.filter(d => d.delta > 0).length,
    requirementsRegressedInB: requirementDiffs.filter(d => d.delta < 0).length,
    coverageImprovedInB: requirementDiffs.filter(d => d.coverageDelta > 0).length,
    coverageRegressedInB: requirementDiffs.filter(d => d.coverageDelta < 0).length,
    prereqRisksAddedInB: prereqRiskDiffs.filter(
      d => d.riskInA === 'ok' && d.riskInB === 'blocked',
    ).length,
    prereqRisksRemovedInB: prereqRiskDiffs.filter(
      d => d.riskInA === 'blocked' && d.riskInB === 'ok',
    ).length,
    totalCreditsA: normA.totalCredits,
    totalCreditsB: normB.totalCredits,
    maxSemesterCreditsA: semCreditsA.length > 0 ? Math.max(...semCreditsA) : 0,
    maxSemesterCreditsB: semCreditsB.length > 0 ? Math.max(...semCreditsB) : 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect duplicate course assignments within a single plan.
 * A course appearing in multiple semesters is an error — it would double-count credits.
 */
function detectDuplicateCourses(plan: PlanVariant, planLabel: string): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const seen = new Map<string, string>(); // courseId → first semesterId

  for (const [semId, courseIds] of Object.entries(plan.semesters)) {
    for (const courseId of courseIds) {
      const firstSem = seen.get(courseId);
      if (firstSem) {
        issues.push({
          type: 'error',
          code: 'DUPLICATE_COURSE_ASSIGNMENT',
          message: `Duplicate course in plan ${planLabel} (${plan.name}): ${courseId} appears in both ${firstSem} and ${semId}`,
          context: { course: courseId, semester: semId },
        });
      } else {
        seen.set(courseId, semId);
      }
    }
  }

  return issues;
}

/** Build a courseId → semesterId map from a plan's semester assignments. */
function buildCourseToSemesterMap(plan: PlanVariant): Map<string, string> {
  const map = new Map<string, string>();
  for (const [semId, courseIds] of Object.entries(plan.semesters)) {
    for (const courseId of courseIds) {
      map.set(courseId, semId);
    }
  }
  return map;
}

/**
 * Build a synthetic course array reflecting a plan's semester assignments.
 * Courses in the plan get status="planned" + the plan's semester assignment.
 * Courses not in the plan keep their original status.
 */
function buildPlanCourseView(plan: PlanVariant, baseCourses: Course[]): Course[] {
  const planMap = buildCourseToSemesterMap(plan);
  return baseCourses.map(c => {
    const planSem = planMap.get(c.id);
    if (planSem) {
      return { ...c, semester: planSem, status: c.status === 'completed' ? c.status : 'planned' as const };
    }
    return c;
  });
}

/** Sum credits for a list of course IDs. */
function sumCredits(courseIds: string[], courseMap: Map<string, Course>): number {
  let total = 0;
  for (const id of courseIds) {
    const course = courseMap.get(id);
    if (course) total += course.credits;
  }
  return total;
}

/** Sort a set of strings lexically. */
function sorted(items: Set<string>): string[] {
  return [...items].sort();
}

/**
 * Sort semester IDs in canonical order: SP < SU < FA within a year,
 * then by year ascending.
 */
function canonicalSemesterSort(semesters: string[]): string[] {
  const typeOrder: Record<string, number> = { SP: 0, SU: 1, FA: 2 };
  return [...semesters].sort((a, b) => {
    const yearA = parseInt(a.slice(2));
    const yearB = parseInt(b.slice(2));
    if (yearA !== yearB) return yearA - yearB;
    const typeA = typeOrder[a.slice(0, 2)] ?? 3;
    const typeB = typeOrder[b.slice(0, 2)] ?? 3;
    return typeA - typeB;
  });
}
