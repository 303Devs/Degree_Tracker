/**
 * Plan Normalization Logic
 * 
 * Loads raw plan data and normalizes it to canonical format:
 * - Semester IDs: FA26, SP27, SU27, etc.
 * - Course IDs: Match existing course dataset format
 * - Validation: Check for duplicates, unknown courses, malformed data
 * 
 * Source of truth: semester assignment map
 * No shadow representations created.
 */

import {
  PlanVariant,
  NormalizedPlan,
  PlanNormalizationResult,
  PlanValidationIssue,
  RawPlanData,
  PlanComparisonConfig,
} from './plan-types';
import { Course } from './types';

/**
 * Semester ID normalization rules.
 * 
 * Canonical format: 
 * - FA26 (Fall 2026)
 * - SP27 (Spring 2027)  
 * - SU27 (Summer 2027)
 * 
 * Input formats supported:
 * - "Fall 2026" -> "FA26"
 * - "fall_2026" -> "FA26" 
 * - "F26" -> "FA26"
 * - "FA26" -> "FA26" (already canonical)
 * - "2026-fall" -> "FA26"
 */
export function normalizeSemesterId(input: string): string {
  const cleaned = input.trim().toLowerCase();
  
  // Already canonical format (FA26, SP27, SU27)
  if (/^(fa|sp|su)\d{2}$/i.test(input.trim())) {
    return input.trim().toUpperCase();
  }
  
  // Extract year and semester from various formats
  let year: number | undefined;
  let semester: string | undefined;
  
  // Format: "Fall 2026", "Spring 2027"
  const longFormat = cleaned.match(/^(fall|spring|summer)\s+(\d{4})$/);
  if (longFormat) {
    semester = longFormat[1];
    year = parseInt(longFormat[2]);
  }
  
  // Format: "fall_2026", "spring_2027"  
  const underscoreFormat = cleaned.match(/^(fall|spring|summer)_(\d{4})$/);
  if (underscoreFormat) {
    semester = underscoreFormat[1];
    year = parseInt(underscoreFormat[2]);
  }
  
  // Format: "F26", "S27"
  const shortFormat = cleaned.match(/^([fs])(\d{2})$/);
  if (shortFormat) {
    const semesterCode = shortFormat[1];
    semester = semesterCode === 'f' ? 'fall' : 'spring';
    year = 2000 + parseInt(shortFormat[2]);
  }
  
  // Format: "2026-fall", "2027-spring"
  const yearFirstFormat = cleaned.match(/^(\d{4})-(fall|spring|summer)$/);
  if (yearFirstFormat) {
    year = parseInt(yearFirstFormat[1]);
    semester = yearFirstFormat[2];
  }
  
  if (!year || !semester) {
    throw new Error(`Unable to parse semester ID: ${input}`);
  }
  
  // Convert to canonical format
  const yearSuffix = (year % 100).toString().padStart(2, '0');
  
  switch (semester) {
    case 'fall':
      return `FA${yearSuffix}`;
    case 'spring':
      return `SP${yearSuffix}`;
    case 'summer':
      return `SU${yearSuffix}`;
    default:
      throw new Error(`Unknown semester: ${semester}`);
  }
}

/**
 * Course ID normalization rules.
 * 
 * Canonical format: "DEPT-NNNN" (e.g., "MATH-2300", "CSCI-1300")
 * 
 * Input formats supported:
 * - "MATH 2300" -> "MATH-2300"
 * - "MATH2300" -> "MATH-2300" 
 * - "MATH-2300" -> "MATH-2300" (already canonical)
 * - "math 2300" -> "MATH-2300" (case normalization)
 */
export function normalizeCourseId(input: string): string {
  const cleaned = input.trim().toUpperCase();
  
  // Already canonical format
  if (/^[A-Z]{4}-\d{4}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Format: "MATH 2300", "CSCI 1300"
  const spaceFormat = cleaned.match(/^([A-Z]{4})\s+(\d{4})$/);
  if (spaceFormat) {
    return `${spaceFormat[1]}-${spaceFormat[2]}`;
  }
  
  // Format: "MATH2300", "CSCI1300"
  const compactFormat = cleaned.match(/^([A-Z]{4})(\d{4})$/);
  if (compactFormat) {
    return `${compactFormat[1]}-${compactFormat[2]}`;
  }
  
  throw new Error(`Unable to parse course ID: ${input}`);
}

/**
 * Load and normalize plan variants from raw JSON data.
 * 
 * Validation rules:
 * - No duplicate course assignments within a plan
 * - All course IDs must be valid and known
 * - Semester IDs must be parseable
 * - Plan structure must be complete
 */
export async function normalizePlansFromJson(
  jsonData: RawPlanData,
  existingCourses: Course[],
  config: Partial<PlanComparisonConfig> = {}
): Promise<{ plans: PlanVariant[]; issues: PlanValidationIssue[] }> {
  // Default to strict validation - validateExists MUST be true by default
  const defaultConfig = {
    courseNormalization: {
      normalize: true,
      validateExists: true,
    },
  };
  const mergedConfig = { ...defaultConfig, ...config };
  if (config.courseNormalization) {
    mergedConfig.courseNormalization = { ...defaultConfig.courseNormalization, ...config.courseNormalization };
  }
  const issues: PlanValidationIssue[] = [];
  const plans: PlanVariant[] = [];
  
  const courseIdSet = new Set(existingCourses.map(c => c.id));
  
  for (const [planId, rawPlan] of Object.entries(jsonData.plans)) {
    try {
      // Ignore stored credit fields - credits must be derived only
      if ('totalCredits' in rawPlan) {
        issues.push({
          type: 'warning',
          code: 'IGNORED_STORED_CREDITS',
          message: `Ignoring stored totalCredits (${rawPlan.totalCredits}) in plan ${planId} - credits will be derived from course data`,
          context: { value: String(rawPlan.totalCredits) }
        });
      }
      
      // Create plan variant with normalized data
      const normalizedSemesters: Record<string, string[]> = {};
      const seenCourses = new Set<string>();
      const semesterMapping = new Map<string, string>(); // Track raw -> canonical mapping
      
      for (const [semesterId, semesterData] of Object.entries(rawPlan.semesters)) {
        // Ignore stored semester credit fields
        if ('credits' in semesterData) {
          issues.push({
            type: 'warning',
            code: 'IGNORED_STORED_CREDITS',
            message: `Ignoring stored semester credits (${semesterData.credits}) in ${planId}/${semesterId} - credits will be derived from course data`,
            context: { semester: semesterId, value: String(semesterData.credits) }
          });
        }
        // Normalize semester ID
        let normalizedSemesterId: string;
        try {
          normalizedSemesterId = normalizeSemesterId(semesterId);
        } catch (error) {
          issues.push({
            type: 'error',
            code: 'INVALID_SEMESTER_ID',
            message: `Invalid semester ID in plan ${planId}: ${semesterId}`,
            context: { semester: semesterId, value: semesterId }
          });
          continue;
        }
        
        // Check for semester collision (two raw keys normalize to same canonical)
        if (semesterMapping.has(normalizedSemesterId)) {
          const existingRawSemester = semesterMapping.get(normalizedSemesterId);
          issues.push({
            type: 'error',
            code: 'SEMESTER_COLLISION',
            message: `Semester collision in plan ${planId}: both "${existingRawSemester}" and "${semesterId}" normalize to "${normalizedSemesterId}"`,
            context: { semester: semesterId, value: normalizedSemesterId }
          });
          continue;
        }
        semesterMapping.set(normalizedSemesterId, semesterId);
        
        // Normalize course IDs
        const normalizedCourses: string[] = [];
        
        for (const courseId of semesterData.courses) {
          // Normalize course ID
          let normalizedCourseId: string;
          try {
            normalizedCourseId = normalizeCourseId(courseId);
          } catch (error) {
            issues.push({
              type: 'error',
              code: 'INVALID_COURSE_ID',
              message: `Invalid course ID in plan ${planId}: ${courseId}`,
              context: { course: courseId, semester: semesterId, value: courseId }
            });
            continue;
          }
          
          // Check for duplicates within plan
          if (seenCourses.has(normalizedCourseId)) {
            issues.push({
              type: 'error',
              code: 'DUPLICATE_COURSE',
              message: `Duplicate course assignment in plan ${planId}: ${normalizedCourseId}`,
              context: { course: normalizedCourseId, semester: normalizedSemesterId }
            });
            continue;
          }
          
          // Check if course exists in dataset
          if (mergedConfig.courseNormalization?.validateExists && !courseIdSet.has(normalizedCourseId)) {
            issues.push({
              type: 'error',
              code: 'UNKNOWN_COURSE',
              message: `Unknown course in plan ${planId}: ${normalizedCourseId}`,
              context: { course: normalizedCourseId, semester: normalizedSemesterId }
            });
            // Continue processing - unknown courses are errors but don't block normalization
          }
          
          seenCourses.add(normalizedCourseId);
          normalizedCourses.push(normalizedCourseId);
        }
        
        normalizedSemesters[normalizedSemesterId] = normalizedCourses;
      }
      
      // Create normalized plan variant
      const planVariant: PlanVariant = {
        id: planId,
        name: rawPlan.name,
        description: rawPlan.description,
        semesters: normalizedSemesters,
        focus: rawPlan.focus,
      };
      
      plans.push(planVariant);
      
    } catch (error) {
      issues.push({
        type: 'error',
        code: 'PLAN_PROCESSING_ERROR',
        message: `Error processing plan ${planId}: ${error instanceof Error ? error.message : String(error)}`,
        context: { value: planId }
      });
    }
  }
  
  return { plans, issues };
}

/**
 * Compute derived data for a plan variant for comparison processing.
 * 
 * Computes derived data:
 * - Flat course list
 * - Total credits (calculated from course data)
 * - Credits by semester
 * 
 * Note: This assumes the plan is already normalized (canonical semester/course IDs).
 */
export function computeDerivedPlanData(
  plan: PlanVariant, 
  existingCourses: Course[]
): PlanNormalizationResult {
  const issues: PlanValidationIssue[] = [];
  
  try {
    // Create course lookup
    const courseMap = new Map(existingCourses.map(c => [c.id, c]));
    
    // Calculate derived data
    const allCourses: string[] = [];
    const creditsBysemester: Record<string, number> = {};
    let totalCredits = 0;
    
    for (const [semesterId, courseIds] of Object.entries(plan.semesters)) {
      let semesterCredits = 0;
      
      for (const courseId of courseIds) {
        allCourses.push(courseId);
        
        const course = courseMap.get(courseId);
        if (course) {
          semesterCredits += course.credits;
          totalCredits += course.credits;
        } else {
          issues.push({
            type: 'error',
            code: 'COURSE_NOT_FOUND',
            message: `Course ${courseId} not found in course dataset`,
            context: { course: courseId, semester: semesterId }
          });
        }
      }
      
      creditsBysemester[semesterId] = semesterCredits;
    }
    
    const normalizedPlan: NormalizedPlan = {
      original: plan,
      semesters: JSON.parse(JSON.stringify(plan.semesters)), // Deep copy to ensure immutability
      allCourses,
      totalCredits,
      creditsBysemester,
    };
    
    return {
      normalizedPlan,
      issues,
      success: true
    };
    
  } catch (error) {
    issues.push({
      type: 'error',
      code: 'NORMALIZATION_ERROR',
      message: `Error normalizing plan: ${error instanceof Error ? error.message : String(error)}`
    });
    
    return {
      issues,
      success: false
    };
  }
}

/**
 * Load plan variants from the ml-dl-plans.json file.
 * Applies all normalization and validation rules.
 */
export async function loadPlansFromFile(
  filePath: string,
  existingCourses: Course[],
  config: Partial<PlanComparisonConfig> = {}
): Promise<{ plans: PlanVariant[]; issues: PlanValidationIssue[] }> {
  try {
    // Dynamic import for file system operations
    const fs = await import('fs/promises');
    const rawData = await fs.readFile(filePath, 'utf-8');
    const jsonData: RawPlanData = JSON.parse(rawData);
    
    return await normalizePlansFromJson(jsonData, existingCourses, config);
    
  } catch (error) {
    const issues: PlanValidationIssue[] = [{
      type: 'error',
      code: 'FILE_LOAD_ERROR',
      message: `Error loading plans from file: ${error instanceof Error ? error.message : String(error)}`,
      context: { field: 'file', value: filePath }
    }];
    
    return { plans: [], issues };
  }
}

/**
 * Validate that two plans can be meaningfully compared.
 * 
 * Checks:
 * - Both plans are properly normalized
 * - Plans have overlapping semester ranges
 * - Plans have some courses in common or complementary differences
 */
export function validatePlansForComparison(
  planA: PlanVariant,
  planB: PlanVariant
): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  
  // Check for empty plans
  if (Object.keys(planA.semesters).length === 0) {
    issues.push({
      type: 'error',
      code: 'EMPTY_PLAN',
      message: `Plan A (${planA.name}) has no semesters`,
    });
  }
  
  if (Object.keys(planB.semesters).length === 0) {
    issues.push({
      type: 'error', 
      code: 'EMPTY_PLAN',
      message: `Plan B (${planB.name}) has no semesters`,
    });
  }
  
  // Check semester overlap
  const semestersA = new Set(Object.keys(planA.semesters));
  const semestersB = new Set(Object.keys(planB.semesters));
  const intersection = new Set([...semestersA].filter(s => semestersB.has(s)));
  
  if (intersection.size === 0) {
    issues.push({
      type: 'warning',
      code: 'NO_SEMESTER_OVERLAP', 
      message: 'Plans have no overlapping semesters',
    });
  }
  
  // Check course overlap
  const coursesA = new Set(Object.values(planA.semesters).flat());
  const coursesB = new Set(Object.values(planB.semesters).flat());
  const courseIntersection = new Set([...coursesA].filter(c => coursesB.has(c)));
  
  if (courseIntersection.size === 0 && coursesA.size > 0 && coursesB.size > 0) {
    issues.push({
      type: 'info',
      code: 'NO_COURSE_OVERLAP',
      message: 'Plans have no courses in common',
    });
  }
  
  return issues;
}