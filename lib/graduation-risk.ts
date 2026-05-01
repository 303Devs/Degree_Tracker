/**
 * Graduation Risk Analysis
 *
 * Detects factual plan-level graduation risks. Signals are observations only —
 * never recommendations.
 */

import type { OptimizationSignal, PlanVariant } from './plan-types';
import type { Course, RequirementGroup } from './types';
import { calcProgress, NON_DEGREE_CREDIT_GRADES } from './prereqs';

export type GraduationCreditSource = 'program' | 'audit' | 'config';

export interface RequiredCreditsInput {
  value: number;
  source: GraduationCreditSource;
}

export interface GraduationRiskOptions {
  /** Canonical required graduation credits. If absent, no credit-shortfall signal is emitted. */
  requiredCredits?: RequiredCreditsInput;
  /** Canonical requirement groups from audit/config data. */
  requirements?: RequirementGroup[];
}

type RequirementCoverage = {
  requiredCount: number;
  coveredCount: number;
  missingCount: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeGraduationRisk(
  plan: PlanVariant,
  courses: Course[],
  options: GraduationRiskOptions = {},
): OptimizationSignal[] {
  const signals: OptimizationSignal[] = [];
  const courseMap = new Map(courses.map((course) => [course.id, course]));

  const creditShortfall = buildCreditShortfallSignal(plan, courseMap, options.requiredCredits);
  if (creditShortfall) signals.push(creditShortfall);

  for (const requirement of options.requirements ?? []) {
    const undercoverage = buildRequirementUndercoverageSignal(requirement, courses);
    if (undercoverage) signals.push(undercoverage);
  }

  const upperDivisionRequirement = findCanonicalUpperDivisionRequirement(options.requirements ?? []);
  if (upperDivisionRequirement) {
    const upperDivisionShortfall = buildUpperDivisionShortfallSignal(upperDivisionRequirement, courses);
    if (upperDivisionShortfall) signals.push(upperDivisionShortfall);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Credit shortfall
// ---------------------------------------------------------------------------

function buildCreditShortfallSignal(
  plan: PlanVariant,
  courseMap: Map<string, Course>,
  requiredCredits?: RequiredCreditsInput,
): OptimizationSignal | null {
  if (!requiredCredits) return null;

  const plannedDegreeApplicableCredits = sumDegreeApplicableCredits(plan, courseMap);
  const creditsShort = requiredCredits.value - plannedDegreeApplicableCredits;
  if (creditsShort <= 0) return null;

  return {
    id: 'graduation_risk:credit_shortfall',
    kind: 'graduation_risk',
    severity: creditsShort > 6 ? 'risk' : 'warning',
    scope: { type: 'plan' },
    message: `Plan is ${creditsShort} degree-applicable credits below the required graduation credit total.`,
    evidence: {
      riskType: 'credit_shortfall',
      requiredCredits: requiredCredits.value,
      plannedDegreeApplicableCredits,
      creditsShort,
      source: requiredCredits.source,
    },
  };
}

function sumDegreeApplicableCredits(plan: PlanVariant, courseMap: Map<string, Course>): number {
  const plannedCourseIds = new Set(Object.values(plan.semesters).flat());
  let credits = 0;

  for (const courseId of plannedCourseIds) {
    const course = courseMap.get(courseId);
    if (!course || !isDegreeApplicableForGraduationCredit(course)) continue;
    credits += course.credits;
  }

  return credits;
}

function isDegreeApplicableForGraduationCredit(course: Course): boolean {
  if (course.countedTowardDegree === false) return false;
  if (course.grade && NON_DEGREE_CREDIT_GRADES.has(course.grade)) return false;
  if (course.status === 'completed' && course.grade === 'F') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Requirement undercoverage
// ---------------------------------------------------------------------------

function buildRequirementUndercoverageSignal(
  requirement: RequirementGroup,
  courses: Course[],
): OptimizationSignal | null {
  const coverage = getRequirementCoverage(requirement, courses);
  if (coverage.missingCount <= 0) return null;

  return {
    id: `graduation_risk:requirement_undercovered:${requirement.id}`,
    kind: 'graduation_risk',
    severity: 'risk',
    scope: { type: 'plan' },
    message: `Requirement group ${requirement.id} has ${coverage.coveredCount} of ${coverage.requiredCount} required planned/completed courses covered.`,
    evidence: {
      riskType: 'requirement_undercovered',
      requirementId: requirement.id,
      requiredCount: coverage.requiredCount,
      coveredCount: coverage.coveredCount,
      missingCount: coverage.missingCount,
    },
  };
}

function getRequirementCoverage(requirement: RequirementGroup, courses: Course[]): RequirementCoverage {
  const progress = calcProgress(requirement, courses, { includePlanned: true });
  const coveredCount = progress.completed + progress.inProgress + progress.planned;
  const requiredCount = getRequiredCount(requirement);
  return {
    requiredCount,
    coveredCount,
    missingCount: Math.max(0, requiredCount - coveredCount),
  };
}

function getRequiredCount(requirement: RequirementGroup): number {
  switch (requirement.type) {
    case 'pick_n':
      return requirement.required ?? requirement.coursePool.length;
    case 'pick_one':
      return 1;
    case 'complete_all':
      return requirement.coursePool.length;
    case 'minimum_hours':
      return requirement.requiredHours ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Upper-division shortfall
// ---------------------------------------------------------------------------

function buildUpperDivisionShortfallSignal(
  requirement: RequirementGroup,
  courses: Course[],
): OptimizationSignal | null {
  const requiredHours = requirement.requiredHours ?? 0;
  if (requiredHours <= 0) return null;

  const progress = calcProgress(requirement, courses, { includePlanned: true });
  const plannedHours = progress.completed + progress.inProgress + progress.planned;
  const hoursShort = requiredHours - plannedHours;
  if (hoursShort <= 0) return null;

  return {
    id: `graduation_risk:upper_division_shortfall:${requirement.id}`,
    kind: 'graduation_risk',
    severity: hoursShort > 6 ? 'risk' : 'warning',
    scope: { type: 'plan' },
    message: `Upper-division requirement ${requirement.id} is ${hoursShort} hours below the required total.`,
    evidence: {
      riskType: 'upper_division_shortfall',
      requirementId: requirement.id,
      requiredHours,
      plannedHours,
      hoursShort,
      source: requirement.category || 'audit',
    },
  };
}

function findCanonicalUpperDivisionRequirement(requirements: RequirementGroup[]): RequirementGroup | null {
  return requirements.find((requirement) => {
    if (requirement.type !== 'minimum_hours') return false;
    const canonicalText = [requirement.id, requirement.name, requirement.category, requirement.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return canonicalText.includes('upper-division') || canonicalText.includes('upper division');
  }) ?? null;
}
