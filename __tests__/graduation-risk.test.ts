/**
 * Graduation Risk Signal Tests
 *
 * TDD-first tests for factual graduation-risk detection.
 */

import { describe, expect, it } from 'vitest';
import { analyzeGraduationRisk } from '../lib/graduation-risk';
import type { PlanVariant } from '../lib/plan-types';
import type { Course, RequirementGroup } from '../lib/types';

function makeCourse(
  id: string,
  credits: number,
  status: Course['status'] = 'planned',
  overrides: Partial<Course> = {},
): Course {
  return {
    id,
    number: id.replace('-', ' '),
    name: `${id} Course`,
    credits,
    prereqs: null,
    coreqs: null,
    status,
    ...overrides,
  };
}

function makePlan(courseIds: string[] = []): PlanVariant {
  return {
    id: 'test-plan',
    name: 'Test Plan',
    description: 'Test plan for graduation-risk analysis',
    semesters: { FA26: courseIds },
  };
}

function completeAllGroup(id: string, coursePool: string[]): RequirementGroup {
  return {
    id,
    name: id,
    category: 'test',
    type: 'complete_all',
    coursePool,
  };
}

describe('analyzeGraduationRisk', () => {
  it('flags a credit shortfall warning when 1-6 degree-applicable credits short with canonical required credits', () => {
    const courses = [makeCourse('A-1000', 3), makeCourse('A-1001', 3)];

    const signals = analyzeGraduationRisk(makePlan(['A-1000', 'A-1001']), courses, {
      requiredCredits: { value: 10, source: 'program' },
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'graduation_risk:credit_shortfall',
      kind: 'graduation_risk',
      severity: 'warning',
      scope: { type: 'plan' },
      message: 'Plan is 4 degree-applicable credits below the required graduation credit total.',
      evidence: {
        riskType: 'credit_shortfall',
        requiredCredits: 10,
        plannedDegreeApplicableCredits: 6,
        creditsShort: 4,
        source: 'program',
      },
    });
  });

  it('flags a credit shortfall risk when more than 6 degree-applicable credits short', () => {
    const courses = [makeCourse('A-1000', 3)];

    const signals = analyzeGraduationRisk(makePlan(['A-1000']), courses, {
      requiredCredits: { value: 12, source: 'audit' },
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'graduation_risk',
      severity: 'risk',
      evidence: {
        riskType: 'credit_shortfall',
        requiredCredits: 12,
        plannedDegreeApplicableCredits: 3,
        creditsShort: 9,
        source: 'audit',
      },
    });
  });

  it('emits no credit shortfall signal when no required credit source is provided', () => {
    const courses = [makeCourse('A-1000', 3)];

    const signals = analyzeGraduationRisk(makePlan(['A-1000']), courses);

    expect(signals).toHaveLength(0);
  });

  it('flags requirement undercoverage for a partially covered group', () => {
    const courses = [
      makeCourse('A-1000', 3, 'completed', { grade: 'A' }),
      makeCourse('A-1001', 3, 'planned'),
      makeCourse('A-1002', 3, 'not_started'),
      makeCourse('A-1003', 3, 'not_started'),
    ];
    const requirements = [completeAllGroup('core', ['A-1000', 'A-1001', 'A-1002', 'A-1003'])];

    const signals = analyzeGraduationRisk(makePlan(['A-1001']), courses, { requirements });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'graduation_risk:requirement_undercovered:core',
      kind: 'graduation_risk',
      severity: 'risk',
      scope: { type: 'plan' },
      message: 'Requirement group core has 2 of 4 required planned/completed courses covered.',
      evidence: {
        riskType: 'requirement_undercovered',
        requirementId: 'core',
        requiredCount: 4,
        coveredCount: 2,
        missingCount: 2,
      },
    });
  });

  it('emits no requirement undercoverage signal when a group is fully covered', () => {
    const courses = [
      makeCourse('A-1000', 3, 'completed', { grade: 'A' }),
      makeCourse('A-1001', 3, 'planned'),
    ];
    const requirements = [completeAllGroup('core', ['A-1000', 'A-1001'])];

    const signals = analyzeGraduationRisk(makePlan(['A-1001']), courses, { requirements });

    expect(signals).toHaveLength(0);
  });

  it('flags requirement undercoverage when zero courses are covered', () => {
    const courses = [makeCourse('A-1000', 3, 'not_started'), makeCourse('A-1001', 3, 'not_started')];
    const requirements = [completeAllGroup('core', ['A-1000', 'A-1001'])];

    const signals = analyzeGraduationRisk(makePlan(), courses, { requirements });

    expect(signals).toHaveLength(1);
    expect(signals[0].evidence).toMatchObject({
      riskType: 'requirement_undercovered',
      requirementId: 'core',
      requiredCount: 2,
      coveredCount: 0,
      missingCount: 2,
    });
  });

  it('excludes W, NR, and IP courses from degree-applicable credit count', () => {
    const courses = [
      makeCourse('A-1000', 3, 'completed', { grade: 'W' }),
      makeCourse('A-1001', 3, 'completed', { grade: 'NR' }),
      makeCourse('A-1002', 3, 'completed', { grade: 'IP' }),
      makeCourse('A-1003', 3, 'completed', { grade: 'A' }),
      makeCourse('A-1004', 3, 'planned'),
    ];

    const signals = analyzeGraduationRisk(
      makePlan(['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004']),
      courses,
      { requiredCredits: { value: 10, source: 'config' } },
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].evidence).toMatchObject({
      riskType: 'credit_shortfall',
      requiredCredits: 10,
      plannedDegreeApplicableCredits: 6,
      creditsShort: 4,
      source: 'config',
    });
  });

  it('flags upper-division shortfall from a canonical minimum_hours group', () => {
    const courses = [makeCourse('UD-3000', 3, 'planned'), makeCourse('UD-4000', 3, 'completed', { grade: 'A' })];
    const requirements: RequirementGroup[] = [{
      id: 'upper-division-hours',
      name: 'Upper-Division Hours',
      category: 'audit',
      type: 'minimum_hours',
      requiredHours: 10,
      coursePool: ['UD-3000', 'UD-4000'],
    }];

    const signals = analyzeGraduationRisk(makePlan(['UD-3000']), courses, { requirements });

    expect(signals).toContainEqual(expect.objectContaining({
      id: 'graduation_risk:upper_division_shortfall:upper-division-hours',
      kind: 'graduation_risk',
      severity: 'warning',
      scope: { type: 'plan' },
      message: 'Upper-division requirement upper-division-hours is 4 hours below the required total.',
      evidence: {
        riskType: 'upper_division_shortfall',
        requirementId: 'upper-division-hours',
        requiredHours: 10,
        plannedHours: 6,
        hoursShort: 4,
        source: 'audit',
      },
    }));
  });

  it('emits no upper-division signal when no canonical upper-division group exists', () => {
    const courses = [makeCourse('UD-3000', 3, 'planned')];
    const requirements: RequirementGroup[] = [{
      id: 'minimum-hours',
      name: 'Minimum Hours',
      category: 'audit',
      type: 'minimum_hours',
      requiredHours: 10,
      coursePool: ['UD-3000'],
    }];

    const signals = analyzeGraduationRisk(makePlan(['UD-3000']), courses, { requirements });

    expect(signals.some((signal) => signal.evidence.riskType === 'upper_division_shortfall')).toBe(false);
  });

  it('does not include recommendation language in any message', () => {
    const courses = [makeCourse('A-1000', 3)];
    const requirements = [completeAllGroup('core', ['A-1000', 'A-1001'])];
    const signals = analyzeGraduationRisk(makePlan(['A-1000']), courses, {
      requiredCredits: { value: 10, source: 'program' },
      requirements,
    });

    for (const signal of signals) {
      const message = signal.message.toLowerCase();
      expect(message).not.toContain('should');
      expect(message).not.toContain('must');
      expect(message).not.toContain('recommend');
      expect(message).not.toContain('better');
      expect(message).not.toContain('worse');
      expect(message).not.toContain('consider');
    }
  });

  it('uses riskType to distinguish all three subtypes in evidence', () => {
    const courses = [
      makeCourse('A-1000', 3, 'planned'),
      makeCourse('UD-3000', 3, 'planned'),
    ];
    const requirements: RequirementGroup[] = [
      completeAllGroup('core', ['A-1000', 'A-1001']),
      {
        id: 'upper-division-hours',
        name: 'Upper-Division Hours',
        category: 'audit',
        type: 'minimum_hours',
        requiredHours: 10,
        coursePool: ['UD-3000'],
      },
    ];

    const signals = analyzeGraduationRisk(makePlan(['A-1000', 'UD-3000']), courses, {
      requiredCredits: { value: 15, source: 'program' },
      requirements,
    });

    const riskTypes = signals.map((signal) => signal.evidence.riskType).sort();
    expect(riskTypes).toEqual([
      'credit_shortfall',
      'requirement_undercovered',
      'requirement_undercovered',
      'upper_division_shortfall',
    ]);
    for (const signal of signals) {
      expect(signal.kind).toBe('graduation_risk');
      expect(signal.scope).toEqual({ type: 'plan' });
    }
  });
});
