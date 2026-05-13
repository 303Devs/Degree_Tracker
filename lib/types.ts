export type CourseStatus = "not_started" | "planned" | "in_progress" | "registered" | "completed";

/** Where this course data originated. Used for merge conflict resolution. */
export type CourseSource = "audit" | "manual" | "catalog" | "stub" | "enriched";

export type PrereqRule =
  | { type: "course"; courseId: string }
  | { type: "and"; rules: PrereqRule[] }
  | { type: "or"; rules: PrereqRule[] };

export interface Course {
  id: string;           // e.g. "STAT-3100"
  number: string;       // e.g. "STAT 3100"
  name: string;
  description?: string;
  credits: number;
  prereqs: PrereqRule | null;
  coreqs: PrereqRule | null;
  status: CourseStatus;
  grade?: string;       // e.g. "A-", "B+"
  semester?: string;    // e.g. "FA26", "SP27"
  gradePoints?: number;
  notes?: string;
  countedTowardDegree?: boolean; // false = excluded from degree (grade replacement, etc.)
  countsTowardGPA?: boolean;     // false = excluded from GPA calculation (default true)
  countsTowardEarnedHours?: boolean; // false = excluded from earned hours (default true)
  excludeReason?: string;        // why this course doesn't count (e.g. "Grade replacement (>X >N)")
  manuallyAdded?: boolean;       // true if user created this course manually
  source?: CourseSource;          // where this course data came from
}

export type RequirementGroupType = "complete_all" | "pick_n" | "pick_one" | "minimum_hours";

export interface RequirementGroup {
  id: string;
  name: string;
  category: string;
  type: RequirementGroupType;
  required?: number;      // for pick_n: how many to choose
  requiredHours?: number; // for minimum_hours
  coursePool: string[];   // course IDs
  selectedCourses?: string[];
  notes?: string;
  minGrade?: string;      // e.g. "C-" — minimum passing grade for this requirement group
}

export interface Semester {
  id: string;     // e.g. "FA26"
  label: string;  // e.g. "Fall 2026"
  type: "fall" | "spring" | "summer";
  year: number;
  status: "completed" | "in_progress" | "registered" | "planned";
  courses: string[];
}

export interface ProgramInfo {
  studentName: string;
  studentId: string;
  programCode: string;
  degreeName: string;
  college: string;
  catalogYear: string;
  preparedDate: string;
  earnedHours: number;
  inProgressHours: number;
  gpa: number;
}

export interface AppData {
  courses: Course[];
  requirements: RequirementGroup[];
  semesters: Semester[];
  programs: ProgramInfo[];
}

export type EntityType = "course" | "requirement";
export type EntitySource = CourseSource | "system";

export interface AuditImport {
  id: string;
  fileName?: string;
  importedAt: string;
  parserVersion?: string;
  programInfoSnapshot?: ProgramInfo;
  rawWarnings: string[];
}

export interface EntityProvenance {
  source: EntitySource;
  auditImportId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FieldOverride {
  id: string;
  entityType: EntityType;
  entityId: string;
  field: string;
  value: unknown;
  baseValue?: unknown;
  baseSource: EntitySource;
  auditImportId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ManualEntity =
  | {
      id: string;
      entityType: "course";
      value: Course;
      provenance: EntityProvenance & { source: "manual" };
    }
  | {
      id: string;
      entityType: "requirement";
      value: RequirementGroup;
      provenance: EntityProvenance & { source: "manual" };
    };

export interface EntityLocalState {
  entityType: EntityType;
  entityId: string;
  hidden?: boolean;
  excluded?: boolean;
  reason?: string;
  updatedAt: string;
}

export interface ParsedAuditResult {
  programInfo: ProgramInfo;
  requirementGroups: RequirementGroup[];
  courses: Course[];
  semesters: Semester[];
  warnings: string[];
}
