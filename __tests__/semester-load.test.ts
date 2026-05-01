/**
 * Semester Load Signal Tests
 *
 * TDD-first tests for semester overload/underload detection.
 * Tests exact credit thresholds and severity values.
 *
 * Thresholds:
 *   < 12 credits → warning (underload)
 *   > 18 credits → warning (overload)
 *   >= 21 credits → risk (extreme overload)
 *   12-18 credits → no signal
 */

import { describe, it, expect } from 'vitest';
import { analyzeSemesterLoad } from '../lib/semester-load';
import type { OptimizationSignal } from '../lib/plan-types';
import type { PlanVariant } from '../lib/plan-types';
import type { Course } from '../lib/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal course with the given ID and credits. */
function makeCourse(id: string, credits: number): Course {
  return {
    id,
    number: id.replace('-', ' '),
    name: `${id} Course`,
    credits,
    prereqs: null,
    coreqs: null,
    status: 'planned',
  };
}

/** Build a PlanVariant with given semester→courseId[] assignments. */
function makePlan(semesters: Record<string, string[]>): PlanVariant {
  return {
    id: 'test-plan',
    name: 'Test Plan',
    description: 'Test plan for semester load analysis',
    semesters,
  };
}

// ---------------------------------------------------------------------------
// Boundary tests — exact threshold values
// ---------------------------------------------------------------------------

describe('analyzeSemesterLoad', () => {
  describe('underload threshold (< 12 credits)', () => {
    it('flags 9 credits as underload warning', () => {
      const courses = [makeCourse('A-1000', 3), makeCourse('A-1001', 3), makeCourse('A-1002', 3)];
      const plan = makePlan({ FA26: ['A-1000', 'A-1001', 'A-1002'] });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        kind: 'semester_load',
        severity: 'warning',
        scope: { type: 'semester', term: 'FA26' },
      });
      expect(signals[0].evidence).toMatchObject({ credits: 9 });
      expect(signals[0].message).toContain('FA26');
      expect(signals[0].message).toContain('9');
    });

    it('flags 11 credits as underload warning', () => {
      const courses = [
        makeCourse('A-1000', 3),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
      ];
      const plan = makePlan({ FA26: ['A-1000', 'A-1001', 'A-1002'] });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0].severity).toBe('warning');
      expect(signals[0].evidence).toMatchObject({ credits: 11 });
    });

    it('does NOT flag exactly 12 credits (boundary — no underload)', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
      ];
      const plan = makePlan({ FA26: ['A-1000', 'A-1001', 'A-1002'] });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(0);
    });
  });

  describe('normal range (12-18 credits)', () => {
    it('produces no signals for 15 credits', () => {
      const courses = [
        makeCourse('A-1000', 3),
        makeCourse('A-1001', 3),
        makeCourse('A-1002', 3),
        makeCourse('A-1003', 3),
        makeCourse('A-1004', 3),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004'],
      });

      const signals = analyzeSemesterLoad(plan, courses);
      expect(signals).toHaveLength(0);
    });

    it('does NOT flag exactly 18 credits (boundary — no overload)', () => {
      const courses = [
        makeCourse('A-1000', 3),
        makeCourse('A-1001', 3),
        makeCourse('A-1002', 3),
        makeCourse('A-1003', 3),
        makeCourse('A-1004', 3),
        makeCourse('A-1005', 3),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004', 'A-1005'],
      });

      const signals = analyzeSemesterLoad(plan, courses);
      expect(signals).toHaveLength(0);
    });
  });

  describe('overload threshold (> 18 credits)', () => {
    it('flags 19 credits as overload warning', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
        makeCourse('A-1003', 4),
        makeCourse('A-1004', 3),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        kind: 'semester_load',
        severity: 'warning',
        scope: { type: 'semester', term: 'FA26' },
      });
      expect(signals[0].evidence).toMatchObject({ credits: 19 });
      expect(signals[0].message).toContain('FA26');
      expect(signals[0].message).toContain('19');
    });

    it('flags 20 credits as overload warning (not risk — below 21)', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
        makeCourse('A-1003', 4),
        makeCourse('A-1004', 4),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0].severity).toBe('warning');
      expect(signals[0].evidence).toMatchObject({ credits: 20 });
    });
  });

  describe('extreme overload threshold (>= 21 credits)', () => {
    it('flags exactly 21 credits as extreme overload risk', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
        makeCourse('A-1003', 4),
        makeCourse('A-1004', 4),
        makeCourse('A-1005', 1),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004', 'A-1005'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        kind: 'semester_load',
        severity: 'risk',
        scope: { type: 'semester', term: 'FA26' },
      });
      expect(signals[0].evidence).toMatchObject({ credits: 21 });
    });

    it('flags 24 credits as extreme overload risk', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
        makeCourse('A-1003', 4),
        makeCourse('A-1004', 4),
        makeCourse('A-1005', 4),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004', 'A-1005'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      expect(signals).toHaveLength(1);
      expect(signals[0].severity).toBe('risk');
      expect(signals[0].evidence).toMatchObject({ credits: 24 });
    });
  });

  describe('mixed plan — multiple semesters', () => {
    it('returns signals only for problematic semesters', () => {
      const courses = [
        // Semester 1: 9 credits (underload)
        makeCourse('A-1000', 3),
        makeCourse('A-1001', 3),
        makeCourse('A-1002', 3),
        // Semester 2: 15 credits (normal)
        makeCourse('B-2000', 3),
        makeCourse('B-2001', 3),
        makeCourse('B-2002', 3),
        makeCourse('B-2003', 3),
        makeCourse('B-2004', 3),
        // Semester 3: 21 credits (extreme overload)
        makeCourse('C-3000', 4),
        makeCourse('C-3001', 4),
        makeCourse('C-3002', 4),
        makeCourse('C-3003', 4),
        makeCourse('C-3004', 4),
        makeCourse('C-3005', 1),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002'],
        SP27: ['B-2000', 'B-2001', 'B-2002', 'B-2003', 'B-2004'],
        FA27: ['C-3000', 'C-3001', 'C-3002', 'C-3003', 'C-3004', 'C-3005'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      // Should get exactly 2 signals: underload for FA26, risk for FA27
      expect(signals).toHaveLength(2);

      const fa26Signal = signals.find(s => (s.scope as { term: string }).term === 'FA26');
      const fa27Signal = signals.find(s => (s.scope as { term: string }).term === 'FA27');

      expect(fa26Signal).toBeDefined();
      expect(fa26Signal!.severity).toBe('warning');
      expect(fa26Signal!.evidence).toMatchObject({ credits: 9 });

      expect(fa27Signal).toBeDefined();
      expect(fa27Signal!.severity).toBe('risk');
      expect(fa27Signal!.evidence).toMatchObject({ credits: 21 });

      // No signal for SP27
      const sp27Signal = signals.find(s => (s.scope as { term: string }).term === 'SP27');
      expect(sp27Signal).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles an empty plan with no semesters', () => {
      const plan = makePlan({});
      const signals = analyzeSemesterLoad(plan, []);
      expect(signals).toHaveLength(0);
    });

    it('handles a semester with 0 credits (all unknown courses)', () => {
      const plan = makePlan({ FA26: ['UNKNOWN-999'] });
      const signals = analyzeSemesterLoad(plan, []);
      // 0 credits < 12 → underload warning
      expect(signals).toHaveLength(1);
      expect(signals[0].severity).toBe('warning');
      expect(signals[0].evidence).toMatchObject({ credits: 0 });
    });

    it('generates unique signal IDs', () => {
      const courses = [
        makeCourse('A-1000', 3),
        makeCourse('B-2000', 3),
      ];
      const plan = makePlan({
        FA26: ['A-1000'],
        SP27: ['B-2000'],
      });

      const signals = analyzeSemesterLoad(plan, courses);
      // Both underloaded, should have different IDs
      expect(signals).toHaveLength(2);
      expect(signals[0].id).not.toBe(signals[1].id);
    });

    it('does not include recommendation language in messages', () => {
      const courses = [
        makeCourse('A-1000', 4),
        makeCourse('A-1001', 4),
        makeCourse('A-1002', 4),
        makeCourse('A-1003', 4),
        makeCourse('A-1004', 4),
        makeCourse('A-1005', 1),
      ];
      const plan = makePlan({
        FA26: ['A-1000', 'A-1001', 'A-1002', 'A-1003', 'A-1004', 'A-1005'],
      });

      const signals = analyzeSemesterLoad(plan, courses);

      for (const signal of signals) {
        const msg = signal.message.toLowerCase();
        expect(msg).not.toContain('recommend');
        expect(msg).not.toContain('better');
        expect(msg).not.toContain('worse');
        expect(msg).not.toContain('should');
        expect(msg).not.toContain('consider');
        expect(msg).not.toContain('try');
      }
    });
  });
});
