/**
 * Plan-State Design Tests
 * 
 * Comprehensive test suite covering:
 * - Plan normalization from JSON
 * - Semester ID normalization
 * - Course ID normalization  
 * - Duplicate course detection
 * - Unknown course validation
 * - Edge cases and error handling
 */

import {
  normalizeSemesterId,
  normalizeCourseId,
  normalizePlansFromJson,
  computeDerivedPlanData,
  validatePlansForComparison,
} from '../lib/plan-normalization';
import {
  PlanVariant,
  RawPlanData,
  PlanComparisonConfig,
} from '../lib/plan-types';
import { Course } from '../lib/types';

// Mock course data for testing
const mockCourses: Course[] = [
  {
    id: 'MATH-2300',
    number: 'MATH 2300',
    name: 'Calculus III',
    credits: 4,
    status: 'not_started',
    prereqs: null,
    coreqs: null,
  },
  {
    id: 'CSCI-2824',
    number: 'CSCI 2824', 
    name: 'Discrete Structures',
    credits: 3,
    status: 'not_started',
    prereqs: null,
    coreqs: null,
  },
  {
    id: 'STAT-2600',
    number: 'STAT 2600',
    name: 'Introduction to Statistical Methods',
    credits: 3,
    status: 'not_started',
    prereqs: null,
    coreqs: null,
  },
  {
    id: 'APPM-1650',
    number: 'APPM 1650',
    name: 'Calculus for Engineers II',
    credits: 4,
    status: 'not_started',
    prereqs: null,
    coreqs: null,
  },
];

describe('Semester ID Normalization', () => {
  test('canonical format passes through unchanged', () => {
    expect(normalizeSemesterId('FA26')).toBe('FA26');
    expect(normalizeSemesterId('SP27')).toBe('SP27');
    expect(normalizeSemesterId('SU27')).toBe('SU27');
  });
  
  test('long format normalizes correctly', () => {
    expect(normalizeSemesterId('Fall 2026')).toBe('FA26');
    expect(normalizeSemesterId('Spring 2027')).toBe('SP27');
    expect(normalizeSemesterId('Summer 2027')).toBe('SU27');
  });
  
  test('underscore format normalizes correctly', () => {
    expect(normalizeSemesterId('fall_2026')).toBe('FA26');
    expect(normalizeSemesterId('spring_2027')).toBe('SP27');
    expect(normalizeSemesterId('summer_2027')).toBe('SU27');
  });
  
  test('short format normalizes correctly', () => {
    expect(normalizeSemesterId('F26')).toBe('FA26');
    expect(normalizeSemesterId('S27')).toBe('SP27');
  });
  
  test('year-first format normalizes correctly', () => {
    expect(normalizeSemesterId('2026-fall')).toBe('FA26');
    expect(normalizeSemesterId('2027-spring')).toBe('SP27');
    expect(normalizeSemesterId('2027-summer')).toBe('SU27');
  });
  
  test('case insensitive normalization', () => {
    expect(normalizeSemesterId('FALL 2026')).toBe('FA26');
    expect(normalizeSemesterId('fall 2026')).toBe('FA26');
    expect(normalizeSemesterId('Fall 2026')).toBe('FA26');
  });
  
  test('invalid formats throw errors', () => {
    expect(() => normalizeSemesterId('invalid')).toThrow();
    expect(() => normalizeSemesterId('26F')).toThrow();
    expect(() => normalizeSemesterId('Fall')).toThrow();
    expect(() => normalizeSemesterId('2026')).toThrow();
  });
});

describe('Course ID Normalization', () => {
  test('canonical format passes through unchanged', () => {
    expect(normalizeCourseId('MATH-2300')).toBe('MATH-2300');
    expect(normalizeCourseId('CSCI-2824')).toBe('CSCI-2824');
  });
  
  test('space format normalizes correctly', () => {
    expect(normalizeCourseId('MATH 2300')).toBe('MATH-2300');
    expect(normalizeCourseId('CSCI 2824')).toBe('CSCI-2824');
  });
  
  test('compact format normalizes correctly', () => {
    expect(normalizeCourseId('MATH2300')).toBe('MATH-2300');
    expect(normalizeCourseId('CSCI2824')).toBe('CSCI-2824');
  });
  
  test('case normalization', () => {
    expect(normalizeCourseId('math 2300')).toBe('MATH-2300');
    expect(normalizeCourseId('csci 2824')).toBe('CSCI-2824');
  });
  
  test('invalid formats throw errors', () => {
    expect(() => normalizeCourseId('invalid')).toThrow();
    expect(() => normalizeCourseId('MATH')).toThrow();
    expect(() => normalizeCourseId('2300')).toThrow();
    expect(() => normalizeCourseId('MATH-2300-extra')).toThrow();
  });
});

describe('Plan Normalization from JSON', () => {
  const validRawData: RawPlanData = {
    plans: {
      'test-plan': {
        name: 'Test Plan',
        description: 'A test plan',
        focus: 'testing',
        totalCredits: 14,
        semesters: {
          'Fall 2026': {
            courses: ['MATH 2300', 'CSCI 2824'],
            credits: 7,
          },
          'Spring 2027': {
            courses: ['STAT 2600', 'APPM 1650'],
            credits: 7,
          },
        },
      },
    },
  };
  
  test('valid plan JSON loads cleanly', async () => {
    const result = await normalizePlansFromJson(validRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    
    // Should have warnings about ignoring stored credits
    const storedCreditWarnings = result.issues.filter(issue => issue.code === 'IGNORED_STORED_CREDITS');
    expect(storedCreditWarnings).toHaveLength(3); // 1 totalCredits + 2 semester credits
    
    const plan = result.plans[0];
    expect(plan.id).toBe('test-plan');
    expect(plan.name).toBe('Test Plan');
    expect(plan.semesters['FA26']).toEqual(['MATH-2300', 'CSCI-2824']);
    expect(plan.semesters['SP27']).toEqual(['STAT-2600', 'APPM-1650']);
  });
  
  test('duplicate course assignment is rejected', async () => {
    const duplicateRawData: RawPlanData = {
      plans: {
        'duplicate-plan': {
          name: 'Duplicate Plan',
          description: 'Plan with duplicate courses',
          semesters: {
            'Fall 2026': {
              courses: ['MATH 2300', 'CSCI 2824'],
            },
            'Spring 2027': {
              courses: ['MATH 2300', 'STAT 2600'], // MATH 2300 appears twice
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(duplicateRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const duplicateErrors = result.issues.filter(issue => issue.code === 'DUPLICATE_COURSE');
    expect(duplicateErrors).toHaveLength(1);
    expect(duplicateErrors[0].context?.course).toBe('MATH-2300');
  });
  
  test('unknown course ID is surfaced as error', async () => {
    const unknownCourseRawData: RawPlanData = {
      plans: {
        'unknown-course-plan': {
          name: 'Unknown Course Plan',
          description: 'Plan with unknown courses',
          semesters: {
            'Fall 2026': {
              courses: ['MATH 2300', 'UNKN 9999'], // UNKN 9999 does not exist
            },
          },
        },
      },
    };
    
    const config: Partial<PlanComparisonConfig> = {
      courseNormalization: {
        normalize: true,
        validateExists: true,
      },
    };
    
    const result = await normalizePlansFromJson(unknownCourseRawData, mockCourses, config);
    
    expect(result.plans).toHaveLength(1);
    const unknownErrors = result.issues.filter(issue => issue.code === 'UNKNOWN_COURSE');
    expect(unknownErrors).toHaveLength(1);
    expect(unknownErrors[0].context?.course).toBe('UNKN-9999');
  });
  
  test('invalid semester ID is handled gracefully', async () => {
    const invalidSemesterRawData: RawPlanData = {
      plans: {
        'invalid-semester-plan': {
          name: 'Invalid Semester Plan',
          description: 'Plan with invalid semester',
          semesters: {
            'invalid-semester': {
              courses: ['MATH 2300'],
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(invalidSemesterRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const semesterErrors = result.issues.filter(issue => issue.code === 'INVALID_SEMESTER_ID');
    expect(semesterErrors).toHaveLength(1);
  });
  
  test('invalid course ID is handled gracefully', async () => {
    const invalidCourseRawData: RawPlanData = {
      plans: {
        'invalid-course-plan': {
          name: 'Invalid Course Plan',
          description: 'Plan with invalid course ID',
          semesters: {
            'Fall 2026': {
              courses: ['invalid-course-id'],
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(invalidCourseRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const courseErrors = result.issues.filter(issue => issue.code === 'INVALID_COURSE_ID');
    expect(courseErrors).toHaveLength(1);
  });
  
  test('semester collision detection prevents data loss', async () => {
    const collisionRawData: RawPlanData = {
      plans: {
        'collision-plan': {
          name: 'Collision Plan',
          description: 'Plan with semester collision',
          semesters: {
            'FA26': {
              courses: ['MATH-2300'], // First semester with canonical FA26
            },
            'Fall 2026': {
              courses: ['CSCI-2824'], // Second semester that normalizes to FA26
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(collisionRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const collisionErrors = result.issues.filter(issue => issue.code === 'SEMESTER_COLLISION');
    expect(collisionErrors).toHaveLength(1);
    expect(collisionErrors[0].message).toContain('Fall 2026');
    expect(collisionErrors[0].message).toContain('FA26');
    
    // Verify MATH-2300 from first semester is preserved, CSCI-2824 should be dropped due to collision
    const plan = result.plans[0];
    expect(plan.semesters['FA26']).toEqual(['MATH-2300']);
  });
  
  test('stored credits are ignored with warnings', async () => {
    const storedCreditsRawData: RawPlanData = {
      plans: {
        'stored-credits-plan': {
          name: 'Stored Credits Plan',
          description: 'Plan with stored credit fields',
          totalCredits: 999, // Should be ignored
          semesters: {
            'FA26': {
              courses: ['MATH-2300'],
              credits: 888, // Should be ignored
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(storedCreditsRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const creditWarnings = result.issues.filter(issue => issue.code === 'IGNORED_STORED_CREDITS');
    expect(creditWarnings).toHaveLength(2); // One for totalCredits, one for semester credits
    expect(creditWarnings[0].message).toContain('999');
    expect(creditWarnings[1].message).toContain('888');
  });
  
  test('strict course validation is enabled by default', async () => {
    const unknownCourseRawData: RawPlanData = {
      plans: {
        'unknown-course-plan': {
          name: 'Unknown Course Plan',
          description: 'Plan with unknown courses (no explicit config)',
          semesters: {
            'Fall 2026': {
              courses: ['CSCI-2400', 'CSCI-3155'], // These don't exist in mockCourses
            },
          },
        },
      },
    };
    
    // Call WITHOUT explicit config - should default to strict validation
    const result = await normalizePlansFromJson(unknownCourseRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    const unknownErrors = result.issues.filter(issue => issue.code === 'UNKNOWN_COURSE');
    expect(unknownErrors).toHaveLength(2); // Both CSCI-2400 and CSCI-3155 should be errors
    expect(unknownErrors[0].type).toBe('error');
    expect(unknownErrors[1].type).toBe('error');
  });
});

describe('Single Plan Derived Data Computation', () => {
  test('plan derived data calculation works correctly', () => {
    const plan: PlanVariant = {
      id: 'test-plan',
      name: 'Test Plan',
      description: 'A test plan',
      semesters: {
        'FA26': ['MATH-2300', 'CSCI-2824'], // 4 + 3 = 7 credits
        'SP27': ['STAT-2600', 'APPM-1650'], // 3 + 4 = 7 credits
      },
    };
    
    const result = computeDerivedPlanData(plan, mockCourses);
    
    expect(result.success).toBe(true);
    expect(result.normalizedPlan).toBeDefined();
    
    const normalized = result.normalizedPlan!;
    expect(normalized.totalCredits).toBe(14);
    expect(normalized.creditsBysemester['FA26']).toBe(7);
    expect(normalized.creditsBysemester['SP27']).toBe(7);
    expect(normalized.allCourses).toEqual(['MATH-2300', 'CSCI-2824', 'STAT-2600', 'APPM-1650']);
  });
  
  test('missing course data generates errors', () => {
    const plan: PlanVariant = {
      id: 'test-plan',
      name: 'Test Plan',
      description: 'A test plan',
      semesters: {
        'FA26': ['MATH-2300', 'UNKN-9999'], // UNKN-9999 not in mock data
      },
    };
    
    const result = computeDerivedPlanData(plan, mockCourses);
    
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('COURSE_NOT_FOUND');
    expect(result.issues[0].type).toBe('error');
  });
  
  test('NormalizedPlan is immutable - mutations do not affect normalized output', () => {
    const plan: PlanVariant = {
      id: 'test-plan',
      name: 'Test Plan',
      description: 'A test plan',
      semesters: {
        'FA26': ['MATH-2300', 'CSCI-2824'],
        'SP27': ['STAT-2600'],
      },
    };
    
    const result = computeDerivedPlanData(plan, mockCourses);
    expect(result.success).toBe(true);
    expect(result.normalizedPlan).toBeDefined();
    
    const normalized = result.normalizedPlan!;
    
    // Store original state
    const originalFA26 = [...normalized.semesters['FA26']];
    const originalSP27 = [...normalized.semesters['SP27']];
    
    // Mutate the original plan
    plan.semesters['FA26'].push('APPM-1650');
    plan.semesters['SP27'] = ['DIFFERENT-COURSE'];
    plan.semesters['NEW-SEMESTER'] = ['NEW-COURSE'];
    
    // Verify normalized plan is unaffected
    expect(normalized.semesters['FA26']).toEqual(originalFA26);
    expect(normalized.semesters['SP27']).toEqual(originalSP27);
    expect(normalized.semesters['NEW-SEMESTER']).toBeUndefined();
  });
});

describe('Plan Comparison Validation', () => {
  test('valid plans pass comparison validation', () => {
    const planA: PlanVariant = {
      id: 'plan-a',
      name: 'Plan A',
      description: 'First plan',
      semesters: {
        'FA26': ['MATH-2300', 'CSCI-2824'],
        'SP27': ['STAT-2600'],
      },
    };
    
    const planB: PlanVariant = {
      id: 'plan-b',
      name: 'Plan B',
      description: 'Second plan',
      semesters: {
        'FA26': ['MATH-2300', 'APPM-1650'],
        'SP27': ['CSCI-2824'],
      },
    };
    
    const issues = validatePlansForComparison(planA, planB);
    
    // Should have no errors, maybe some info about differences
    const errors = issues.filter(i => i.type === 'error');
    expect(errors).toHaveLength(0);
  });
  
  test('empty plans generate errors', () => {
    const emptyPlan: PlanVariant = {
      id: 'empty-plan',
      name: 'Empty Plan',
      description: 'Plan with no semesters',
      semesters: {},
    };
    
    const normalPlan: PlanVariant = {
      id: 'normal-plan',
      name: 'Normal Plan',
      description: 'Plan with courses',
      semesters: {
        'FA26': ['MATH-2300'],
      },
    };
    
    const issues = validatePlansForComparison(emptyPlan, normalPlan);
    
    const emptyErrors = issues.filter(i => i.code === 'EMPTY_PLAN');
    expect(emptyErrors).toHaveLength(1);
  });
  
  test('plans with no semester overlap generate warnings', () => {
    const planA: PlanVariant = {
      id: 'plan-a',
      name: 'Plan A',
      description: 'Early plan',
      semesters: {
        'FA26': ['MATH-2300'],
        'SP27': ['CSCI-2824'],
      },
    };
    
    const planB: PlanVariant = {
      id: 'plan-b',
      name: 'Plan B',
      description: 'Later plan',
      semesters: {
        'FA28': ['STAT-2600'],
        'SP29': ['APPM-1650'],
      },
    };
    
    const issues = validatePlansForComparison(planA, planB);
    
    const overlapWarnings = issues.filter(i => i.code === 'NO_SEMESTER_OVERLAP');
    expect(overlapWarnings).toHaveLength(1);
    expect(overlapWarnings[0].type).toBe('warning');
  });
  
  test('plans with no course overlap generate info messages', () => {
    const planA: PlanVariant = {
      id: 'plan-a',
      name: 'Plan A',
      description: 'Math plan',
      semesters: {
        'FA26': ['MATH-2300'],
      },
    };
    
    const planB: PlanVariant = {
      id: 'plan-b',
      name: 'Plan B',
      description: 'CS plan',
      semesters: {
        'FA26': ['CSCI-2824'],
      },
    };
    
    const issues = validatePlansForComparison(planA, planB);
    
    const courseOverlapInfo = issues.filter(i => i.code === 'NO_COURSE_OVERLAP');
    expect(courseOverlapInfo).toHaveLength(1);
    expect(courseOverlapInfo[0].type).toBe('info');
  });
});

describe('Edge Cases', () => {
  test('plan with empty semester is handled', async () => {
    const emptySemesterRawData: RawPlanData = {
      plans: {
        'empty-semester-plan': {
          name: 'Empty Semester Plan',
          description: 'Plan with empty semester',
          semesters: {
            'Fall 2026': {
              courses: [],
            },
            'Spring 2027': {
              courses: ['MATH 2300'],
            },
          },
        },
      },
    };
    
    const result = await normalizePlansFromJson(emptySemesterRawData, mockCourses);
    
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].semesters['FA26']).toEqual([]);
    expect(result.plans[0].semesters['SP27']).toEqual(['MATH-2300']);
  });
  
  test('malformed JSON structure is handled gracefully', async () => {
    const malformedRawData: any = {
      plans: {
        'malformed-plan': {
          name: 'Malformed Plan',
          // Missing description and semesters
        },
      },
    };
    
    const result = await normalizePlansFromJson(malformedRawData, mockCourses);
    
    // Should have errors but not crash
    const errors = result.issues.filter(i => i.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });
  
  test('two equivalent plans normalize to comparable structures', async () => {
    const rawDataA: RawPlanData = {
      plans: {
        'plan-a': {
          name: 'Plan A',
          description: 'First representation',
          semesters: {
            'Fall 2026': {
              courses: ['MATH 2300', 'CSCI 2824'],
            },
          },
        },
      },
    };
    
    const rawDataB: RawPlanData = {
      plans: {
        'plan-b': {
          name: 'Plan B',
          description: 'Second representation',
          semesters: {
            'FA26': {
              courses: ['MATH-2300', 'CSCI-2824'], // Same courses, already normalized
            },
          },
        },
      },
    };
    
    const resultA = await normalizePlansFromJson(rawDataA, mockCourses);
    const resultB = await normalizePlansFromJson(rawDataB, mockCourses);
    
    expect(resultA.plans[0].semesters['FA26']).toEqual(resultB.plans[0].semesters['FA26']);
  });
});