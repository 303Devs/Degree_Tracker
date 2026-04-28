export type CourseStatus = "not_started" | "planned" | "in_progress" | "registered" | "completed";

export type PrereqRule =
  | { type: "course"; courseId: string }
  | { type: "and"; rules: PrereqRule[] }
  | { type: "or"; rules: PrereqRule[] };

export interface Course {
  id: string;           // e.g. "STAT-3100"
  number: string;       // e.g. "STAT 3100"
  name: string;
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

export interface ParsedAuditResult {
  programInfo: ProgramInfo;
  requirementGroups: RequirementGroup[];
  courses: Course[];
  semesters: Semester[];
  warnings: string[];
}
