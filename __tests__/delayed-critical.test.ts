/**
 * Delayed-Critical Course Signal Tests
 *
 * Alice-approved Primitive 3 semantics:
 *   - Critical = required course with >=1 sorted unique required downstream dependent in the plan
 *   - Delayed = placed >=2 semesters later than earliest possible canonical prereq-valid placement
 *   - Severity is warning at 2 semesters, risk at >=3 or delayed bottleneck
 *   - Messages are factual only
 */

import { describe, expect, it } from 'vitest';
import { analyzeDelayedCritical } from '../lib/delayed-critical';
import type { PlanVariant } from '../lib/plan-types';
import type { Course, PrereqRule } from '../lib/types';

function courseRule(courseId: string): PrereqRule {
  return { type: 'course', courseId };
}

function andRule(courseIds: string[]): PrereqRule {
  return { type: 'and', rules: courseIds.map(courseRule) };
}

function makeCourse(
  id: string,
  prereqs: PrereqRule | string[] | null = null,
  status: Course['status'] = 'planned',
): Course {
  const prereqRule = Array.isArray(prereqs)
    ? prereqs.length === 0
      ? null
      : prereqs.length === 1
        ? courseRule(prereqs[0])
        : andRule(prereqs)
    : prereqs;

  return {
    id,
    number: id.replace('-', ' '),
    name: `${id} Course`,
    credits: 3,
    prereqs: prereqRule,
    coreqs: null,
    status,
  };
}

function makePlan(semesters: Record<string, string[]>): PlanVariant {
  return {
    id: 'test-plan',
    name: 'Test Plan',
    description: 'Test plan for delayed-critical analysis',
    semesters,
  };
}

describe('analyzeDelayedCritical', () => {
  it('does not emit for no-prereq critical course placed in the first term', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: ['A-1000'], SU27: [], FA27: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(0);
  });

  it('does not emit for no-prereq critical course placed 1 semester late', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: ['A-1000'], FA27: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(0);
  });

  it('emits warning for no-prereq critical course placed exactly 2 semesters late', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'delayed_critical_course:A-1000',
      kind: 'delayed_critical_course',
      severity: 'warning',
      scope: { type: 'course', courseId: 'A-1000' },
      evidence: {
        earliestPossibleTerm: 'SP27',
        actualTerm: 'FA27',
        semestersDelayed: 2,
        downstreamRequiredDependents: ['B-1000'],
        requiredOnly: true,
      },
    });
    expect(signals[0].message).toBe(
      'A-1000 is placed in FA27; earliest valid placement after prerequisites is SP27; delayed by 2 semester(s); has 1 downstream required dependent(s).',
    );
  });

  it('emits warning for course with prereq placed exactly 2 semesters late', () => {
    const courses = [
      makeCourse('P-1000'),
      makeCourse('A-1000', ['P-1000']),
      makeCourse('B-1000', ['A-1000']),
    ];
    const plan = makePlan({ SP27: ['P-1000'], SU27: [], FA27: [], SP28: ['A-1000'], SU28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['P-1000', 'A-1000', 'B-1000']);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      severity: 'warning',
      evidence: {
        earliestPossibleTerm: 'SU27',
        actualTerm: 'SP28',
        semestersDelayed: 2,
        downstreamRequiredDependents: ['B-1000'],
        requiredOnly: true,
      },
    });
  });

  it('emits risk for course placed 3 or more semesters late', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: [], FA27: [], SP28: ['A-1000'], SU28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      severity: 'risk',
      evidence: { earliestPossibleTerm: 'SP27', actualTerm: 'SP28', semestersDelayed: 3 },
    });
  });

  it('upgrades to risk when course is delayed 2 semesters and is a bottleneck', () => {
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000', 'C-1000', 'D-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000', 'C-1000', 'D-1000']);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      severity: 'risk',
      evidence: {
        earliestPossibleTerm: 'SP27',
        actualTerm: 'FA27',
        semestersDelayed: 2,
        downstreamRequiredDependents: ['B-1000', 'C-1000', 'D-1000'],
      },
    });
  });

  it('does not emit for bottleneck placed at earliest possible term', () => {
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({ SP27: ['A-1000'], SU27: ['B-1000', 'C-1000', 'D-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000', 'C-1000', 'D-1000']);

    expect(signals).toHaveLength(0);
  });

  it('excludes non-required downstream dependents and does not make a course critical from them', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000']);

    expect(signals).toHaveLength(0);
  });

  it('uses canonical OR prereq satisfaction for earliest possible term', () => {
    const courses = [
      makeCourse('P1-1000'),
      makeCourse('P2-1000'),
      makeCourse('A-1000', { type: 'or', rules: [courseRule('P1-1000'), courseRule('P2-1000')] }),
      makeCourse('B-1000', ['A-1000']),
    ];
    const plan = makePlan({
      SP27: ['P1-1000'],
      SU27: [],
      FA27: ['P2-1000'],
      SP28: ['A-1000'],
      SU28: ['B-1000'],
    });

    const signals = analyzeDelayedCritical(plan, courses, ['P1-1000', 'A-1000', 'B-1000']);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      severity: 'warning',
      evidence: {
        earliestPossibleTerm: 'SU27',
        actualTerm: 'SP28',
        semestersDelayed: 2,
        downstreamRequiredDependents: ['B-1000'],
      },
    });
  });

  it('does not emit when prereq is missing from plan and not completed', () => {
    const courses = [makeCourse('A-1000', ['M-1000']), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(0);
  });

  it('counts completed prereq before the plan horizon as available', () => {
    const courses = [
      makeCourse('P-1000', null, 'completed'),
      makeCourse('A-1000', ['P-1000']),
      makeCourse('B-1000', ['A-1000']),
    ];
    const plan = makePlan({ SP27: ['A-1000'], SU27: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['P-1000', 'A-1000', 'B-1000']);

    expect(signals).toHaveLength(0);
  });

  describe('Alice correction regressions', () => {
    it('does not count W-grade completed course as an available prereq', () => {
      const completedPrereq = makeCourse('P-1000', null, 'completed');
      completedPrereq.grade = 'W';
      const courses = [completedPrereq, makeCourse('A-1000', ['P-1000']), makeCourse('B-1000', ['A-1000'])];
      const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

      const signals = analyzeDelayedCritical(plan, courses, ['P-1000', 'A-1000', 'B-1000']);

      expect(signals).toHaveLength(0);
    });

    it('does not count NR-grade completed course as an available prereq', () => {
      const completedPrereq = makeCourse('P-1000', null, 'completed');
      completedPrereq.grade = 'NR';
      const courses = [completedPrereq, makeCourse('A-1000', ['P-1000']), makeCourse('B-1000', ['A-1000'])];
      const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

      const signals = analyzeDelayedCritical(plan, courses, ['P-1000', 'A-1000', 'B-1000']);

      expect(signals).toHaveLength(0);
    });

    it('does not make an unused satisfied OR branch critical', () => {
      const courses = [
        makeCourse('P1-1000'),
        makeCourse('P2-1000'),
        makeCourse('A-1000', { type: 'or', rules: [courseRule('P1-1000'), courseRule('P2-1000')] }),
        makeCourse('B-1000', ['A-1000']),
      ];
      const plan = makePlan({
        SP26: ['P1-1000'],
        SU26: ['A-1000'],
        FA26: ['B-1000'],
        SP27: [],
        SU27: [],
        FA27: [],
        SP28: [],
        SU28: [],
        FA28: ['P2-1000'],
      });

      const signals = analyzeDelayedCritical(plan, courses, ['P1-1000', 'P2-1000', 'A-1000', 'B-1000']);

      expect(signals.find((signal) => signal.scope.courseId === 'P2-1000')).toBeUndefined();
    });
  });

  it('does not emit for course with no required downstream dependents even if placed late', () => {
    const courses = [makeCourse('A-1000')];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000']);

    expect(signals).toHaveLength(0);
  });

  it('does not emit for a 1-semester delay with a prereq', () => {
    const courses = [
      makeCourse('P-1000'),
      makeCourse('A-1000', ['P-1000']),
      makeCourse('B-1000', ['A-1000']),
    ];
    const plan = makePlan({ SP27: ['P-1000'], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['P-1000', 'A-1000', 'B-1000']);

    expect(signals).toHaveLength(0);
  });

  it('keeps messages factual without recommendation language', () => {
    const courses = [makeCourse('A-1000'), makeCourse('B-1000', ['A-1000'])];
    const plan = makePlan({ SP27: [], SU27: [], FA27: ['A-1000'], SP28: ['B-1000'] });

    const signals = analyzeDelayedCritical(plan, courses, ['A-1000', 'B-1000']);

    expect(signals).toHaveLength(1);
    const message = signals[0].message.toLowerCase();
    for (const forbidden of ['recommend', 'should', 'must', 'consider', 'try', 'better', 'worse', 'suggested']) {
      expect(message).not.toContain(forbidden);
    }
  });
});
