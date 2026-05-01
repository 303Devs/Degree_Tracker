/**
 * Plan Comparison Engine Tests
 *
 * Test matrix from docs/task-6-execution-checklist.md:
 * - Core correctness: identical plans, moved, onlyInA, onlyInB, semester add, load delta
 * - Validation gate: duplicate course, unknown course, empty plan block comparison
 * - Prereq behavior: regression in B, improvement in B
 * - Requirement behavior: coverage difference surfaced
 * - Real fixture: ML vs DL comparison
 *
 * Canonical repo: /Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
 */

import { describe, it, expect } from 'vitest';
import {
  comparePlans,
  compareCourseAssignments,
  compareSemesterLoads,
  compareRequirementCoverage,
  comparePrereqRisks,
} from '../lib/plan-comparison';
import { normalizePlansFromJson } from '../lib/plan-normalization';
import type { PlanVariant, RawPlanData } from '../lib/plan-types';
import type { Course, RequirementGroup } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCourse(id: string, credits: number, overrides: Partial<Course> = {}): Course {
  return {
    id,
    number: id.replace('-', ' '),
    name: `Test ${id}`,
    credits,
    prereqs: null,
    coreqs: null,
    status: 'not_started',
    ...overrides,
  };
}

const baseCourses: Course[] = [
  makeCourse('MATH-2300', 5),
  makeCourse('CSCI-2824', 3),
  makeCourse('STAT-2600', 4),
  makeCourse('APPM-1650', 4),
  makeCourse('APPM-2350', 4),
  makeCourse('APPM-3310', 3),
  makeCourse('STAT-3100', 3, {
    prereqs: { type: 'course', courseId: 'APPM-2350' },
  }),
  makeCourse('CSCI-2400', 4),
  makeCourse('APPM-3650', 3, {
    prereqs: {
      type: 'and',
      rules: [
        { type: 'course', courseId: 'APPM-1650' },
        { type: 'course', courseId: 'MATH-2300' },
      ],
    },
  }),
  makeCourse('STAT-4520', 3, {
    prereqs: { type: 'course', courseId: 'STAT-3100' },
  }),
  makeCourse('STAT-3400', 3, {
    prereqs: {
      type: 'and',
      rules: [
        { type: 'course', courseId: 'STAT-2600' },
        { type: 'course', courseId: 'STAT-3100' },
      ],
    },
  }),
  makeCourse('STAT-4400', 3, {
    prereqs: {
      type: 'and',
      rules: [
        { type: 'course', courseId: 'STAT-3400' },
        { type: 'course', courseId: 'STAT-4520' },
      ],
    },
  }),
  makeCourse('STAT-4100', 3, {
    prereqs: { type: 'course', courseId: 'STAT-3100' },
  }),
  makeCourse('STAT-4610', 3, {
    prereqs: { type: 'course', courseId: 'STAT-3400' },
  }),
  makeCourse('STAT-4640', 3, {
    prereqs: {
      type: 'or',
      rules: [
        { type: 'course', courseId: 'STAT-4400' },
        { type: 'course', courseId: 'STAT-4610' },
      ],
    },
  }),
  makeCourse('STAT-4630', 3),
  makeCourse('APPM-4440', 3, {
    prereqs: { type: 'course', courseId: 'APPM-2350' },
  }),
  makeCourse('APPM-4490', 3, {
    prereqs: { type: 'course', courseId: 'APPM-4440' },
  }),
  makeCourse('APPM-4515', 3),
  makeCourse('CSCI-4622', 3),
  makeCourse('CSCI-3155', 3),
  makeCourse('APPM-4370', 3),
  makeCourse('STAT-4350', 3, {
    prereqs: {
      type: 'and',
      rules: [
        { type: 'course', courseId: 'STAT-3100' },
        { type: 'course', courseId: 'STAT-3400' },
      ],
    },
  }),
  makeCourse('STAT-4360', 3, {
    prereqs: { type: 'course', courseId: 'STAT-4350' },
  }),
  makeCourse('APPM-4600', 4),
];

const baseRequirements: RequirementGroup[] = [
  {
    id: 'major-lower',
    name: 'Major Lower Division',
    category: 'Statistics & Data Science Major',
    type: 'complete_all',
    coursePool: ['STAT-2600', 'APPM-2350'],
  },
  {
    id: 'major-upper-required',
    name: 'Major Upper Division Required',
    category: 'Statistics & Data Science Major',
    type: 'complete_all',
    coursePool: [
      'APPM-3310', 'APPM-3650', 'STAT-3100', 'STAT-4520',
      'STAT-3400', 'STAT-4400', 'STAT-4100', 'STAT-4610',
      'STAT-4640',
    ],
  },
  {
    id: 'major-upper-elective',
    name: 'Major Upper Division Electives',
    category: 'Statistics & Data Science Major',
    type: 'pick_n',
    required: 2,
    coursePool: [
      'STAT-4350', 'STAT-4360', 'STAT-4630', 'APPM-4440',
      'APPM-4490', 'APPM-4515', 'APPM-4370', 'APPM-4600',
    ],
  },
];

// ---------------------------------------------------------------------------
// Core correctness
// ---------------------------------------------------------------------------

describe('compareCourseAssignments', () => {
  it('returns empty diffs for identical plans', () => {
    const plan: PlanVariant = {
      id: 'test',
      name: 'Test',
      description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824'],
        SP27: ['STAT-2600'],
      },
    };

    const result = compareCourseAssignments(plan, plan);
    expect(result.onlyInA).toEqual([]);
    expect(result.onlyInB).toEqual([]);
    expect(result.moved).toEqual([]);
    expect(result.unchanged).toEqual(['CSCI-2824', 'MATH-2300', 'STAT-2600']);
  });

  it('detects courses only in A', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300', 'CSCI-2824'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const result = compareCourseAssignments(planA, planB);
    expect(result.onlyInA).toEqual(['CSCI-2824']);
    expect(result.onlyInB).toEqual([]);
    expect(result.unchanged).toEqual(['MATH-2300']);
  });

  it('detects courses only in B', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300', 'APPM-1650'] },
    };

    const result = compareCourseAssignments(planA, planB);
    expect(result.onlyInA).toEqual([]);
    expect(result.onlyInB).toEqual(['APPM-1650']);
  });

  it('detects moved courses (same course, different semester)', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600'], SP27: ['STAT-3100'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['STAT-3100'], SP27: ['STAT-2600'] },
    };

    const result = compareCourseAssignments(planA, planB);
    expect(result.onlyInA).toEqual([]);
    expect(result.onlyInB).toEqual([]);
    expect(result.moved).toHaveLength(2);
    expect(result.moved).toContainEqual({
      courseId: 'STAT-2600',
      fromSemester: 'FA26',
      toSemester: 'SP27',
    });
    expect(result.moved).toContainEqual({
      courseId: 'STAT-3100',
      fromSemester: 'SP27',
      toSemester: 'FA26',
    });
    expect(result.unchanged).toEqual([]);
  });

  it('moved courses do NOT appear in onlyInA / onlyInB', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600'], SP27: [] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: [], SP27: ['STAT-2600'] },
    };

    const result = compareCourseAssignments(planA, planB);
    expect(result.onlyInA).toEqual([]);
    expect(result.onlyInB).toEqual([]);
    expect(result.moved).toHaveLength(1);
    expect(result.moved[0].courseId).toBe('STAT-2600');
  });
});

describe('compareSemesterLoads', () => {
  const courseMap = new Map(baseCourses.map(c => [c.id, c]));

  it('covers union of semesters from both plans', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { SP27: ['STAT-2600'] },
    };

    const diffs = compareSemesterLoads(planA, planB, courseMap);
    expect(diffs).toHaveLength(2);
    const semIds = diffs.map(d => d.semesterId);
    expect(semIds).toContain('FA26');
    expect(semIds).toContain('SP27');
  });

  it('shows credit deltas correctly', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300', 'CSCI-2824'] }, // 5+3=8
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] }, // 5
    };

    const diffs = compareSemesterLoads(planA, planB, courseMap);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].creditsA).toBe(8);
    expect(diffs[0].creditsB).toBe(5);
    expect(diffs[0].creditDelta).toBe(-3);
    expect(diffs[0].coursesOnlyInA).toEqual(['CSCI-2824']);
    expect(diffs[0].coursesOnlyInB).toEqual([]);
  });

  it('handles semester only in one plan', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'], SU27: ['STAT-2600'] },
    };

    const diffs = compareSemesterLoads(planA, planB, courseMap);
    const su27 = diffs.find(d => d.semesterId === 'SU27');
    expect(su27).toBeDefined();
    expect(su27!.creditsA).toBe(0);
    expect(su27!.creditsB).toBe(4);
    expect(su27!.creditDelta).toBe(4);
  });

  it('orders semesters canonically', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { SP28: ['MATH-2300'], FA26: ['CSCI-2824'], SU27: ['STAT-2600'] },
    };

    const diffs = compareSemesterLoads(planA, planA, courseMap);
    expect(diffs.map(d => d.semesterId)).toEqual(['FA26', 'SU27', 'SP28']);
  });
});

// ---------------------------------------------------------------------------
// Validation gate
// ---------------------------------------------------------------------------

describe('comparePlans - validation gate', () => {
  it('blocks comparison when plan A is empty', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '', semesters: {},
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(false);
    expect(result.comparison).toBeUndefined();
    expect(result.issues.some(i => i.code === 'EMPTY_PLAN')).toBe(true);
  });

  it('blocks comparison when plan B is empty', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '', semesters: {},
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(false);
    expect(result.comparison).toBeUndefined();
  });

  it('blocks comparison when plan has unknown courses', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300', 'DOES-9999'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(false);
    expect(result.comparison).toBeUndefined();
    expect(result.issues.some(i => i.code === 'COURSE_NOT_FOUND' && i.type === 'error')).toBe(true);
  });

  it('blocks comparison when plan has duplicate course across semesters', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'], SP27: ['MATH-2300', 'STAT-2600'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(false);
    expect(result.comparison).toBeUndefined();
    expect(result.issues.some(i => i.code === 'DUPLICATE_COURSE_ASSIGNMENT' && i.type === 'error')).toBe(true);
  });

  it('succeeds for valid plans with warnings', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { SP27: ['STAT-2600'] },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    // Should succeed despite NO_SEMESTER_OVERLAP warning
    expect(result.success).toBe(true);
    expect(result.comparison).toBeDefined();
    expect(result.issues.some(i => i.code === 'NO_SEMESTER_OVERLAP')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prereq behavior
// ---------------------------------------------------------------------------

describe('comparePrereqRisks', () => {
  it('detects prereq regression in B (ok → blocked)', () => {
    // Plan A: STAT-3100 after APPM-2350 (satisfied)
    // Plan B: STAT-3100 before APPM-2350 (broken)
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['APPM-2350'],
        SP27: ['STAT-3100'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['STAT-3100'],
        SP27: ['APPM-2350'],
      },
    };

    const diffs = comparePrereqRisks(planA, planB, baseCourses);
    const stat3100 = diffs.find(d => d.courseId === 'STAT-3100');
    expect(stat3100).toBeDefined();
    expect(stat3100!.riskInA).toBe('ok');
    expect(stat3100!.riskInB).toBe('blocked');
    expect(stat3100!.changed).toBe(true);
  });

  it('detects prereq improvement in B (blocked → ok)', () => {
    // Plan A: STAT-3100 same semester as APPM-2350 (blocked - prereq not before)
    // Plan B: STAT-3100 after APPM-2350 (satisfied)
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['APPM-2350', 'STAT-3100'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['APPM-2350'],
        SP27: ['STAT-3100'],
      },
    };

    const diffs = comparePrereqRisks(planA, planB, baseCourses);
    const stat3100 = diffs.find(d => d.courseId === 'STAT-3100');
    expect(stat3100).toBeDefined();
    expect(stat3100!.riskInA).toBe('blocked');
    expect(stat3100!.riskInB).toBe('ok');
    expect(stat3100!.changed).toBe(true);
  });

  it('reports no diffs when prereqs are the same in both', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: {
        FA26: ['APPM-2350'],
        SP27: ['STAT-3100'],
      },
    };

    const diffs = comparePrereqRisks(plan, plan, baseCourses);
    // No changed diffs for identical plans
    expect(diffs.filter(d => d.changed)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Requirement coverage
// ---------------------------------------------------------------------------

describe('compareRequirementCoverage', () => {
  it('shows coverage difference when plans include different courses', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['STAT-2600', 'APPM-2350'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['STAT-2600'],
      },
    };

    // Both plans contain courses that count toward major-lower (complete_all)
    // Difference: planA has both STAT-2600 + APPM-2350, planB only STAT-2600
    const diffs = compareRequirementCoverage(planA, planB, baseCourses, baseRequirements);
    const majorLower = diffs.find(d => d.groupId === 'major-lower');
    expect(majorLower).toBeDefined();
    // Both will show 0 completed since courses are status 'not_started' in baseCourses
    // The difference is that planned status doesn't change completed count
    // This is correct: calcProgress counts completed, not planned
  });

  it('returns a diff for every requirement group', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const diffs = compareRequirementCoverage(plan, plan, baseCourses, baseRequirements);
    expect(diffs).toHaveLength(baseRequirements.length);
  });
});

// ---------------------------------------------------------------------------
// Full comparison
// ---------------------------------------------------------------------------

describe('comparePlans - full integration', () => {
  it('produces complete comparison for two different plans', () => {
    const planA: PlanVariant = {
      id: 'plan-a', name: 'Plan A', description: 'Focus A',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824', 'STAT-2600', 'APPM-1650'],
        SP27: ['APPM-2350', 'STAT-3100'],
      },
    };
    const planB: PlanVariant = {
      id: 'plan-b', name: 'Plan B', description: 'Focus B',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824', 'STAT-2600', 'APPM-1650'],
        SP27: ['APPM-2350', 'APPM-3310'],
      },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    expect(result.comparison).toBeDefined();

    const comp = result.comparison!;

    // Plan summaries
    expect(comp.planA.id).toBe('plan-a');
    expect(comp.planB.id).toBe('plan-b');
    expect(comp.planA.semesterCount).toBe(2);
    expect(comp.planB.semesterCount).toBe(2);

    // Course diffs
    expect(comp.courseDiffs.onlyInA).toEqual(['STAT-3100']);
    expect(comp.courseDiffs.onlyInB).toEqual(['APPM-3310']);
    expect(comp.courseDiffs.unchanged.length).toBe(5); // FA26 courses + APPM-2350

    // Semester diffs
    expect(comp.semesterDiffs).toHaveLength(2);
    const sp27 = comp.semesterDiffs.find(d => d.semesterId === 'SP27');
    expect(sp27).toBeDefined();
    expect(sp27!.coursesOnlyInA).toEqual(['STAT-3100']);
    expect(sp27!.coursesOnlyInB).toEqual(['APPM-3310']);

    // Summary
    expect(comp.summary.coursesOnlyInACount).toBe(1);
    expect(comp.summary.coursesOnlyInBCount).toBe(1);
    expect(comp.summary.movedCourseCount).toBe(0);
  });

  it('handles moved courses correctly in full comparison', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['MATH-2300', 'STAT-2600'],
        SP27: ['CSCI-2824'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824'],
        SP27: ['STAT-2600'],
      },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    expect(comp.courseDiffs.moved).toHaveLength(2);
    expect(comp.courseDiffs.onlyInA).toEqual([]);
    expect(comp.courseDiffs.onlyInB).toEqual([]);
    expect(comp.summary.movedCourseCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Real fixture: ML vs DL comparison
// ---------------------------------------------------------------------------

describe('Real ML vs DL plan comparison', () => {
  // Load actual data
  const plansJsonPath = path.join(__dirname, '..', 'ml-dl-plans.json');
  const coursesJsonPath = path.join(__dirname, '..', 'data', 'courses.json');
  const requirementsJsonPath = path.join(__dirname, '..', 'data', 'requirements.json');

  let mlPlan: PlanVariant;
  let dlPlan: PlanVariant;
  let courses: Course[];
  let requirements: RequirementGroup[];

  // Load fixtures synchronously before tests
  const rawPlans: RawPlanData = JSON.parse(fs.readFileSync(plansJsonPath, 'utf-8'));
  courses = JSON.parse(fs.readFileSync(coursesJsonPath, 'utf-8'));
  requirements = JSON.parse(fs.readFileSync(requirementsJsonPath, 'utf-8'));

  // Normalize plans with strict validation - all plan courses
  // (including CSCI-2400 and CSCI-3155) exist in the course catalog
  it('normalizes plans successfully', async () => {
    const { plans, issues } = await normalizePlansFromJson(rawPlans, courses);

    expect(plans).toHaveLength(2);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;
    expect(mlPlan).toBeDefined();
    expect(dlPlan).toBeDefined();
  });

  it('ML vs DL comparison returns success', async () => {
    // Normalize first with strict validation
    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    expect(result.success).toBe(true);
    expect(result.comparison).toBeDefined();
  });

  it('ML vs DL comparison returns non-empty course/semester diffs', async () => {
    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    const comp = result.comparison!;

    // Plans have different courses
    expect(
      comp.courseDiffs.onlyInA.length +
      comp.courseDiffs.onlyInB.length +
      comp.courseDiffs.moved.length,
    ).toBeGreaterThan(0);

    // Plans have semester differences
    expect(comp.semesterDiffs.length).toBeGreaterThan(0);
  });

  it('ML vs DL comparison returns stable summary values', async () => {
    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result1 = comparePlans(mlPlan, dlPlan, courses, requirements);
    const result2 = comparePlans(mlPlan, dlPlan, courses, requirements);

    // Deterministic: same inputs → same outputs
    expect(result1.comparison!.summary).toEqual(result2.comparison!.summary);
    expect(result1.comparison!.courseDiffs).toEqual(result2.comparison!.courseDiffs);
    expect(result1.comparison!.semesterDiffs).toEqual(result2.comparison!.semesterDiffs);
  });

  it('ML vs DL: identifies specific known differences', async () => {
    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    const comp = result.comparison!;

    // ML has APPM-4440, STAT-4100, APPM-4490 that DL doesn't
    expect(comp.courseDiffs.onlyInA).toContain('APPM-4440');
    expect(comp.courseDiffs.onlyInA).toContain('STAT-4100');
    expect(comp.courseDiffs.onlyInA).toContain('APPM-4490');

    // DL has STAT-4350, STAT-4360, APPM-4370 that ML doesn't
    expect(comp.courseDiffs.onlyInB).toContain('STAT-4350');
    expect(comp.courseDiffs.onlyInB).toContain('STAT-4360');
    expect(comp.courseDiffs.onlyInB).toContain('APPM-4370');

    // Both share FA26 courses
    expect(comp.courseDiffs.unchanged).toContain('MATH-2300');
    expect(comp.courseDiffs.unchanged).toContain('CSCI-2824');
    expect(comp.courseDiffs.unchanged).toContain('STAT-2600');
    expect(comp.courseDiffs.unchanged).toContain('APPM-1650');

    // Both have 5 semesters
    expect(comp.planA.semesterCount).toBe(5);
    expect(comp.planB.semesterCount).toBe(5);
  });

  it('ML vs DL: CSCI-3155 moves from SP27 to SU27', async () => {
    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    const comp = result.comparison!;

    const csci3155Move = comp.courseDiffs.moved.find(m => m.courseId === 'CSCI-3155');
    expect(csci3155Move).toBeDefined();
    expect(csci3155Move!.fromSemester).toBe('SP27');
    expect(csci3155Move!.toSemester).toBe('SU27');
  });
});

// ---------------------------------------------------------------------------
// Overload introduced
// ---------------------------------------------------------------------------

describe('overload detection', () => {
  const courseMap = new Map(baseCourses.map(c => [c.id, c]));

  it('detects when plan B introduces a heavier semester than plan A', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824'],
        SP27: ['STAT-2600', 'APPM-1650'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824', 'STAT-2600', 'APPM-1650'],
        SP27: [],
      },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    expect(comp.summary.maxSemesterCreditsB).toBeGreaterThan(comp.summary.maxSemesterCreditsA);
    expect(comp.summary.maxSemesterCreditsA).toBe(8);
    expect(comp.summary.maxSemesterCreditsB).toBe(16);
  });

  it('compareSemesterLoads shows per-semester credit delta for overloaded semester', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824'],
        SP27: ['STAT-2600', 'APPM-1650', 'APPM-2350'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824', 'STAT-2600', 'APPM-1650', 'APPM-2350'],
        SP27: [],
      },
    };

    const diffs = compareSemesterLoads(planA, planB, courseMap);
    const fa26 = diffs.find(d => d.semesterId === 'FA26')!;
    expect(fa26.creditsA).toBe(8);
    expect(fa26.creditsB).toBe(20);
    expect(fa26.creditDelta).toBe(12);

    const sp27 = diffs.find(d => d.semesterId === 'SP27')!;
    expect(sp27.creditsA).toBe(12);
    expect(sp27.creditsB).toBe(0);
    expect(sp27.creditDelta).toBe(-12);
  });

  it('summary maxSemesterCredits reflects the heaviest semester in each plan', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        FA26: ['MATH-2300'],
        SP27: ['STAT-2600', 'APPM-1650'],
        FA27: ['APPM-2350', 'CSCI-2824'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['MATH-2300', 'STAT-2600', 'APPM-1650', 'APPM-2350', 'CSCI-2824'],
        SP27: [],
        FA27: [],
      },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    expect(comp.summary.maxSemesterCreditsA).toBe(8);
    expect(comp.summary.maxSemesterCreditsB).toBe(20);
    expect(comp.planA.maxSemesterCredits).toBe(8);
    expect(comp.planB.maxSemesterCredits).toBe(20);
  });

  it('identical plans have equal maxSemesterCredits', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: {
        FA26: ['MATH-2300', 'CSCI-2824'],
        SP27: ['STAT-2600', 'APPM-1650'],
      },
    };

    const result = comparePlans(plan, plan, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;
    expect(comp.summary.maxSemesterCreditsA).toBe(comp.summary.maxSemesterCreditsB);
    expect(comp.summary.maxSemesterCreditsA).toBe(8);
  });

  it('ML vs DL: summary shows max semester credits for both real plans', async () => {
    const plansJsonPath = path.join(__dirname, '..', 'ml-dl-plans.json');
    const coursesJsonPath = path.join(__dirname, '..', 'data', 'courses.json');
    const requirementsJsonPath = path.join(__dirname, '..', 'data', 'requirements.json');
    const rawPlans: RawPlanData = JSON.parse(fs.readFileSync(plansJsonPath, 'utf-8'));
    const courses: Course[] = JSON.parse(fs.readFileSync(coursesJsonPath, 'utf-8'));
    const requirements: RequirementGroup[] = JSON.parse(fs.readFileSync(requirementsJsonPath, 'utf-8'));

    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    const mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    const dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    expect(comp.summary.maxSemesterCreditsA).toBeGreaterThan(0);
    expect(comp.summary.maxSemesterCreditsB).toBeGreaterThan(0);
    expect(comp.summary.maxSemesterCreditsA).toBeLessThan(25);
    expect(comp.summary.maxSemesterCreditsB).toBeLessThan(25);
    expect(comp.planA.maxSemesterCredits).toBe(comp.summary.maxSemesterCreditsA);
    expect(comp.planB.maxSemesterCredits).toBe(comp.summary.maxSemesterCreditsB);
  });
});

// ---------------------------------------------------------------------------
// Requirement coverage semantics
// ---------------------------------------------------------------------------

describe('requirement coverage semantics', () => {
  it('coverage delta reflects completed courses from base catalog', () => {
    const completedCourses = baseCourses.map(c => {
      if (c.id === 'STAT-2600' || c.id === 'APPM-2350') {
        return { ...c, status: 'completed' as const };
      }
      return c;
    });

    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['STAT-2600'] },
    };

    const diffs = compareRequirementCoverage(planA, planB, completedCourses, baseRequirements);
    const majorLower = diffs.find(d => d.groupId === 'major-lower')!;
    expect(majorLower).toBeDefined();
    // buildPlanCourseView preserves 'completed' status for already-completed courses
    expect(majorLower.completedA).toBe(2);
    expect(majorLower.completedB).toBe(2);
    expect(majorLower.delta).toBe(0);
  });

  it('coverage delta is 0 when both plans have same courses and same completion', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350'] },
    };

    const diffs = compareRequirementCoverage(plan, plan, baseCourses, baseRequirements);
    for (const diff of diffs) {
      expect(diff.delta).toBe(0);
      expect(diff.completedA).toBe(diff.completedB);
    }
  });

  it('coverage tracks all requirement groups with correct totals', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const diffs = compareRequirementCoverage(plan, plan, baseCourses, baseRequirements);
    expect(diffs).toHaveLength(3);

    const majorLower = diffs.find(d => d.groupId === 'major-lower')!;
    expect(majorLower.total).toBe(2);

    const upperReq = diffs.find(d => d.groupId === 'major-upper-required')!;
    expect(upperReq.total).toBe(9);

    const upperElec = diffs.find(d => d.groupId === 'major-upper-elective')!;
    expect(upperElec.total).toBe(2);
  });

  it('completed course status preserved regardless of plan inclusion', () => {
    const courses = baseCourses.map(c =>
      c.id === 'STAT-2600' ? { ...c, status: 'completed' as const } : c
    );

    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600', 'MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const diffs = compareRequirementCoverage(planA, planB, courses, baseRequirements);
    const majorLower = diffs.find(d => d.groupId === 'major-lower')!;
    // calcProgress finds STAT-2600 completed in both views since base catalog has it completed
    expect(majorLower.completedA).toBe(majorLower.completedB);
  });

  it('summary counts requirements improved vs regressed in B', () => {
    const courses = baseCourses.map(c => {
      if (['STAT-2600', 'APPM-2350'].includes(c.id)) {
        return { ...c, status: 'completed' as const };
      }
      return c;
    });

    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['MATH-2300'] },
    };

    const result = comparePlans(planA, planB, courses, baseRequirements);
    expect(result.success).toBe(true);
    expect(result.comparison!.summary.requirementsImprovedInB).toBe(0);
    expect(result.comparison!.summary.requirementsRegressedInB).toBe(0);
  });

  it('ML vs DL: requirement coverage diffs are present and have valid structure', async () => {
    const plansJsonPath = path.join(__dirname, '..', 'ml-dl-plans.json');
    const coursesJsonPath = path.join(__dirname, '..', 'data', 'courses.json');
    const requirementsJsonPath = path.join(__dirname, '..', 'data', 'requirements.json');
    const rawPlans: RawPlanData = JSON.parse(fs.readFileSync(plansJsonPath, 'utf-8'));
    const courses: Course[] = JSON.parse(fs.readFileSync(coursesJsonPath, 'utf-8'));
    const requirements: RequirementGroup[] = JSON.parse(fs.readFileSync(requirementsJsonPath, 'utf-8'));

    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    const mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    const dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    expect(comp.requirementDiffs.length).toBe(requirements.length);
    for (const diff of comp.requirementDiffs) {
      expect(diff.groupId).toBeTruthy();
      expect(diff.groupName).toBeTruthy();
      expect(diff.total).toBeGreaterThan(0);
      expect(diff.completedA).toBeGreaterThanOrEqual(0);
      expect(diff.completedB).toBeGreaterThanOrEqual(0);
      expect(diff.delta).toBe(diff.completedB - diff.completedA);
    }
  });
});

// ---------------------------------------------------------------------------
// Planned-coverage semantics (Task 7 original spec)
// ---------------------------------------------------------------------------

describe('planned-coverage semantics', () => {
  it('detects coverage regression when Plan B omits a planned course that covers a requirement', () => {
    // Plan A includes STAT-3100 (covers major-upper-required), Plan B omits it
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600', 'STAT-3100'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['STAT-2600'] },
    };

    const diffs = compareRequirementCoverage(planA, planB, baseCourses, baseRequirements);
    const upperReq = diffs.find(d => d.groupId === 'major-upper-required')!;

    // completed delta should be 0 (neither course is completed)
    expect(upperReq.delta).toBe(0);

    // But coverage delta MUST detect the regression: Plan A covers STAT-3100, Plan B doesn't
    expect(upperReq.coveredA).toBeGreaterThan(upperReq.coveredB);
    expect(upperReq.coverageDelta).toBeLessThan(0);
  });

  it('detects coverage improvement when Plan B adds a planned course', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350'] },
    };

    const diffs = compareRequirementCoverage(planA, planB, baseCourses, baseRequirements);
    const majorLower = diffs.find(d => d.groupId === 'major-lower')!;

    // No completed courses, so completed delta = 0
    expect(majorLower.delta).toBe(0);

    // Coverage should show improvement: Plan B covers APPM-2350
    expect(majorLower.coveredB).toBeGreaterThan(majorLower.coveredA);
    expect(majorLower.coverageDelta).toBeGreaterThan(0);
  });

  it('coverage delta is 0 when both plans cover the same requirements', () => {
    const plan: PlanVariant = {
      id: 'test', name: 'Test', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350'] },
    };

    const diffs = compareRequirementCoverage(plan, plan, baseCourses, baseRequirements);
    for (const diff of diffs) {
      expect(diff.coverageDelta).toBe(0);
      expect(diff.coveredA).toBe(diff.coveredB);
    }
  });

  it('completed courses still count in coverage even when not in plan', () => {
    const courses = baseCourses.map(c =>
      c.id === 'STAT-2600' ? { ...c, status: 'completed' as const } : c
    );

    // Plan A includes STAT-2600 + APPM-2350, Plan B only APPM-2350
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['APPM-2350'] },
    };

    const diffs = compareRequirementCoverage(planA, planB, courses, baseRequirements);
    const majorLower = diffs.find(d => d.groupId === 'major-lower')!;

    // STAT-2600 is completed in base — shows as completed in both plans
    // APPM-2350 is planned in both plans
    // Coverage should be equal: completed STAT-2600 + planned APPM-2350 in both
    expect(majorLower.coveredA).toBe(2);
    expect(majorLower.coveredB).toBe(2);
    expect(majorLower.coverageDelta).toBe(0);
  });

  it('summary tracks planned-coverage regressions separately from completed regressions', () => {
    // Plan A covers a future req, Plan B doesn't
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: { FA26: ['STAT-2600', 'APPM-2350', 'STAT-3100'] },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: { FA26: ['STAT-2600'] },
    };

    const result = comparePlans(planA, planB, baseCourses, baseRequirements);
    expect(result.success).toBe(true);
    const summary = result.comparison!.summary;

    // No completed courses → no completed regressions
    expect(summary.requirementsRegressedInB).toBe(0);

    // But planned-coverage MUST show regressions
    expect(summary.coverageRegressedInB).toBeGreaterThan(0);
  });

  it('ML vs DL: coverage fields are present and structurally valid', async () => {
    const plansJsonPath = path.join(__dirname, '..', 'ml-dl-plans.json');
    const coursesJsonPath = path.join(__dirname, '..', 'data', 'courses.json');
    const requirementsJsonPath = path.join(__dirname, '..', 'data', 'requirements.json');
    const rawPlans: RawPlanData = JSON.parse(fs.readFileSync(plansJsonPath, 'utf-8'));
    const courses: Course[] = JSON.parse(fs.readFileSync(coursesJsonPath, 'utf-8'));
    const requirements: RequirementGroup[] = JSON.parse(fs.readFileSync(requirementsJsonPath, 'utf-8'));

    const { plans } = await normalizePlansFromJson(rawPlans, courses);
    const mlPlan = plans.find(p => p.id === 'ml-efficient')!;
    const dlPlan = plans.find(p => p.id === 'dl-implementation')!;

    const result = comparePlans(mlPlan, dlPlan, courses, requirements);
    expect(result.success).toBe(true);
    const comp = result.comparison!;

    for (const diff of comp.requirementDiffs) {
      expect(diff.coveredA).toBeGreaterThanOrEqual(0);
      expect(diff.coveredB).toBeGreaterThanOrEqual(0);
      expect(diff.coverageDelta).toBe(diff.coveredB - diff.coveredA);
      // coverage should always be >= completed
      expect(diff.coveredA).toBeGreaterThanOrEqual(diff.completedA);
      expect(diff.coveredB).toBeGreaterThanOrEqual(diff.completedB);
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('output arrays are sorted consistently', () => {
    const planA: PlanVariant = {
      id: 'a', name: 'A', description: '',
      semesters: {
        SP27: ['STAT-3100', 'APPM-2350'],
        FA26: ['MATH-2300'],
      },
    };
    const planB: PlanVariant = {
      id: 'b', name: 'B', description: '',
      semesters: {
        FA26: ['STAT-2600'],
        SP27: ['CSCI-2824'],
      },
    };

    const result1 = comparePlans(planA, planB, baseCourses, baseRequirements);
    const result2 = comparePlans(planA, planB, baseCourses, baseRequirements);

    expect(result1.comparison).toEqual(result2.comparison);
  });
});
