import type { PlanComparisonResult, PlanVariant, OptimizationSignal } from './plan-types';
import type { Course, RequirementGroup } from './types';
import { analyzeSemesterLoad } from './semester-load';
import { analyzeGraduationRisk, type RequiredCreditsInput } from './graduation-risk';
import { calcProgress } from './prereqs';

export type RecommendationType =
  | 'reduce_semester_load'
  | 'fill_underloaded_term'
  | 'sequence_prereq_bottleneck'
  | 'accelerate_delayed_critical'
  | 'cover_requirement_gap'
  | 'address_credit_shortfall'
  | 'address_upper_division_shortfall'
  | 'compare_plan_tradeoff';

export type RecommendationPriority = 'low' | 'medium' | 'high' | 'blocking';
export type RecommendationConfidence = 'low' | 'medium' | 'high';

export interface PlanningRecommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  scope:
    | { type: 'plan'; planId?: string }
    | { type: 'semester'; planId?: string; term: string }
    | { type: 'course'; planId?: string; courseId: string }
    | { type: 'requirement'; planId?: string; requirementId: string }
    | { type: 'comparison'; planAId: string; planBId: string };
  title: string;
  message: string;
  action?: {
    kind:
      | 'move_course'
      | 'add_course'
      | 'remove_course'
      | 'review_requirement'
      | 'compare_plans'
      | 'no_action_generated';
    courseId?: string;
    fromTerm?: string;
    toTerm?: string;
    requirementId?: string;
  };
  evidence: {
    sourceSignalIds: string[];
    sourceComparisonFacts: string[];
    sourceDataKinds: Array<'audit' | 'program' | 'config' | 'course' | 'plan' | 'comparison' | 'optimization_signal'>;
    facts: Record<string, unknown>;
    constraintSet?: string;
  };
  invalidatedBy: string[];
}

export interface RecommendationOptions {
  signals?: OptimizationSignal[];
  planComparison?: PlanComparisonResult;
  requiredCredits?: RequiredCreditsInput;
  requirements?: RequirementGroup[];
}

const RECOMMENDATION_TYPES = new Set<RecommendationType>([
  'reduce_semester_load',
  'fill_underloaded_term',
  'sequence_prereq_bottleneck',
  'accelerate_delayed_critical',
  'cover_requirement_gap',
  'address_credit_shortfall',
  'address_upper_division_shortfall',
  'compare_plan_tradeoff',
]);

const FORBIDDEN_LANGUAGE = [
  'optimal',
  'best',
  'perfect',
  'ideal',
  'guaranteed',
  'ensures',
  'will graduate',
  'on track to graduate',
  'should',
  'must',
  'need to',
  'have to',
  'required to take',
  'advisor-approved',
  'cu-approved',
  'official',
  'compliant',
  'smart',
  'recommended by ai',
  'better path',
  'worse path',
];

export function generateRecommendations(
  plan: PlanVariant,
  courses: Course[],
  options: RecommendationOptions = {},
): PlanningRecommendation[] {
  const signals = options.signals ?? computeAvailableSignals(plan, courses, options);
  const recommendations: PlanningRecommendation[] = [];

  for (const signal of signals) {
    if (signal.kind === 'semester_load') {
      recommendations.push(...recommendFromSemesterLoad(signal, plan, courses, options.requirements));
    } else if (signal.kind === 'prereq_bottleneck') {
      const rec = recommendFromPrereqBottleneck(signal, plan);
      if (rec) recommendations.push(rec);
    } else if (signal.kind === 'delayed_critical_course') {
      const rec = recommendFromDelayedCritical(signal, plan);
      if (rec) recommendations.push(rec);
    } else if (signal.kind === 'graduation_risk') {
      const rec = recommendFromGraduationRisk(signal, plan, options);
      if (rec) recommendations.push(rec);
    }
  }

  const comparisonRec = recommendFromPlanComparison(options.planComparison);
  if (comparisonRec) recommendations.push(comparisonRec);

  return recommendations
    .filter(isValidRecommendation)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function computeAvailableSignals(
  plan: PlanVariant,
  courses: Course[],
  options: RecommendationOptions,
): OptimizationSignal[] {
  return [
    ...analyzeSemesterLoad(plan, courses),
    ...analyzeGraduationRisk(plan, courses, {
      requiredCredits: options.requiredCredits,
      requirements: options.requirements,
    }),
  ];
}

function recommendFromSemesterLoad(
  signal: OptimizationSignal,
  plan: PlanVariant,
  courses: Course[],
  requirements?: RequirementGroup[],
): PlanningRecommendation[] {
  const semantics = semesterLoadSemantics(signal);
  if (!semantics) return [];

  if (semantics === 'underload') {
    const uncovered = findUncoveredRequirementCourses(courses, requirements ?? []);
    if (uncovered.length === 0) return [];
    const targetTerm = signal.scope.type === 'semester' ? signal.scope.term : asString(signal.evidence.targetTerm);
    const currentCredits = asNumber(signal.evidence.credits);
    const threshold = asNumber(signal.evidence.threshold);
    if (!targetTerm || currentCredits === undefined || threshold === undefined) return [];
    const candidateCourseId = uncovered[0];
    return [baseRecommendation({
      planId: plan.id,
      type: 'fill_underloaded_term',
      sourceSignalIds: [signal.id],
      scope: { type: 'semester', planId: plan.id, term: targetTerm },
      priority: signal.severity === 'risk' ? 'high' : 'medium',
      confidence: 'medium',
      title: `Candidate action: use capacity in ${targetTerm}`,
      message: `Candidate action: evaluate adding ${candidateCourseId} to ${targetTerm}. Evidence shows semester_load signal ${signal.id} has ${currentCredits} credits below threshold ${threshold}.`,
      action: { kind: 'add_course', courseId: candidateCourseId, toTerm: targetTerm },
      facts: { targetTerm, currentCredits, threshold, candidateCourseIds: uncovered },
      sourceDataKinds: ['optimization_signal', 'course', 'plan', 'audit'],
      invalidatedBy: [
        'The underload signal disappears.',
        'The candidate course is no longer uncovered in canonical requirement data.',
        'Candidate placement creates accepted prereq, requirement, or load risk evidence.',
      ],
    })];
  }

  const affectedTerm = signal.scope.type === 'semester' ? signal.scope.term : asString(signal.evidence.affectedTerm);
  const currentCredits = asNumber(signal.evidence.credits);
  const threshold = asNumber(signal.evidence.threshold);
  if (!affectedTerm || currentCredits === undefined || threshold === undefined) return [];

  return [baseRecommendation({
    planId: plan.id,
    type: 'reduce_semester_load',
    sourceSignalIds: [signal.id],
    scope: { type: 'semester', planId: plan.id, term: affectedTerm },
    priority: signal.severity === 'risk' ? 'high' : 'medium',
    confidence: 'low',
    title: `Candidate action: inspect load in ${affectedTerm}`,
    message: `Candidate action: review courses in ${affectedTerm} for a supported move. Evidence shows semester_load signal ${signal.id} has ${currentCredits} credits above threshold ${threshold}.`,
    action: { kind: 'no_action_generated' },
    facts: { affectedTerm, currentCredits, threshold },
    sourceDataKinds: ['optimization_signal', 'plan'],
    invalidatedBy: [
      'The overload or extreme-overload signal disappears.',
      'Course credits change.',
      'A candidate move creates accepted prereq, requirement, or graduation-risk evidence.',
    ],
  })];
}

function recommendFromPrereqBottleneck(signal: OptimizationSignal, plan: PlanVariant): PlanningRecommendation | null {
  const courseId = signal.scope.type === 'course' ? signal.scope.courseId : asString(signal.evidence.courseId);
  const downstreamRequiredDependents = signal.evidence.downstreamRequiredDependents ?? signal.evidence.downstreamCount ?? signal.evidence.directDependents;
  const missing = signal.evidence.missing === true;
  const placement = isRecord(signal.evidence.placement) ? signal.evidence.placement : undefined;
  if (!courseId || downstreamRequiredDependents === undefined || (!missing && !placement)) return null;

  return baseRecommendation({
    planId: plan.id,
    type: 'sequence_prereq_bottleneck',
    sourceSignalIds: [signal.id],
    scope: { type: 'course', planId: plan.id, courseId },
    priority: signal.severity === 'risk' ? 'high' : 'medium',
    confidence: 'low',
    title: `Candidate action: inspect prerequisite sequence for ${courseId}`,
    message: `Candidate action: review ${courseId} placement before affected downstream courses. Evidence shows prereq_bottleneck signal ${signal.id} for ${courseId}.`,
    action: { kind: 'review_requirement', courseId },
    facts: {
      courseId,
      downstreamRequiredDependents,
      directDependents: signal.evidence.directDependents,
      transitiveDependents: signal.evidence.transitiveDependents,
      missing,
      placement,
    },
    sourceDataKinds: ['optimization_signal', 'course', 'plan'],
    invalidatedBy: [
      'The bottleneck signal disappears.',
      'The course no longer supports the required downstream set.',
      'OR-prerequisite branch evidence changes.',
      'The course is already completed or placed early enough.',
    ],
  });
}

function recommendFromDelayedCritical(signal: OptimizationSignal, plan: PlanVariant): PlanningRecommendation | null {
  const courseId = signal.scope.type === 'course' ? signal.scope.courseId : asString(signal.evidence.courseId);
  const earliestPossibleTerm = asString(signal.evidence.earliestPossibleTerm);
  const actualTerm = asString(signal.evidence.actualTerm);
  const semestersDelayed = asNumber(signal.evidence.semestersDelayed);
  const downstreamRequiredDependents = signal.evidence.downstreamRequiredDependents;
  if (!courseId || !earliestPossibleTerm || !actualTerm || semestersDelayed === undefined || downstreamRequiredDependents === undefined) return null;

  return baseRecommendation({
    planId: plan.id,
    type: 'accelerate_delayed_critical',
    sourceSignalIds: [signal.id],
    scope: { type: 'course', planId: plan.id, courseId },
    priority: signal.severity === 'risk' ? 'high' : 'medium',
    confidence: 'high',
    title: `Candidate action: inspect earlier placement for ${courseId}`,
    message: `Candidate action: evaluate moving ${courseId} closer to ${earliestPossibleTerm}. Evidence shows delayed_critical_course signal ${signal.id} reports ${semestersDelayed} delayed semester(s).`,
    action: { kind: 'move_course', courseId, fromTerm: actualTerm, toTerm: earliestPossibleTerm },
    facts: { courseId, earliestPossibleTerm, actualTerm, semestersDelayed, downstreamRequiredDependents },
    sourceDataKinds: ['optimization_signal', 'course', 'plan'],
    invalidatedBy: [
      'The delayed-critical signal disappears.',
      'Earliest possible term or actual placement changes.',
      'Required downstream dependent evidence changes.',
      'The candidate move creates another accepted risk signal.',
    ],
  });
}

function recommendFromGraduationRisk(
  signal: OptimizationSignal,
  plan: PlanVariant,
  options: RecommendationOptions,
): PlanningRecommendation | null {
  const riskType = asString(signal.evidence.riskType);
  if (riskType === 'requirement_undercovered') return requirementGapRecommendation(signal, plan, options.requirements ?? []);
  if (riskType === 'credit_shortfall') return creditShortfallRecommendation(signal, plan, options.requiredCredits);
  if (riskType === 'upper_division_shortfall') return upperDivisionShortfallRecommendation(signal, plan, options.requirements ?? []);
  return null;
}

function requirementGapRecommendation(
  signal: OptimizationSignal,
  plan: PlanVariant,
  requirements: RequirementGroup[],
): PlanningRecommendation | null {
  const requirementId = asString(signal.evidence.requirementId);
  const requiredCount = asNumber(signal.evidence.requiredCount);
  const coveredCount = asNumber(signal.evidence.coveredCount);
  const missingCount = asNumber(signal.evidence.missingCount);
  if (!requirementId || requiredCount === undefined || coveredCount === undefined || missingCount === undefined) return null;
  const requirement = requirements.find((group) => group.id === requirementId);
  if (!requirement) return null;
  const candidateCourseIds = requirement.coursePool.filter((courseId) => courseId);

  return baseRecommendation({
    planId: plan.id,
    type: 'cover_requirement_gap',
    sourceSignalIds: [signal.id],
    scope: { type: 'requirement', planId: plan.id, requirementId },
    priority: 'blocking',
    confidence: candidateCourseIds.length > 0 ? 'medium' : 'low',
    title: `Candidate action: inspect requirement gap for ${requirementId}`,
    message: `Candidate action: review canonical course pool for ${requirementId}. Evidence shows graduation_risk signal ${signal.id} has ${coveredCount} covered against ${requiredCount}.`,
    action: { kind: candidateCourseIds.length > 0 ? 'review_requirement' : 'no_action_generated', requirementId },
    facts: { requirementId, requiredCount, coveredCount, missingCount, candidateCourseIds },
    sourceDataKinds: ['optimization_signal', 'audit', 'course'],
    invalidatedBy: [
      'The requirement group no longer exists in canonical data.',
      'Requirement coverage reaches the required count.',
      'Candidate course membership changes in the canonical requirement pool.',
    ],
  });
}

function creditShortfallRecommendation(
  signal: OptimizationSignal,
  plan: PlanVariant,
  requiredCredits?: RequiredCreditsInput,
): PlanningRecommendation | null {
  if (!requiredCredits) return null;
  const requiredCreditsValue = asNumber(signal.evidence.requiredCredits);
  const plannedDegreeApplicableCredits = asNumber(signal.evidence.plannedDegreeApplicableCredits);
  const creditsShort = asNumber(signal.evidence.creditsShort);
  const source = asString(signal.evidence.source);
  if (requiredCreditsValue === undefined || plannedDegreeApplicableCredits === undefined || creditsShort === undefined || !source) return null;
  if (requiredCredits.value !== requiredCreditsValue || requiredCredits.source !== source) return null;

  return baseRecommendation({
    planId: plan.id,
    type: 'address_credit_shortfall',
    sourceSignalIds: [signal.id],
    scope: { type: 'plan', planId: plan.id },
    priority: signal.severity === 'risk' ? 'blocking' : 'high',
    confidence: 'low',
    title: 'Candidate action: inspect degree-applicable credit shortfall',
    message: `Candidate action: review degree-applicable credit options from ${source} source. Evidence shows graduation_risk signal ${signal.id} reports ${creditsShort} credits short.`,
    action: { kind: 'review_requirement' },
    facts: { requiredCredits: requiredCreditsValue, plannedDegreeApplicableCredits, creditsShort, source },
    sourceDataKinds: sourceDataKindsForSource(source),
    invalidatedBy: [
      'The required-credit source disappears or changes.',
      'Planned degree-applicable credits meet the required credit value.',
      'Candidate course degree-applicability evidence changes.',
    ],
  });
}

function upperDivisionShortfallRecommendation(
  signal: OptimizationSignal,
  plan: PlanVariant,
  requirements: RequirementGroup[],
): PlanningRecommendation | null {
  const requirementId = asString(signal.evidence.requirementId);
  const requiredHours = asNumber(signal.evidence.requiredHours);
  const plannedHours = asNumber(signal.evidence.plannedHours);
  const hoursShort = asNumber(signal.evidence.hoursShort);
  const source = asString(signal.evidence.source);
  if (!requirementId || requiredHours === undefined || plannedHours === undefined || hoursShort === undefined || !source) return null;
  const requirement = requirements.find((group) => group.id === requirementId && group.type === 'minimum_hours' && isUpperDivisionRequirement(group));
  if (!requirement) return null;

  return baseRecommendation({
    planId: plan.id,
    type: 'address_upper_division_shortfall',
    sourceSignalIds: [signal.id],
    scope: { type: 'requirement', planId: plan.id, requirementId },
    priority: signal.severity === 'risk' ? 'blocking' : 'high',
    confidence: 'low',
    title: `Candidate action: inspect upper-division hours for ${requirementId}`,
    message: `Candidate action: review canonical upper-division requirement pool for ${requirementId}. Evidence shows graduation_risk signal ${signal.id} reports ${hoursShort} hours short from ${source} source.`,
    action: { kind: 'review_requirement', requirementId },
    facts: { requirementId, requiredHours, plannedHours, hoursShort, source },
    sourceDataKinds: ['optimization_signal', 'audit', 'course'],
    invalidatedBy: [
      'The canonical upper-division minimum-hours requirement is absent.',
      'Planned hours meet the required hours.',
      'Canonical requirement source or course pool changes.',
    ],
  });
}

function recommendFromPlanComparison(planComparison?: PlanComparisonResult): PlanningRecommendation | null {
  if (!planComparison?.success || !planComparison.comparison) return null;
  const comparison = planComparison.comparison;
  const facts = comparisonFacts(planComparison);
  if (facts.length === 0) return null;
  const planAId = comparison.planA.id;
  const planBId = comparison.planB.id;
  const factSummary = facts.slice(0, 3).join(', ');

  return baseRecommendation({
    type: 'compare_plan_tradeoff',
    sourceSignalIds: [],
    sourceComparisonFacts: facts,
    scope: { type: 'comparison', planAId, planBId },
    priority: 'low',
    confidence: 'high',
    title: `Plan comparison facts: ${planAId} and ${planBId}`,
    message: `Compared with ${planAId}, ${planBId} has changed planning facts: ${factSummary}.`,
    action: { kind: 'compare_plans' },
    facts: {
      sourceComparisonId: comparisonKey(planComparison),
      planAId,
      planBId,
      movedCourseCount: comparison.summary.movedCourseCount,
      creditDelta: comparison.summary.totalCreditsB - comparison.summary.totalCreditsA,
      requirementsImprovedInB: comparison.summary.requirementsImprovedInB,
      requirementsRegressedInB: comparison.summary.requirementsRegressedInB,
      prereqRisksAddedInB: comparison.summary.prereqRisksAddedInB,
      prereqRisksRemovedInB: comparison.summary.prereqRisksRemovedInB,
    },
    sourceDataKinds: ['comparison', 'plan'],
    invalidatedBy: [
      'Either compared plan changes.',
      'Comparison validation fails.',
      'Comparison fact values change.',
    ],
  });
}

function baseRecommendation(input: {
  planId?: string;
  type: RecommendationType;
  sourceSignalIds: string[];
  sourceComparisonFacts?: string[];
  scope: PlanningRecommendation['scope'];
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  title: string;
  message: string;
  action?: PlanningRecommendation['action'];
  facts: Record<string, unknown>;
  sourceDataKinds: PlanningRecommendation['evidence']['sourceDataKinds'];
  invalidatedBy: string[];
}): PlanningRecommendation {
  const sourceComparisonFacts = input.sourceComparisonFacts ?? [];
  return {
    id: deterministicId(input.type, input.sourceSignalIds, sourceComparisonFacts, input.scope),
    type: input.type,
    priority: input.priority,
    confidence: input.confidence,
    scope: input.scope,
    title: input.title,
    message: input.message,
    action: input.action,
    evidence: {
      sourceSignalIds: input.sourceSignalIds,
      sourceComparisonFacts,
      sourceDataKinds: input.sourceDataKinds,
      facts: input.facts,
    },
    invalidatedBy: input.invalidatedBy,
  };
}

function isValidRecommendation(rec: PlanningRecommendation): boolean {
  if (!RECOMMENDATION_TYPES.has(rec.type)) return false;
  if (!rec.id) return false;
  if (rec.type === 'compare_plan_tradeoff') {
    if (rec.evidence.sourceComparisonFacts.length === 0) return false;
    if (rec.evidence.sourceComparisonFacts.some((fact) => !fact)) return false;
  } else if (rec.evidence.sourceSignalIds.length === 0 || rec.evidence.sourceSignalIds.some((id) => !id)) {
    return false;
  }
  if (rec.confidence === 'low' && rec.action && !['review_requirement', 'no_action_generated'].includes(rec.action.kind)) return false;
  const text = `${rec.title} ${rec.message}`.toLowerCase();
  return !FORBIDDEN_LANGUAGE.some((phrase) => text.includes(phrase));
}

function semesterLoadSemantics(signal: OptimizationSignal): 'underload' | 'overload' | null {
  if (signal.kind !== 'semester_load') return null;
  if (signal.id.includes(':underload')) return 'underload';
  if (signal.id.includes(':overload') || signal.id.includes(':extreme_overload')) return 'overload';
  const credits = asNumber(signal.evidence.credits);
  const threshold = asNumber(signal.evidence.threshold);
  if (credits === undefined || threshold === undefined) return null;
  if (credits < threshold) return 'underload';
  if (credits > threshold) return 'overload';
  return null;
}

function findUncoveredRequirementCourses(courses: Course[], requirements: RequirementGroup[]): string[] {
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const uncovered: string[] = [];
  for (const requirement of requirements) {
    const progress = calcProgress(requirement, courses, { includePlanned: true });
    if (progress.completed + progress.inProgress + progress.planned >= progress.total) continue;
    const pool = ((requirement.type === 'pick_n' || requirement.type === 'pick_one') && requirement.selectedCourses?.length)
      ? requirement.selectedCourses
      : requirement.coursePool;
    for (const courseId of pool) {
      const course = courseMap.get(courseId);
      if (!course) continue;
      if (['completed', 'in_progress', 'registered', 'planned'].includes(course.status)) continue;
      uncovered.push(courseId);
    }
  }
  return [...new Set(uncovered)].sort();
}

function comparisonFacts(result: PlanComparisonResult): string[] {
  const comparison = result.comparison;
  if (!result.success || !comparison) return [];
  const facts: string[] = [];
  if (comparison.courseDiffs.moved.length > 0) facts.push('courseDiffs.moved');
  if (comparison.courseDiffs.onlyInA.length > 0) facts.push('courseDiffs.onlyInA');
  if (comparison.courseDiffs.onlyInB.length > 0) facts.push('courseDiffs.onlyInB');
  for (const diff of comparison.semesterDiffs) {
    if (diff.creditDelta !== 0) facts.push(`semesterDiffs.${diff.semesterId}.creditDelta`);
  }
  for (const diff of comparison.requirementDiffs) {
    if (diff.coverageDelta !== 0) facts.push(`requirementDiffs.${diff.groupId}.coverageDelta`);
  }
  for (const diff of comparison.prereqRiskDiffs) {
    if (diff.changed) facts.push(`prereqRiskDiffs.${diff.courseId}.changed`);
  }
  if (comparison.summary.movedCourseCount > 0) facts.push('summary.movedCourseCount');
  if (comparison.summary.prereqRisksAddedInB > 0) facts.push('summary.prereqRisksAddedInB');
  if (comparison.summary.prereqRisksRemovedInB > 0) facts.push('summary.prereqRisksRemovedInB');
  return [...new Set(facts)].sort();
}

function comparisonKey(result: PlanComparisonResult): string {
  const comparison = result.comparison;
  if (!comparison) return 'comparison:invalid';
  return `comparison:${comparison.planA.id}:${comparison.planB.id}:${comparisonFacts(result).join('|')}`;
}

function deterministicId(
  type: RecommendationType,
  sourceSignalIds: string[],
  sourceComparisonFacts: string[],
  scope: PlanningRecommendation['scope'],
): string {
  const sourceKey = sourceSignalIds.length > 0 ? sourceSignalIds.join('+') : sourceComparisonFacts.join('+');
  return [type, sourceKey, scopeKey(scope)].map(slug).join(':');
}

function scopeKey(scope: PlanningRecommendation['scope']): string {
  if (scope.type === 'semester') return `semester:${scope.planId ?? ''}:${scope.term}`;
  if (scope.type === 'course') return `course:${scope.planId ?? ''}:${scope.courseId}`;
  if (scope.type === 'requirement') return `requirement:${scope.planId ?? ''}:${scope.requirementId}`;
  if (scope.type === 'comparison') return `comparison:${scope.planAId}:${scope.planBId}`;
  return `plan:${scope.planId ?? ''}`;
}

function sourceDataKindsForSource(source: string): PlanningRecommendation['evidence']['sourceDataKinds'] {
  if (source === 'program') return ['optimization_signal', 'program', 'plan'];
  if (source === 'config') return ['optimization_signal', 'config', 'plan'];
  return ['optimization_signal', 'audit', 'plan'];
}

function isUpperDivisionRequirement(requirement: RequirementGroup): boolean {
  const text = [requirement.id, requirement.name, requirement.category, requirement.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return text.includes('upper-division') || text.includes('upper division');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'none';
}
