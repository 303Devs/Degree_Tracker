/**
 * Delayed-Critical Course Warnings (P3-B Primitive 3)
 *
 * Alice-approved semantics (verbatim):
 * Critical = required course with >=1 sorted unique required downstream dependent in the plan.
 * Use sorted unique required downstream dependents in-plan.
 *
 * Delayed = placed >=2 semesters later than earliest possible placement.
 * Earliest possible placement must be computed from canonical prereq satisfaction, not flattened prereq IDs, especially for OR rules.
 *
 * No-prereq courses use the first plan/horizon term as earliest possible.
 *
 * Completed prereqs before the plan horizon count as available.
 *
 * Missing/unplanned prereqs should not produce bogus delayed-critical signals.
 *
 * Bottleneck severity upgrade applies only if the course is already delayed by >=2 semesters.
 *
 * Severity: warning if delayed 2 semesters, risk if delayed >=3 or delayed >=2 and also bottleneck.
 *
 * Evidence: earliestPossibleTerm, actualTerm, semestersDelayed, downstreamRequiredDependents, requiredOnly: true.
 *
 * Messages stay factual; no recommendation/ranking language.
 */

import type { OptimizationSignal, PlanVariant } from './plan-types';
import type { Course, PrereqRule } from './types';
import { isRuleSatisfied, NON_DEGREE_CREDIT_GRADES } from './prereqs';

const BOTTLENECK_THRESHOLD = 3;

const TERM_PREFIX_ORD: Record<string, number> = {
  SP: 0,
  SU: 1,
  FA: 2,
};

/** Convert a canonical term string like "FA26" or "SP27" to a sortable number. */
function termOrd(term: string): number {
  const prefix = term.slice(0, 2).toUpperCase();
  const yearStr = term.slice(2);
  const year = parseInt(yearStr, 10);
  if (isNaN(year) || !(prefix in TERM_PREFIX_ORD)) return NaN;
  return year * 3 + TERM_PREFIX_ORD[prefix];
}

/**
 * Return the minimal set of course IDs that are necessary to satisfy a prereq rule,
 * given a set of courses known to be available in the plan.
 *
 * For OR rules: if any branch is satisfied by `available`, return only that branch's IDs.
 * For AND rules: return the union of necessary IDs across all sub-rules.
 * For course leaves: always return [courseId].
 *
 * This prevents unused OR alternatives from being registered as critical prereqs.
 */
function getNecessaryPrereqIds(rule: PrereqRule, available: Set<string>): string[] {
  if (rule.type === 'course') return [rule.courseId];
  if (rule.type === 'and') {
    return rule.rules.flatMap((r) => getNecessaryPrereqIds(r, available));
  }
  if (rule.type === 'or') {
    const satisfied = rule.rules.find((r) => isRuleSatisfied(r, available));
    if (satisfied) return getNecessaryPrereqIds(satisfied, available);
    return rule.rules.flatMap((r) => getNecessaryPrereqIds(r, available));
  }
  return [];
}

/** Build a reverse dependency map: prereq courseId -> required in-plan dependents. */
function buildReverseDeps(
  courses: Course[],
  requiredInPlanSet: Set<string>,
  fullAvailable: Set<string>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const course of courses) {
    if (!course.prereqs) continue;
    if (!requiredInPlanSet.has(course.id)) continue;

    for (const prereqId of getNecessaryPrereqIds(course.prereqs, fullAvailable)) {
      const deps = reverse.get(prereqId) ?? new Set<string>();
      deps.add(course.id);
      reverse.set(prereqId, deps);
    }
  }

  return reverse;
}

/** Collect sorted unique downstream dependents (direct + transitive), restricted to required in-plan courses. */
function getDownstreamRequiredDependents(
  courseId: string,
  reverseDeps: Map<string, Set<string>>,
  requiredInPlanSet: Set<string>,
): string[] {
  const reachable = new Set<string>();
  const queue = [...(reverseDeps.get(courseId) ?? new Set<string>())];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === courseId || reachable.has(current)) continue;
    if (!requiredInPlanSet.has(current)) continue;

    reachable.add(current);
    const next = reverseDeps.get(current);
    if (next) {
      for (const dep of next) {
        if (!reachable.has(dep)) queue.push(dep);
      }
    }
  }

  return [...reachable].sort();
}

function derivePlanTerms(plan: PlanVariant, explicitPlanTerms?: string[]): string[] {
  const terms = explicitPlanTerms ?? Object.keys(plan.semesters);
  return [...terms]
    .filter((term) => !isNaN(termOrd(term)))
    .sort((a, b) => termOrd(a) - termOrd(b));
}

function buildCourseToTerm(plan: PlanVariant): Map<string, string> {
  const courseToTerm = new Map<string, string>();
  for (const [term, courseIds] of Object.entries(plan.semesters)) {
    for (const courseId of courseIds) {
      courseToTerm.set(courseId, term);
    }
  }
  return courseToTerm;
}

function buildPlanCourses(plan: PlanVariant): Set<string> {
  const planCourses = new Set<string>();
  for (const courseIds of Object.values(plan.semesters)) {
    for (const courseId of courseIds) planCourses.add(courseId);
  }
  return planCourses;
}

function deriveCompletedSet(
  courses: Course[],
  completedCourseIds?: string[],
): Set<string> {
  if (completedCourseIds) return new Set(completedCourseIds);
  return new Set(
    courses
      .filter((course) => {
        if (course.status !== 'completed') return false;
        if (course.grade && NON_DEGREE_CREDIT_GRADES.has(course.grade)) return false;
        if (course.countedTowardDegree === false) return false;
        return true;
      })
      .map((course) => course.id),
  );
}

function findEarliestPossibleTerm(
  course: Course,
  plan: PlanVariant,
  planTerms: string[],
  completedSet: Set<string>,
): string | null {
  if (planTerms.length === 0) return null;
  if (!course.prereqs) return planTerms[0];

  const available = new Set(completedSet);

  for (const term of planTerms) {
    if (isRuleSatisfied(course.prereqs, available)) return term;

    for (const courseId of plan.semesters[term] ?? []) {
      available.add(courseId);
    }
  }

  return null;
}

/**
 * Analyze a plan for required courses that are both critical and delayed.
 */
export function analyzeDelayedCritical(
  plan: PlanVariant,
  courses: Course[],
  requiredCourseIds: string[],
  options?: {
    /**
     * Term IDs of courses completed before the plan horizon.
     * Completed courses count as available for earliest-possible computation.
     * Default: derive from courses where status === "completed".
     */
    completedCourseIds?: string[];
    /**
     * Ordered list of all terms in the plan horizon (e.g. ["FA26", "SP27", "FA27"]).
     * If omitted, derive from sorted keys of plan.semesters.
     */
    planTerms?: string[];
  },
): OptimizationSignal[] {
  const planTerms = derivePlanTerms(plan, options?.planTerms);
  if (planTerms.length === 0) return [];

  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const courseToTerm = buildCourseToTerm(plan);
  const planCourses = buildPlanCourses(plan);
  const requiredSet = new Set(requiredCourseIds);
  const requiredInPlanSet = new Set([...requiredSet].filter((courseId) => planCourses.has(courseId)));
  const completedSet = deriveCompletedSet(courses, options?.completedCourseIds);
  const fullAvailable = new Set([...planCourses, ...completedSet]);
  const reverseDeps = buildReverseDeps(courses, requiredInPlanSet, fullAvailable);
  const signals: OptimizationSignal[] = [];

  for (const courseId of [...requiredInPlanSet].sort()) {
    const course = courseMap.get(courseId);
    const actualTerm = courseToTerm.get(courseId);
    if (!course || !actualTerm) continue;

    const downstreamRequiredDependents = getDownstreamRequiredDependents(
      courseId,
      reverseDeps,
      requiredInPlanSet,
    );
    if (downstreamRequiredDependents.length === 0) continue;

    const earliestPossibleTerm = findEarliestPossibleTerm(course, plan, planTerms, completedSet);
    if (!earliestPossibleTerm) continue;

    const actualOrd = termOrd(actualTerm);
    const earliestOrd = termOrd(earliestPossibleTerm);
    if (isNaN(actualOrd) || isNaN(earliestOrd)) continue;

    const semestersDelayed = actualOrd - earliestOrd;
    if (semestersDelayed < 2) continue;

    const isBottleneck = downstreamRequiredDependents.length >= BOTTLENECK_THRESHOLD;
    const severity = semestersDelayed >= 3 || isBottleneck ? 'risk' : 'warning';

    signals.push({
      id: `delayed_critical_course:${courseId}`,
      kind: 'delayed_critical_course',
      severity,
      scope: { type: 'course', courseId },
      message: `${courseId} is placed in ${actualTerm}; earliest valid placement after prerequisites is ${earliestPossibleTerm}; delayed by ${semestersDelayed} semester(s); has ${downstreamRequiredDependents.length} downstream required dependent(s).`,
      evidence: {
        earliestPossibleTerm,
        actualTerm,
        semestersDelayed,
        downstreamRequiredDependents,
        requiredOnly: true,
      },
    });
  }

  return signals;
}
