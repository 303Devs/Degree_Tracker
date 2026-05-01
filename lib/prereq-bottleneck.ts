/**
 * Prereq Bottleneck Detection (P3-B Primitive 2)
 *
 * Detects courses that are prerequisites for ≥3 downstream REQUIRED courses.
 * Two signal cases:
 *   1. Missing bottleneck — absent from the plan
 *   2. Late-placement bottleneck — same semester as or after a downstream dependent
 *
 * Alice-approved semantics (2026-04-30).
 * No recommendation language — signals are factual observations only.
 */

import type { PlanVariant, OptimizationSignal } from './plan-types';
import type { Course } from './types';
import { collectCourseIds } from './prereqs';

/** Minimum downstream required dependents for a course to qualify as a bottleneck. */
const BOTTLENECK_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Semester ordering (term string → sortable number)
// ---------------------------------------------------------------------------

const TERM_PREFIX_ORD: Record<string, number> = {
  SP: 0,
  SU: 1,
  FA: 2,
};

/**
 * Convert a canonical term string like "FA26" or "SP27" to a sortable number.
 * Returns NaN for unrecognized formats.
 */
function termOrd(term: string): number {
  const prefix = term.slice(0, 2).toUpperCase();
  const yearStr = term.slice(2);
  const year = parseInt(yearStr, 10);
  if (isNaN(year) || !(prefix in TERM_PREFIX_ORD)) return NaN;
  return year * 3 + TERM_PREFIX_ORD[prefix];
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build a reverse dependency map: courseId → set of courses that directly depend on it.
 * Only includes edges where the dependent is in the required set.
 */
function buildReverseDeps(
  courses: Course[],
  requiredSet: Set<string>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const course of courses) {
    if (!course.prereqs) continue;
    if (!requiredSet.has(course.id)) continue;

    const prereqIds = collectCourseIds(course.prereqs);
    for (const pid of prereqIds) {
      let deps = reverse.get(pid);
      if (!deps) {
        deps = new Set<string>();
        reverse.set(pid, deps);
      }
      deps.add(course.id);
    }
  }

  return reverse;
}

/**
 * Collect all downstream dependents (direct + transitive) for a given course.
 * Returns { direct, transitive } — transitive excludes direct dependents.
 */
function getDownstream(
  courseId: string,
  reverseDeps: Map<string, Set<string>>,
): { direct: string[]; transitive: string[] } {
  const directSet = reverseDeps.get(courseId) ?? new Set<string>();
  const direct = [...directSet].sort();

  const allReachable = new Set<string>();
  const queue = [...directSet];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (allReachable.has(current)) continue;
    allReachable.add(current);
    const next = reverseDeps.get(current);
    if (next) {
      for (const n of next) {
        if (!allReachable.has(n)) queue.push(n);
      }
    }
  }

  const transitive = [...allReachable]
    .filter((id) => !directSet.has(id))
    .sort();

  return { direct, transitive };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a plan for prerequisite bottleneck signals.
 *
 * @param plan - The plan variant to analyze
 * @param courses - All known courses (with prereq data)
 * @param requiredCourseIds - IDs of courses that are required for the degree
 * @returns Array of optimization signals (may be empty)
 */
export function analyzePrereqBottlenecks(
  plan: PlanVariant,
  courses: Course[],
  requiredCourseIds: string[],
): OptimizationSignal[] {
  const requiredSet = new Set(requiredCourseIds);
  const reverseDeps = buildReverseDeps(courses, requiredSet);

  // Build course→term lookup from plan
  const courseToTerm = new Map<string, string>();
  for (const [term, courseIds] of Object.entries(plan.semesters)) {
    for (const cid of courseIds) {
      courseToTerm.set(cid, term);
    }
  }

  // All courses in the plan
  const planCourses = new Set<string>();
  for (const courseIds of Object.values(plan.semesters)) {
    for (const cid of courseIds) {
      planCourses.add(cid);
    }
  }

  // Collect all unique course IDs that could be bottlenecks
  // (any course that has at least one downstream required dependent)
  const candidates = new Set<string>();
  for (const cid of requiredSet) {
    const direct = reverseDeps.get(cid);
    if (direct && direct.size > 0) {
      // cid has dependents — but we check the prereqs, not cid itself
    }
  }
  // Actually: candidates are courses that appear as prereqs of required courses
  for (const [prereqId] of reverseDeps) {
    candidates.add(prereqId);
  }

  const signals: OptimizationSignal[] = [];

  for (const courseId of candidates) {
    const { direct, transitive } = getDownstream(courseId, reverseDeps);
    const downstreamCount = direct.length + transitive.length;

    if (downstreamCount < BOTTLENECK_THRESHOLD) continue;

    const inPlan = planCourses.has(courseId);

    if (!inPlan) {
      // Case 1: Missing bottleneck
      signals.push({
        id: `prereq_bottleneck:${courseId}:missing`,
        kind: 'prereq_bottleneck',
        severity: 'warning',
        scope: { type: 'course', courseId },
        message: `${courseId} is absent from the plan and is a prerequisite for ${downstreamCount} downstream required courses.`,
        evidence: {
          threshold: BOTTLENECK_THRESHOLD,
          downstreamCount,
          directDependents: direct,
          transitiveDependents: transitive,
          requiredOnly: true,
          missing: true,
        },
      });
    } else {
      // Case 2: Check late placement
      const bottleneckTerm = courseToTerm.get(courseId)!;
      const bottleneckOrd = termOrd(bottleneckTerm);

      // Find downstream courses placed in same semester or before the bottleneck
      const allDownstream = [...direct, ...transitive];
      const lateDownstream: string[] = [];

      for (const depId of allDownstream) {
        const depTerm = courseToTerm.get(depId);
        if (!depTerm) continue; // dependent not in plan
        const depOrd = termOrd(depTerm);
        if (isNaN(depOrd) || isNaN(bottleneckOrd)) continue;
        if (depOrd <= bottleneckOrd) {
          lateDownstream.push(depId);
        }
      }

      if (lateDownstream.length > 0) {
        // Find the earliest problematic downstream term
        const earliestProblematicDownstreamTerm = lateDownstream
          .map((id) => courseToTerm.get(id)!)
          .sort((a, b) => termOrd(a) - termOrd(b))[0];

        // Chain depth: max depth from bottleneck to any late dependent
        const chainDepth = computeChainDepth(courseId, new Set(lateDownstream), reverseDeps);

        signals.push({
          id: `prereq_bottleneck:${courseId}:late`,
          kind: 'prereq_bottleneck',
          severity: 'warning',
          scope: { type: 'course', courseId },
          message: `${courseId} is placed in ${bottleneckTerm} but downstream course ${lateDownstream[0]} is also in ${courseToTerm.get(lateDownstream[0])!}.`,
          evidence: {
            threshold: BOTTLENECK_THRESHOLD,
            downstreamCount,
            directDependents: direct,
            transitiveDependents: transitive,
            requiredOnly: true,
            placement: {
              bottleneckTerm,
              earliestProblematicDownstreamTerm,
              problematicDownstreamDependents: lateDownstream.sort(),
              chainDepth,
            },
          },
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum chain depth from a source to any target in the targets set,
 * traversing the reverse dependency graph.
 */
function computeChainDepth(
  source: string,
  targets: Set<string>,
  reverseDeps: Map<string, Set<string>>,
): number {
  // BFS from source through forward deps (using reverseDeps to traverse)
  let maxDepth = 0;
  const visited = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: source, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) && visited.get(id)! >= depth) continue;
    visited.set(id, depth);

    if (targets.has(id) && depth > maxDepth) {
      maxDepth = depth;
    }

    const deps = reverseDeps.get(id);
    if (deps) {
      for (const dep of deps) {
        queue.push({ id: dep, depth: depth + 1 });
      }
    }
  }

  return maxDepth;
}
