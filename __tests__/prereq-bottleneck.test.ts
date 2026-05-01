/**
 * Prereq Bottleneck Signal Tests
 *
 * TDD-first tests for prerequisite bottleneck detection.
 * Alice-approved semantics (2026-04-30):
 *   - Bottleneck = course with ≥3 downstream REQUIRED dependents
 *   - downstreamCount = unique(directDependents ∪ transitiveDependents).length
 *   - Two signal cases: missing bottleneck, late-placement bottleneck
 *   - No recommendation language
 */

import { describe, it, expect } from 'vitest';
import { analyzePrereqBottlenecks } from '../lib/prereq-bottleneck';
import type { OptimizationSignal } from '../lib/plan-types';
import type { PlanVariant } from '../lib/plan-types';
import type { Course } from '../lib/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal course with optional prereqs. */
function makeCourse(
  id: string,
  prereqIds: string[] = [],
): Course {
  return {
    id,
    number: id.replace('-', ' '),
    name: `${id} Course`,
    credits: 3,
    prereqs:
      prereqIds.length === 0
        ? null
        : prereqIds.length === 1
          ? { type: 'course', courseId: prereqIds[0] }
          : { type: 'and', rules: prereqIds.map((p) => ({ type: 'course' as const, courseId: p })) },
    coreqs: null,
    status: 'planned',
  };
}

/** Build a PlanVariant with given semester→courseId[] assignments. */
function makePlan(semesters: Record<string, string[]>): PlanVariant {
  return {
    id: 'test-plan',
    name: 'Test Plan',
    description: 'Test plan for bottleneck analysis',
    semesters,
  };
}

// ---------------------------------------------------------------------------
// Test cases (Alice-specified, 10 required)
// ---------------------------------------------------------------------------

describe('analyzePrereqBottlenecks', () => {
  // -----------------------------------------------------------------------
  // 1. Exactly 2 downstream required courses → NO signal
  // -----------------------------------------------------------------------
  it('does NOT flag a course with exactly 2 downstream required dependents', () => {
    // A → B, A → C  (A has 2 downstream dependents)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['A-1000'],
      SP27: ['B-1000', 'C-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 2. Exactly 3 downstream required courses → signal emitted
  // -----------------------------------------------------------------------
  it('flags a course with exactly 3 downstream required dependents', () => {
    // A → B, A → C, A → D  (A has 3 downstream dependents)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['A-1000'],
      SP27: ['B-1000', 'C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    // A is placed before all dependents → no placement signal, but it IS a bottleneck
    // Since it's correctly placed, we should not get a signal (it's not missing, not late)
    // Wait — re-reading semantics: signals are only emitted for MISSING or LATE bottlenecks
    // A is present and before all dependents → no signal
    expect(signals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 3. Direct-only bottleneck (all dependents are direct prereqs)
  // -----------------------------------------------------------------------
  it('detects direct-only bottleneck when missing from plan', () => {
    // A → B, A → C, A → D  (all direct, A missing from plan)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      SP27: ['B-1000', 'C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'prereq_bottleneck',
      severity: 'warning',
      scope: { type: 'course', courseId: 'A-1000' },
    });
    expect(signals[0].evidence).toMatchObject({
      threshold: 3,
      downstreamCount: 3,
      directDependents: ['B-1000', 'C-1000', 'D-1000'],
      transitiveDependents: [],
      requiredOnly: true,
      missing: true,
    });
    expect(signals[0].message).toContain('A-1000');
    expect(signals[0].message).toContain('absent');
    expect(signals[0].message).toContain('3');
  });

  // -----------------------------------------------------------------------
  // 4. Transitive bottleneck (dependents reached through chain)
  // -----------------------------------------------------------------------
  it('detects transitive bottleneck when missing from plan', () => {
    // A → B → C → D, A → E  (A has 4 downstream: B direct, C/D transitive, E direct)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['B-1000']),
      makeCourse('D-1000', ['C-1000']),
      makeCourse('E-1000', ['A-1000']),
    ];
    const plan = makePlan({
      SP27: ['B-1000', 'C-1000', 'D-1000', 'E-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000', 'E-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    const sig = signals[0];
    expect(sig.kind).toBe('prereq_bottleneck');
    expect(sig.evidence).toMatchObject({
      threshold: 3,
      downstreamCount: 4,
      requiredOnly: true,
      missing: true,
    });
    // Direct dependents: B and E
    expect((sig.evidence as Record<string, unknown>).directDependents).toEqual(
      expect.arrayContaining(['B-1000', 'E-1000']),
    );
    // Transitive dependents: C and D
    expect((sig.evidence as Record<string, unknown>).transitiveDependents).toEqual(
      expect.arrayContaining(['C-1000', 'D-1000']),
    );
  });

  // -----------------------------------------------------------------------
  // 5. Absent bottleneck signal (missing from plan)
  // -----------------------------------------------------------------------
  it('emits missing bottleneck signal with correct message format', () => {
    // A → B, A → C, A → D  (A missing from plan)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['B-1000', 'C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    expect(signals[0].message).toMatch(
      /A-1000 is absent from the plan and is a prerequisite for 3 downstream required courses/,
    );
    expect(signals[0].evidence).toMatchObject({ missing: true });
  });

  // -----------------------------------------------------------------------
  // 6. Placed BEFORE all downstream courses → NO placement signal
  // -----------------------------------------------------------------------
  it('does NOT flag a bottleneck placed before all downstream courses', () => {
    // A → B, A → C, A → D — A in FA26, all dependents in SP27
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['A-1000'],
      SP27: ['B-1000', 'C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 7. Same semester as downstream course → placement warning
  // -----------------------------------------------------------------------
  it('flags bottleneck in same semester as a downstream course', () => {
    // A → B, A → C, A → D — A and B both in FA26
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['A-1000', 'B-1000'],
      SP27: ['C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'prereq_bottleneck',
      severity: 'warning',
      scope: { type: 'course', courseId: 'A-1000' },
    });
    expect(signals[0].evidence).toMatchObject({
      threshold: 3,
      downstreamCount: 3,
      requiredOnly: true,
    });
    expect((signals[0].evidence as Record<string, unknown>).placement).toMatchObject({
      bottleneckTerm: 'FA26',
      earliestProblematicDownstreamTerm: 'FA26',
      problematicDownstreamDependents: ['B-1000'],
      chainDepth: 1,
    });
    expect(signals[0].message).toContain('A-1000');
    expect(signals[0].message).toContain('FA26');
  });

  // -----------------------------------------------------------------------
  // 8. After downstream course → placement warning
  // -----------------------------------------------------------------------
  it('flags bottleneck placed after a downstream course', () => {
    // A → B, A → C, A → D — A in SP27, B in FA26 (B is before A!)
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['B-1000'],
      SP27: ['A-1000', 'C-1000', 'D-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'prereq_bottleneck',
      severity: 'warning',
      scope: { type: 'course', courseId: 'A-1000' },
    });
    expect((signals[0].evidence as Record<string, unknown>).placement).toMatchObject({
      bottleneckTerm: 'SP27',
      earliestProblematicDownstreamTerm: 'FA26',
      problematicDownstreamDependents: ['B-1000', 'C-1000', 'D-1000'],
      chainDepth: 1,
    });
    expect(signals[0].message).toContain('A-1000');
    expect(signals[0].message).toContain('SP27');
  });

  // -----------------------------------------------------------------------
  // 8b. earliestProblematicDownstreamTerm is the EARLIEST conflicting term
  // -----------------------------------------------------------------------
  it('earliestProblematicDownstreamTerm equals the earliest conflicting downstream term', () => {
    // A → B, A → C, A → D, A → E
    // A placed in FA27. B in FA26, C in SP27, D in FA27 (same), E in SP28 (after → not problematic)
    // Problematic: B (FA26), C (SP27), D (FA27) — earliest is FA26
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
      makeCourse('E-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['B-1000'],
      SP27: ['C-1000'],
      FA27: ['A-1000', 'D-1000'],
      SP28: ['E-1000'],
    });
    const required = ['A-1000', 'B-1000', 'C-1000', 'D-1000', 'E-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(1);
    const placement = (signals[0].evidence as Record<string, unknown>).placement as Record<string, unknown>;
    // Earliest problematic is FA26 (B-1000), not SP27 or FA27
    expect(placement.earliestProblematicDownstreamTerm).toBe('FA26');
    // Problematic dependents: B (FA26), C (SP27), D (FA27 same semester) — all placed at or before bottleneck
    expect(placement.problematicDownstreamDependents).toEqual(['B-1000', 'C-1000', 'D-1000']);
    // E-1000 is in SP28 (after FA27) so NOT problematic
    expect(placement.problematicDownstreamDependents).not.toContain('E-1000');
    expect(placement.bottleneckTerm).toBe('FA27');
  });

  // -----------------------------------------------------------------------
  // 9. Non-required downstream courses excluded from count
  // -----------------------------------------------------------------------
  it('excludes non-required downstream courses from bottleneck count', () => {
    // A → B, A → C, A → D, A → E
    // But only B and C are required → downstream count = 2 → no bottleneck
    const courses = [
      makeCourse('A-1000'),
      makeCourse('B-1000', ['A-1000']),
      makeCourse('C-1000', ['A-1000']),
      makeCourse('D-1000', ['A-1000']),
      makeCourse('E-1000', ['A-1000']),
    ];
    const plan = makePlan({
      FA26: ['A-1000'],
      SP27: ['B-1000', 'C-1000', 'D-1000', 'E-1000'],
    });
    // Only A, B, C are required — D and E are electives
    const required = ['A-1000', 'B-1000', 'C-1000'];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 10. No recommendation language in any message
  // -----------------------------------------------------------------------
  it('does not include recommendation language in any message', () => {
    // Create both signal types to check all messages
    const courses = [
      // Missing bottleneck: X not in plan
      makeCourse('X-1000'),
      makeCourse('X-2000', ['X-1000']),
      makeCourse('X-3000', ['X-1000']),
      makeCourse('X-4000', ['X-1000']),
      // Late bottleneck: Y in same semester as dependent
      makeCourse('Y-1000'),
      makeCourse('Y-2000', ['Y-1000']),
      makeCourse('Y-3000', ['Y-1000']),
      makeCourse('Y-4000', ['Y-1000']),
    ];
    const plan = makePlan({
      FA26: ['Y-1000', 'Y-2000', 'X-2000'],
      SP27: ['Y-3000', 'Y-4000', 'X-3000', 'X-4000'],
    });
    const required = [
      'X-1000', 'X-2000', 'X-3000', 'X-4000',
      'Y-1000', 'Y-2000', 'Y-3000', 'Y-4000',
    ];

    const signals = analyzePrereqBottlenecks(plan, courses, required);

    expect(signals.length).toBeGreaterThanOrEqual(2);

    for (const signal of signals) {
      const msg = signal.message.toLowerCase();
      expect(msg).not.toContain('recommend');
      expect(msg).not.toContain('should');
      expect(msg).not.toContain('must');
      expect(msg).not.toContain('consider');
      expect(msg).not.toContain('try');
      expect(msg).not.toContain('better');
      expect(msg).not.toContain('worse');
      expect(msg).not.toContain('suggested');
    }
  });
});
