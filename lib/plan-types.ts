/**
 * Plan-State Type Definitions
 * 
 * Canonical representation for plan variants and comparison.
 * Source of truth: semester assignment map (semesters -> course IDs)
 * No shadow representations - single authoritative data structure.
 */

/**
 * A complete plan variant with course assignments across semesters.
 * The semester assignment map is the single source of truth.
 */
export interface PlanVariant {
  /** Unique identifier for this plan variant */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description of this plan's focus/approach */
  description: string;
  
  /** Source of truth: semester ID -> array of course IDs */
  semesters: Record<string, string[]>;
  
  /** Optional metadata for plan categorization */
  focus?: string;
  
  /** Optional metadata about plan characteristics */
  metadata?: Record<string, unknown>;
}

/**
 * Normalized plan for internal comparison processing.
 * All semester IDs and course IDs are in canonical format.
 */
export interface NormalizedPlan {
  /** Original plan variant */
  original: PlanVariant;
  
  /** Normalized semester assignments (canonical IDs) */
  semesters: Record<string, string[]>;
  
  /** Flat list of all courses in canonical format */
  allCourses: string[];
  
  /** Total credit hours (calculated) */
  totalCredits: number;
  
  /** Semester credit distribution */
  creditsBysemester: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Comparison type aliases
// ---------------------------------------------------------------------------

export type SemesterId = string;
export type CourseId = string;
export type PlanId = string;
export type RiskLevel = 'ok' | 'warning' | 'blocked';

/**
 * Course-level differences between two plans.
 * Uses onlyInA/onlyInB instead of added/removed for symmetric clarity.
 */
export interface CourseDiffs {
  /** Courses in plan A but not plan B */
  onlyInA: CourseId[];
  
  /** Courses in plan B but not plan A */
  onlyInB: CourseId[];
  
  /** Courses present in both but assigned to different semesters */
  moved: MovedCourse[];
  
  /** Courses in both plans in the same semester */
  unchanged: CourseId[];
}

export interface MovedCourse {
  courseId: CourseId;
  fromSemester: SemesterId; // semester in plan A
  toSemester: SemesterId;   // semester in plan B
}

/**
 * Semester-level differences between two plans.
 * Covers the union of all semesters from both plans.
 */
export interface SemesterDiff {
  semesterId: SemesterId;
  creditsA: number;
  creditsB: number;
  creditDelta: number;  // creditsB - creditsA
  coursesOnlyInA: CourseId[];
  coursesOnlyInB: CourseId[];
}

/**
 * Requirement group coverage differences between two plans.
 */
export interface RequirementDiff {
  groupId: string;
  groupName: string;
  completedA: number;
  completedB: number;
  total: number;
  delta: number;  // completedB - completedA
  /** Coverage including planned courses (completed + inProgress + planned) */
  coveredA: number;
  coveredB: number;
  coverageDelta: number;  // coveredB - coveredA
}

/**
 * Prerequisite risk per-course between two plans.
 */
export interface PrereqRiskDiff {
  courseId: CourseId;
  semesterA?: SemesterId;
  semesterB?: SemesterId;
  riskInA: RiskLevel;
  riskInB: RiskLevel;
  changed: boolean;
  reason?: string;
}

/**
 * Concise plan summary embedded in comparison results.
 */
export interface PlanComparisonPlanSummary {
  id: PlanId;
  name: string;
  description: string;
  semesterCount: number;
  totalCourses: number;
  totalCredits: number;
  maxSemesterCredits: number;
}

/**
 * Aggregate summary counts derived from comparison dimensions.
 */
export interface ComparisonSummary {
  movedCourseCount: number;
  coursesOnlyInACount: number;
  coursesOnlyInBCount: number;
  semestersWithChanges: number;
  requirementsImprovedInB: number;
  requirementsRegressedInB: number;
  /** Requirement coverage regressions including planned courses */
  coverageImprovedInB: number;
  coverageRegressedInB: number;
  prereqRisksAddedInB: number;
  prereqRisksRemovedInB: number;
  totalCreditsA: number;
  totalCreditsB: number;
  maxSemesterCreditsA: number;
  maxSemesterCreditsB: number;
}

/**
 * Complete comparison result between two plan variants.
 */
export interface PlanComparison {
  planA: PlanComparisonPlanSummary;
  planB: PlanComparisonPlanSummary;
  courseDiffs: CourseDiffs;
  semesterDiffs: SemesterDiff[];
  requirementDiffs: RequirementDiff[];
  prereqRiskDiffs: PrereqRiskDiff[];
  summary: ComparisonSummary;
}

/**
 * Top-level comparison result with validation gating.
 */
export interface PlanComparisonResult {
  success: boolean;
  comparison?: PlanComparison;
  issues: PlanValidationIssue[];
}

/**
 * Result of plan normalization process
 */
export interface PlanNormalizationResult {
  /** Successfully normalized plan */
  normalizedPlan?: NormalizedPlan;
  
  /** Validation and normalization issues */
  issues: PlanValidationIssue[];
  
  /** Whether normalization was successful */
  success: boolean;
}

/**
 * Individual validation or normalization issue
 */
export interface PlanValidationIssue {
  /** Issue severity level */
  type: 'error' | 'warning' | 'info';
  
  /** Machine-readable issue code */
  code: string;
  
  /** Human-readable message */
  message: string;
  
  /** Context information (semester, course, etc.) */
  context?: {
    semester?: string;
    course?: string;
    field?: string;
    value?: string;
  };
}

/**
 * Configuration for plan comparison
 */
export interface PlanComparisonConfig {
  /** Whether to include requirement analysis */
  includeRequirements: boolean;
  
  /** Whether to include prerequisite analysis */
  includePrereqs: boolean;
  
  /** Semester normalization rules */
  semesterNormalization: {
    /** Expected semester ID format (e.g., "FA26", "SP27") */
    format: 'canonical' | 'flexible';
  };
  
  /** Course ID normalization rules */
  courseNormalization: {
    /** Whether to normalize course ID format */
    normalize: boolean;
    
    /** Whether to validate against course catalog */
    validateExists: boolean;
  };
}

/**
 * Raw plan data as loaded from external sources
 * Note: totalCredits and semester credits are ignored if present - credits are derived only
 */
// ---------------------------------------------------------------------------
// Optimization signal types (P3-B)
// ---------------------------------------------------------------------------

/**
 * A discrete, explainable optimization signal.
 *
 * Signals are factual observations about a plan — never recommendations.
 * Each kind maps to a specific analysis primitive.
 */
export type OptimizationSignal = {
  /** Unique signal identifier (e.g. "semester_load:FA26:overload") */
  id: string;

  /** Signal kind — determines which analysis produced it */
  kind:
    | 'semester_load'
    | 'prereq_bottleneck'
    | 'delayed_critical_course'
    | 'graduation_risk';

  /** Severity level */
  severity: 'info' | 'warning' | 'risk';

  /** What the signal applies to */
  scope:
    | { type: 'semester'; term: string }
    | { type: 'course'; courseId: string }
    | { type: 'plan' };

  /** Human-readable factual description — no recommendations */
  message: string;

  /** Structured evidence backing the signal */
  evidence: Record<string, unknown>;
};

export interface RawPlanData {
  plans: Record<string, {
    name: string;
    description: string;
    focus?: string;
    totalCredits?: number; // Ignored - credits derived from course data
    semesters: Record<string, {
      courses: string[];
      credits?: number; // Ignored - credits derived from course data
    }>;
  }>;
  
  /** Optional metadata about courses */
  courseMetadata?: Record<string, unknown>;
  
  /** Optional comparison metadata */
  pathComparison?: Record<string, unknown>;
}