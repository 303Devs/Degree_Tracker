import type { Course, RequirementGroup, Semester } from "./types";
import { calcProgress, getMissingIds, sortSemesters, validateDrop } from "./prereqs";

export type AuditCourseBucket = "completed" | "in_progress" | "planned" | "remaining" | "unknown";

export type AuditSelectionState = "required" | "selected" | "eligible";

export type AuditWarningSeverity = "info" | "success" | "warning";

export interface AuditCourseWarning {
  severity: AuditWarningSeverity;
  message: string;
  missingCourseIds: string[];
}

export interface AuditWarningSummary extends AuditCourseWarning {
  courseId: string;
  courseNumber: string;
}

export interface AuditCourseOption {
  courseId: string;
  courseNumber: string;
  courseName: string;
  credits: number;
  status: Course["status"] | "unknown";
  grade: string | null;
  semester: string | null;
  bucket: AuditCourseBucket;
  selectionState: AuditSelectionState;
  usage: {
    currentRequirement: string | null;
    currentlyCountsFor: string[];
  };
  warning: AuditCourseWarning | null;
  course: Course | null;
}

export interface AuditRequirementViewModel {
  group: RequirementGroup;
  progress: ReturnType<typeof calcProgress> & { unit: "courses" | "hours" };
  remainingLabel: string;
  buckets: Record<AuditCourseBucket, AuditCourseOption[]>;
  counts: AuditBucketCounts;
  warningSummaries: AuditWarningSummary[];
  courseOptions: AuditCourseOption[];
  displayRule: string;
}

export type AuditBucketFilter = AuditCourseBucket | "all";

type AuditBucketCounts = {
  completed: number;
  inProgress: number;
  planned: number;
  plannedCredits: number;
  remaining: number;
  unknown: number;
};

export function buildAuditRequirementViewModels({
  courses,
  requirements,
  semesters = [],
}: {
  courses: Course[];
  requirements: RequirementGroup[];
  semesters?: Semester[];
}): AuditRequirementViewModel[] {
  const sortedSemesters = sortSemesters(semesters);
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const assignments = buildAssignments(courses, sortedSemesters);
  const countingByCourse = buildCountingRequirementMap(requirements);

  return requirements.map((group) => {
    const progress = calcProgress(group, courses);
    const unit = group.type === "minimum_hours" ? "hours" : "courses";
    const options = group.coursePool.map((courseId) => {
      const course = courseById.get(courseId) ?? null;
      const selectionState = getSelectionState(group, courseId);
      const currentRequirement = selectionState === "eligible" ? null : group.id;
      const option: AuditCourseOption = {
        courseId,
        courseNumber: course?.number ?? formatCourseId(courseId),
        courseName: course?.name ?? "Not in course library",
        credits: course?.credits ?? 0,
        status: course?.status ?? "unknown",
        grade: course?.grade ?? null,
        semester: course?.semester ?? assignments.get(courseId) ?? null,
        bucket: getBucket(course),
        selectionState,
        usage: {
          currentRequirement,
          currentlyCountsFor: countingByCourse.get(courseId) ?? [],
        },
        warning: course ? getRequirementContextWarning(course, courses, sortedSemesters, assignments) : null,
        course,
      };
      return option;
    });

    const buckets = buildBuckets(options);

    return {
      group,
      progress: { ...progress, unit },
      remainingLabel: buildRemainingLabel(progress.completed, progress.total, unit),
      buckets,
      counts: countBuckets(buckets),
      warningSummaries: buildWarningSummaries(options),
      courseOptions: options,
      displayRule: getDisplayRule(group),
    };
  });
}

export function filterAuditRequirementViewModels(
  views: AuditRequirementViewModel[],
  query: string,
  bucketFilter: AuditBucketFilter = "all",
): AuditRequirementViewModel[] {
  const normalizedQuery = normalizeSearch(query);

  return views.flatMap((view) => {
    const optionMatchesBucket = (option: AuditCourseOption) => bucketFilter === "all" || option.bucket === bucketFilter;
    const groupMatches = normalizedQuery.length === 0 || normalizeSearch([
      view.group.name,
      view.group.category,
      view.group.notes ?? "",
      view.displayRule,
      view.group.id,
    ].join(" ")).includes(normalizedQuery);

    const filteredOptions = view.courseOptions.filter((option) => {
      if (!optionMatchesBucket(option)) return false;
      if (groupMatches || normalizedQuery.length === 0) return true;
      return normalizeSearch([
        option.courseId,
        option.courseNumber,
        option.courseName,
        option.status,
        option.grade ?? "",
        option.semester ?? "",
        option.selectionState,
      ].join(" ")).includes(normalizedQuery);
    });

    if (filteredOptions.length === 0) return [];
    const buckets = buildBuckets(filteredOptions);
    return [{
      ...view,
      buckets,
      counts: countBuckets(buckets),
      warningSummaries: buildWarningSummaries(filteredOptions),
      courseOptions: filteredOptions,
    }];
  });
}

function buildBuckets(options: AuditCourseOption[]): Record<AuditCourseBucket, AuditCourseOption[]> {
  const buckets: Record<AuditCourseBucket, AuditCourseOption[]> = {
    completed: [],
    in_progress: [],
    planned: [],
    remaining: [],
    unknown: [],
  };
  for (const option of options) buckets[option.bucket].push(option);
  return buckets;
}

function countBuckets(buckets: Record<AuditCourseBucket, AuditCourseOption[]>): AuditBucketCounts {
  return {
    completed: buckets.completed.length,
    inProgress: buckets.in_progress.length,
    planned: buckets.planned.length,
    plannedCredits: buckets.planned.reduce((sum, option) => sum + option.credits, 0),
    remaining: buckets.remaining.length,
    unknown: buckets.unknown.length,
  };
}

function buildWarningSummaries(options: AuditCourseOption[]): AuditWarningSummary[] {
  return options.flatMap((option) => {
    if (!option.warning) return [];
    return [{
      courseId: option.courseId,
      courseNumber: option.courseNumber,
      severity: option.warning.severity,
      message: option.warning.message,
      missingCourseIds: option.warning.missingCourseIds,
    }];
  });
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
}

function formatCourseId(id: string): string {
  return id.replace(/-/g, " ");
}

function buildRemainingLabel(completed: number, total: number, unit: "courses" | "hours"): string {
  const remaining = Math.max(total - completed, 0);
  if (remaining === 0) return unit === "hours" ? "hours complete" : "complete";
  return `${remaining} ${unit === "hours" ? "hours" : remaining === 1 ? "course" : "courses"} remaining`;
}

function getDisplayRule(group: RequirementGroup): string {
  if (group.type === "pick_one") return "Choose one eligible option";
  if (group.type === "pick_n") return `Choose ${group.required ?? "N"} eligible options`;
  if (group.type === "minimum_hours") return `Complete ${group.requiredHours ?? "required"} hours from this group`;
  return "Complete every listed course";
}

function getSelectionState(group: RequirementGroup, courseId: string): AuditSelectionState {
  if (group.type !== "pick_one" && group.type !== "pick_n") return "required";
  return group.selectedCourses?.includes(courseId) ? "selected" : "eligible";
}

function getBucket(course: Course | null): AuditCourseBucket {
  if (!course) return "unknown";
  if (course.status === "completed") return "completed";
  if (course.status === "in_progress" || course.status === "registered") return "in_progress";
  if (course.status === "planned") return "planned";
  return "remaining";
}

function buildAssignments(courses: Course[], semesters: Semester[]): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const course of courses) {
    if (course.semester) assignments.set(course.id, course.semester);
  }
  for (const semester of semesters) {
    for (const courseId of semester.courses) {
      if (!assignments.has(courseId)) assignments.set(courseId, semester.id);
    }
  }
  return assignments;
}

function buildCountingRequirementMap(requirements: RequirementGroup[]): Map<string, string[]> {
  const countsFor = new Map<string, string[]>();
  for (const group of requirements) {
    const activePool =
      (group.type === "pick_n" || group.type === "pick_one") && group.selectedCourses?.length
        ? group.selectedCourses
        : group.coursePool;
    for (const courseId of activePool) {
      const list = countsFor.get(courseId) ?? [];
      list.push(group.id);
      countsFor.set(courseId, list);
    }
  }
  return countsFor;
}

function getRequirementContextWarning(
  course: Course,
  allCourses: Course[],
  semesters: Semester[],
  assignments: Map<string, string>,
): AuditCourseWarning | null {
  if (!course.prereqs && !course.coreqs) return null;
  if (course.status === "completed") return null;

  const assignedSem = assignments.get(course.id) ?? course.semester ?? null;
  if (!assignedSem) {
    const missing = [
      ...(course.prereqs ? getMissingIds(course.prereqs, completedCourseIds(allCourses)) : []),
      ...(course.coreqs ? getMissingIds(course.coreqs, completedCourseIds(allCourses)) : []),
    ];
    return {
      severity: "info",
      message: missing.length > 0 ? "Prereqs required before planning" : "Prereqs/coreqs should be checked when planned",
      missingCourseIds: Array.from(new Set(missing)),
    };
  }

  const validation = validateDrop(course, assignedSem, allCourses, semesters, assignments);
  if (!validation.valid) {
    const pieces: string[] = [];
    if (validation.missingPrereqs.length) pieces.push(`Prereq missing: ${validation.missingPrereqs.join(", ")}`);
    if (validation.missingCoreqs.length) pieces.push(`Coreq missing: ${validation.missingCoreqs.join(", ")}`);
    return {
      severity: "warning",
      message: pieces.join("; "),
      missingCourseIds: Array.from(new Set([...validation.missingPrereqs, ...validation.missingCoreqs])),
    };
  }

  return {
    severity: "success",
    message: "Prereqs/coreqs satisfied for this term",
    missingCourseIds: [],
  };
}

function completedCourseIds(courses: Course[]): Set<string> {
  return new Set(courses.filter((course) => course.status === "completed").map((course) => course.id));
}
