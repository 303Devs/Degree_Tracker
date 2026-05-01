/**
 * Semester Load Analysis
 *
 * Detects overloaded and underloaded semesters in a plan variant.
 * Produces OptimizationSignal[] with factual observations only — no recommendations.
 *
 * Thresholds:
 *   < 12 credits → warning (underload)
 *   > 18 and < 21 credits → warning (overload)
 *   >= 21 credits → risk (extreme overload)
 *   12-18 credits → no signal
 *
 * Canonical repo: /Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
 */

import type { PlanVariant, OptimizationSignal } from './plan-types';
import type { Course } from './types';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const UNDERLOAD_THRESHOLD = 12; // < 12 is underload
const OVERLOAD_THRESHOLD = 18;  // > 18 is overload
const EXTREME_OVERLOAD_THRESHOLD = 21; // >= 21 is extreme overload (risk)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze semester credit loads in a plan and return optimization signals.
 *
 * @param plan     Plan variant with semester → courseId[] assignments
 * @param courses  Course catalog for credit lookups
 * @returns        OptimizationSignal[] for semester_load kind only
 */
export function analyzeSemesterLoad(
  plan: PlanVariant,
  courses: Course[],
): OptimizationSignal[] {
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const signals: OptimizationSignal[] = [];

  for (const [semesterId, courseIds] of Object.entries(plan.semesters)) {
    const credits = sumCredits(courseIds, courseMap);

    if (credits >= EXTREME_OVERLOAD_THRESHOLD) {
      signals.push({
        id: `semester_load:${semesterId}:extreme_overload`,
        kind: 'semester_load',
        severity: 'risk',
        scope: { type: 'semester', term: semesterId },
        message: `Semester ${semesterId} has ${credits} credits (extreme overload)`,
        evidence: { credits, courseCount: courseIds.length, threshold: EXTREME_OVERLOAD_THRESHOLD },
      });
    } else if (credits > OVERLOAD_THRESHOLD) {
      signals.push({
        id: `semester_load:${semesterId}:overload`,
        kind: 'semester_load',
        severity: 'warning',
        scope: { type: 'semester', term: semesterId },
        message: `Semester ${semesterId} is overloaded at ${credits} credits`,
        evidence: { credits, courseCount: courseIds.length, threshold: OVERLOAD_THRESHOLD },
      });
    } else if (credits < UNDERLOAD_THRESHOLD) {
      signals.push({
        id: `semester_load:${semesterId}:underload`,
        kind: 'semester_load',
        severity: 'warning',
        scope: { type: 'semester', term: semesterId },
        message: `Semester ${semesterId} is underloaded at ${credits} credits`,
        evidence: { credits, courseCount: courseIds.length, threshold: UNDERLOAD_THRESHOLD },
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum credits for a list of course IDs. Unknown courses contribute 0. */
function sumCredits(courseIds: string[], courseMap: Map<string, Course>): number {
  let total = 0;
  for (const id of courseIds) {
    const course = courseMap.get(id);
    if (course) total += course.credits;
  }
  return total;
}
