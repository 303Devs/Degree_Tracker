import { describe, expect, it } from 'vitest';
import { generateRecommendations, type PlanningRecommendation } from '../lib/recommendations';
import type { OptimizationSignal, PlanComparisonResult, PlanVariant } from '../lib/plan-types';
import type { Course, RequirementGroup } from '../lib/types';

const plan: PlanVariant = {
  id: 'synthetic',
  name: 'Synthetic Plan',
  description: 'Fixture plan',
  semesters: {
    FA26: ['CSCI-1000', 'CSCI-2000', 'CSCI-2100', 'CSCI-2200', 'CSCI-2300', 'CSCI-2400', 'CSCI-2500'],
    SP27: ['CSCI-3000'],
    FA27: ['CSCI-3308'],
  },
};

const courses: Course[] = [
  course('CSCI-1000', 3, 'planned'),
  course('CSCI-2000', 3, 'planned', { prereqs: { type: 'course', courseId: 'CSCI-1000' } }),
  course('CSCI-2100', 3, 'planned', { prereqs: { type: 'course', courseId: 'CSCI-2000' } }),
  course('CSCI-2200', 3, 'planned', { prereqs: { type: 'course', courseId: 'CSCI-2000' } }),
  course('CSCI-2300', 3, 'planned', { prereqs: { type: 'course', courseId: 'CSCI-2000' } }),
  course('CSCI-2400', 3, 'planned'),
  course('CSCI-2500', 3, 'planned'),
  course('CSCI-3000', 3, 'planned'),
  course('CSCI-3308', 3, 'planned'),
  course('MATH-3000', 3, 'not_started'),
  course('STAT-3400', 3, 'not_started'),
  course('UD-4100', 3, 'not_started'),
];

const requirements: RequirementGroup[] = [
  {
    id: 'math-gap',
    name: 'Mathematics Elective',
    category: 'audit',
    type: 'pick_n',
    required: 1,
    coursePool: ['MATH-3000', 'STAT-3400'],
  },
  {
    id: 'upper-hours',
    name: 'Upper-Division Hours',
    category: 'audit',
    type: 'minimum_hours',
    requiredHours: 6,
    coursePool: ['UD-4100'],
    notes: 'upper-division minimum_hours group',
  },
];

const requiredCredits = { value: 40, source: 'audit' as const };

const allSignals: OptimizationSignal[] = [
  semesterSignal('semester_load:FA26:overload', 'FA26', 'warning', { credits: 21, courseCount: 7, threshold: 18 }),
  semesterSignal('semester_load:SP27:underload', 'SP27', 'warning', { credits: 3, courseCount: 1, threshold: 12 }),
  {
    id: 'prereq_bottleneck:CSCI-2000:missing',
    kind: 'prereq_bottleneck',
    severity: 'warning',
    scope: { type: 'course', courseId: 'CSCI-2000' },
    message: 'factual bottleneck',
    evidence: {
      threshold: 3,
      downstreamCount: 3,
      directDependents: ['CSCI-2100', 'CSCI-2200', 'CSCI-2300'],
      transitiveDependents: [],
      requiredOnly: true,
      missing: true,
    },
  },
  {
    id: 'delayed_critical_course:CSCI-3308',
    kind: 'delayed_critical_course',
    severity: 'risk',
    scope: { type: 'course', courseId: 'CSCI-3308' },
    message: 'factual delayed critical',
    evidence: {
      earliestPossibleTerm: 'SP27',
      actualTerm: 'FA27',
      semestersDelayed: 2,
      downstreamRequiredDependents: ['CSCI-4308'],
      requiredOnly: true,
    },
  },
  graduationSignal('graduation_risk:requirement_undercovered:math-gap', 'risk', {
    riskType: 'requirement_undercovered',
    requirementId: 'math-gap',
    requiredCount: 1,
    coveredCount: 0,
    missingCount: 1,
  }),
  graduationSignal('graduation_risk:credit_shortfall', 'risk', {
    riskType: 'credit_shortfall',
    requiredCredits: 40,
    plannedDegreeApplicableCredits: 27,
    creditsShort: 13,
    source: 'audit',
  }),
  graduationSignal('graduation_risk:upper_division_shortfall:upper-hours', 'warning', {
    riskType: 'upper_division_shortfall',
    requirementId: 'upper-hours',
    requiredHours: 6,
    plannedHours: 0,
    hoursShort: 6,
    source: 'audit',
  }),
];

const comparison: PlanComparisonResult = {
  success: true,
  issues: [],
  comparison: {
    planA: { id: 'plan-a', name: 'A', description: '', semesterCount: 2, totalCourses: 2, totalCredits: 6, maxSemesterCredits: 3 },
    planB: { id: 'plan-b', name: 'B', description: '', semesterCount: 2, totalCourses: 2, totalCredits: 6, maxSemesterCredits: 6 },
    courseDiffs: { onlyInA: [], onlyInB: [], moved: [{ courseId: 'CSCI-3308', fromSemester: 'FA27', toSemester: 'SP27' }], unchanged: ['CSCI-1000'] },
    semesterDiffs: [{ semesterId: 'SP27', creditsA: 3, creditsB: 6, creditDelta: 3, coursesOnlyInA: [], coursesOnlyInB: ['CSCI-3308'] }],
    requirementDiffs: [{ groupId: 'math-gap', groupName: 'Mathematics Elective', completedA: 0, completedB: 0, total: 1, delta: 0, coveredA: 0, coveredB: 1, coverageDelta: 1 }],
    prereqRiskDiffs: [{ courseId: 'CSCI-3308', semesterA: 'FA27', semesterB: 'SP27', riskInA: 'warning', riskInB: 'ok', changed: true, reason: 'fixture' }],
    summary: {
      movedCourseCount: 1,
      coursesOnlyInACount: 0,
      coursesOnlyInBCount: 0,
      semestersWithChanges: 1,
      requirementsImprovedInB: 1,
      requirementsRegressedInB: 0,
      coverageImprovedInB: 1,
      coverageRegressedInB: 0,
      prereqRisksAddedInB: 0,
      prereqRisksRemovedInB: 1,
      totalCreditsA: 6,
      totalCreditsB: 6,
      maxSemesterCreditsA: 3,
      maxSemesterCreditsB: 6,
    },
  },
};

function course(id: string, credits: number, status: Course['status'], extra: Partial<Course> = {}): Course {
  return {
    id,
    number: id.replace('-', ' '),
    name: id,
    credits,
    prereqs: null,
    coreqs: null,
    status,
    ...extra,
  };
}

function semesterSignal(id: string, term: string, severity: OptimizationSignal['severity'], evidence: Record<string, unknown>): OptimizationSignal {
  return { id, kind: 'semester_load', severity, scope: { type: 'semester', term }, message: 'factual load', evidence };
}

function graduationSignal(id: string, severity: OptimizationSignal['severity'], evidence: Record<string, unknown>): OptimizationSignal {
  return { id, kind: 'graduation_risk', severity, scope: { type: 'plan' }, message: 'factual graduation risk', evidence };
}

function recs(signals: OptimizationSignal[] = allSignals, opts: Partial<Parameters<typeof generateRecommendations>[2]> = {}): PlanningRecommendation[] {
  return generateRecommendations(plan, courses, { signals, requirements, requiredCredits, ...opts });
}

function byType(type: PlanningRecommendation['type'], recommendations = recs()): PlanningRecommendation | undefined {
  return recommendations.find((rec) => rec.type === type);
}

describe('recommendation schema validation', () => {
  it('does not return non-comparison recommendations without source signal ids', () => {
    const recommendations = recs([semesterSignal('', 'FA26', 'warning', { credits: 21, threshold: 18 })]);
    expect(recommendations).toHaveLength(0);
  });

  it('does not return compare_plan_tradeoff without source comparison facts', () => {
    const emptyComparison: PlanComparisonResult = {
      success: true,
      issues: [],
      comparison: { ...comparison.comparison!, courseDiffs: { onlyInA: [], onlyInB: [], moved: [], unchanged: [] }, semesterDiffs: [], requirementDiffs: [], prereqRiskDiffs: [], summary: { ...comparison.comparison!.summary, movedCourseCount: 0, prereqRisksRemovedInB: 0 } },
    };
    expect(recs([], { planComparison: emptyComparison })).toHaveLength(0);
  });

  it('generates deterministic recommendation ids for identical input', () => {
    expect(recs().map((rec) => rec.id)).toEqual(recs().map((rec) => rec.id));
  });

  it('does not output unsupported recommendation types', () => {
    const allowed = new Set(['reduce_semester_load', 'fill_underloaded_term', 'sequence_prereq_bottleneck', 'accelerate_delayed_critical', 'cover_requirement_gap', 'address_credit_shortfall', 'address_upper_division_shortfall', 'compare_plan_tradeoff']);
    expect(recs(allSignals, { planComparison: comparison }).every((rec) => allowed.has(rec.type))).toBe(true);
  });
});

describe('recommendation evidence mapping', () => {
  it.each([
    ['reduce_semester_load', allSignals[0], ['affectedTerm', 'currentCredits', 'threshold']],
    ['fill_underloaded_term', allSignals[1], ['targetTerm', 'currentCredits', 'threshold']],
    ['sequence_prereq_bottleneck', allSignals[2], ['courseId', 'downstreamRequiredDependents']],
    ['accelerate_delayed_critical', allSignals[3], ['courseId', 'earliestPossibleTerm', 'actualTerm', 'semestersDelayed', 'downstreamRequiredDependents']],
    ['cover_requirement_gap', allSignals[4], ['requirementId', 'requiredCount', 'coveredCount', 'missingCount']],
    ['address_credit_shortfall', allSignals[5], ['requiredCredits', 'plannedDegreeApplicableCredits', 'creditsShort', 'source']],
    ['address_upper_division_shortfall', allSignals[6], ['requirementId', 'requiredHours', 'plannedHours', 'hoursShort', 'source']],
  ] as const)('maps %s from required signal evidence', (type, signal, factKeys) => {
    const rec = byType(type, recs([signal]));
    expect(rec?.type).toBe(type);
    expect(rec?.evidence.sourceSignalIds).toEqual([signal.id]);
    for (const key of factKeys) expect(rec?.evidence.facts).toHaveProperty(key);
  });

  it('maps compare_plan_tradeoff from comparison facts', () => {
    const rec = byType('compare_plan_tradeoff', recs([], { planComparison: comparison }));
    expect(rec?.evidence.sourceSignalIds).toEqual([]);
    expect(rec?.evidence.sourceComparisonFacts.length).toBeGreaterThan(0);
    expect(rec?.evidence.facts).toMatchObject({ planAId: 'plan-a', planBId: 'plan-b' });
  });

  it.each([
    ['reduce_semester_load', semesterSignal('semester_load:FA26:overload', 'FA26', 'warning', { credits: 21 })],
    ['fill_underloaded_term', semesterSignal('semester_load:SP27:underload', 'SP27', 'warning', { credits: 3 })],
    ['sequence_prereq_bottleneck', { ...allSignals[2], evidence: { downstreamCount: 3 } }],
    ['accelerate_delayed_critical', { ...allSignals[3], evidence: { actualTerm: 'FA27', semestersDelayed: 2 } }],
    ['cover_requirement_gap', graduationSignal('graduation_risk:requirement_undercovered:math-gap', 'risk', { riskType: 'requirement_undercovered', requirementId: 'math-gap' })],
    ['address_credit_shortfall', graduationSignal('graduation_risk:credit_shortfall', 'risk', { riskType: 'credit_shortfall', requiredCredits: 40 })],
    ['address_upper_division_shortfall', graduationSignal('graduation_risk:upper_division_shortfall:upper-hours', 'warning', { riskType: 'upper_division_shortfall', requirementId: 'upper-hours' })],
  ] as const)('does not emit %s when required evidence is absent', (type, signal) => {
    expect(byType(type, recs([signal as OptimizationSignal]))).toBeUndefined();
  });
});

describe('recommendation invalidation behavior', () => {
  it('removes the matching recommendation when its signal is removed', () => {
    expect(byType('accelerate_delayed_critical', recs(allSignals))).toBeDefined();
    expect(byType('accelerate_delayed_critical', recs(allSignals.filter((signal) => signal.kind !== 'delayed_critical_course')))).toBeUndefined();
  });

  it('removes cover_requirement_gap when its requirement group is removed', () => {
    expect(byType('cover_requirement_gap', recs([allSignals[4]], { requirements: [] }))).toBeUndefined();
  });

  it('removes address_credit_shortfall when requiredCredits source is absent', () => {
    expect(byType('address_credit_shortfall', recs([allSignals[5]], { requiredCredits: undefined }))).toBeUndefined();
  });

  it('does not emit compare_plan_tradeoff without planComparison', () => {
    expect(byType('compare_plan_tradeoff', recs([], { planComparison: undefined }))).toBeUndefined();
  });
});

describe('recommendation forbidden language guard', () => {
  it.each(['reduce_semester_load', 'fill_underloaded_term', 'sequence_prereq_bottleneck', 'accelerate_delayed_critical', 'cover_requirement_gap', 'address_credit_shortfall', 'address_upper_division_shortfall', 'compare_plan_tradeoff'] as const)('keeps %s wording candidate-oriented', (type) => {
    const rec = byType(type, recs(allSignals, { planComparison: comparison }));
    expect(rec).toBeDefined();
    const text = `${rec!.title} ${rec!.message}`.toLowerCase();
    for (const forbidden of ['optimal', 'best', 'perfect', 'ideal', 'guaranteed', 'advisor-approved', 'recommended by ai', 'smart path']) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/\bshould\b|\bmust\b/);
  });
});

describe('recommendation priority and confidence', () => {
  it('maps risk-backed recommendations to high or blocking priority', () => {
    const rank = { low: 0, medium: 1, high: 2, blocking: 3 };
    const riskRecs = recs(allSignals.filter((signal) => signal.severity === 'risk'));
    expect(riskRecs.length).toBeGreaterThan(0);
    expect(riskRecs.every((rec) => rank[rec.priority] >= rank.high)).toBe(true);
  });

  it('uses review/no-action actions for low-confidence recommendations', () => {
    const low = recs().filter((rec) => rec.confidence === 'low');
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((rec) => rec.action && ['review_requirement', 'no_action_generated'].includes(rec.action.kind))).toBe(true);
  });

  it('does not set high confidence when required candidate fields are missing', () => {
    const incomplete = recs([{ ...allSignals[3], evidence: { ...allSignals[3].evidence, earliestPossibleTerm: undefined } }]);
    expect(incomplete).toHaveLength(0);
  });
});

describe('recommendation golden fixture', () => {
  it('produces stable cited recommendations for a synthetic high-signal plan', () => {
    const recommendations = recs(allSignals, { planComparison: comparison });
    expect(recommendations.length).toBeGreaterThanOrEqual(5);
    expect(recommendations.every((rec) => rec.evidence.sourceSignalIds.length > 0 || rec.evidence.sourceComparisonFacts.length > 0)).toBe(true);
    expect(recommendations.map((rec) => rec.id)).toMatchInlineSnapshot(`
      [
        "accelerate-delayed-critical:delayed-critical-course-csci-3308:course-synthetic-csci-3308",
        "address-credit-shortfall:graduation-risk-credit-shortfall:plan-synthetic",
        "address-upper-division-shortfall:graduation-risk-upper-division-shortfall-upper-hours:requirement-synthetic-upper-hours",
        "compare-plan-tradeoff:coursediffs-moved-prereqriskdiffs-csci-3308-changed-requirementdiffs-math-gap-coveragedelta-semesterdiffs-sp27-creditdelta-summary-movedcoursecount-summary-prereqrisksremovedinb:comparison-plan-a-plan-b",
        "cover-requirement-gap:graduation-risk-requirement-undercovered-math-gap:requirement-synthetic-math-gap",
        "fill-underloaded-term:semester-load-sp27-underload:semester-synthetic-sp27",
        "reduce-semester-load:semester-load-fa26-overload:semester-synthetic-fa26",
        "sequence-prereq-bottleneck:prereq-bottleneck-csci-2000-missing:course-synthetic-csci-2000",
      ]
    `);
  });
});

describe('recommendation hidden policy regression guards', () => {
  it('does not hardcode 120 credits or emit credit shortfall without requiredCredits', () => {
    const inline = generateRecommendations(plan, courses, { requirements });
    expect(byType('address_credit_shortfall', inline)).toBeUndefined();
  });

  it('does not emit upper-division shortfall without canonical minimum_hours group', () => {
    const nonCanonical: RequirementGroup[] = [{ ...requirements[1], id: 'generic-hours', name: 'Hours', notes: undefined }];
    expect(byType('address_upper_division_shortfall', recs([allSignals[6]], { requirements: nonCanonical }))).toBeUndefined();
  });

  it('does not parse course numbers as an upper-division policy source', () => {
    const numberedOnly: RequirementGroup[] = [{ ...requirements[0], coursePool: ['UD-4100'] }];
    expect(byType('address_upper_division_shortfall', recs([allSignals[6]], { requirements: numberedOnly }))).toBeUndefined();
  });
});
