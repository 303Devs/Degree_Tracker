/**
 * JSON file read/write utilities for degree tracker data.
 * All data is stored in the data/ directory at the project root.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { AppData, Course, EntityLocalState, FieldOverride, ManualEntity, PrereqRule, ProgramInfo, RequirementGroup, Semester } from "./types";
import { buildEffectiveData, defaultCourseProvenance, resetEntityOverrides, resetFieldOverride } from "./edit-overrides";
export { calcProgress } from "./prereqs";

const DATA_DIR = path.join(process.cwd(), "data");

export interface EditState {
  overrides: FieldOverride[];
  manualEntities: ManualEntity[];
  localStates: EntityLocalState[];
}

const EMPTY_EDIT_STATE: EditState = { overrides: [], manualEntities: [], localStates: [] };

const EDITABLE_COURSE_FIELDS = new Set([
  "name",
  "number",
  "description",
  "credits",
  "status",
  "grade",
  "semester",
  "notes",
  "countedTowardDegree",
  "countsTowardDegree",
  "countsTowardGPA",
  "countsTowardEarnedHours",
  "excludeReason",
]);

const COURSE_STATUSES = new Set(["not_started", "planned", "in_progress", "registered", "completed"]);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filename: string, data: unknown): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function readCourses(): Course[] {
  return readJson<Course[]>("courses.json", []);
}

export function writeCourses(courses: Course[]): void {
  writeJson("courses.json", courses);
}

export function readEditState(): EditState {
  const state = readJson<Partial<EditState>>("edit-state.json", EMPTY_EDIT_STATE);
  return {
    overrides: state.overrides ?? [],
    manualEntities: state.manualEntities ?? [],
    localStates: state.localStates ?? [],
  };
}

export function writeEditState(state: EditState): void {
  writeJson("edit-state.json", state);
}

export function readEffectiveCourses(): Course[] {
  return buildEffectiveData({
    courses: readCourses(),
    requirements: readRequirements(),
    ...readEditState(),
  }).courses;
}

export function getCourseById(id: string): Course | undefined {
  return readEffectiveCourses().find((c) => c.id === id);
}

function getBaseCourseById(id: string): Course | undefined {
  return readCourses().find((c) => c.id === id);
}

function getManualCourseEntity(state: EditState, id: string): (ManualEntity & { entityType: "course"; value: Course }) | undefined {
  return state.manualEntities.find(
    (entity): entity is ManualEntity & { entityType: "course"; value: Course } => entity.entityType === "course" && entity.value.id === id
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCoursePatch(updates: Record<string, unknown>): Partial<Course> {
  const keys = Object.keys(updates);
  if (keys.length === 0) throw new Error("Empty course update");
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    if (!EDITABLE_COURSE_FIELDS.has(key)) throw new Error(`Field ${key} is not editable`);
    const field = key === "countsTowardDegree" ? "countedTowardDegree" : key;
    const value = updates[key];
    if (["name", "number", "description", "grade", "semester", "notes", "excludeReason"].includes(field)) {
      if (value !== undefined && typeof value !== "string") throw new Error(`Field ${key} must be a string`);
    } else if (field === "credits") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("credits must be a finite non-negative number");
    } else if (field === "status") {
      if (typeof value !== "string" || !COURSE_STATUSES.has(value)) throw new Error("status is invalid");
    } else if (["countedTowardDegree", "countsTowardGPA", "countsTowardEarnedHours"].includes(field)) {
      if (typeof value !== "boolean") throw new Error(`Field ${key} must be a boolean`);
    }
    normalized[field] = value;
  }
  return normalized as Partial<Course>;
}

export function createManualCourse(input: Partial<Course> & { id?: string; number?: string }): Course {
  if (!input.id || !input.number) throw new Error("id and number are required");
  if (getBaseCourseById(input.id) || readEffectiveCourses().some((course) => course.id === input.id)) {
    throw new Error(`Course ${input.id} already exists`);
  }
  const course: Course = {
    id: input.id,
    number: input.number,
    name: typeof input.name === "string" ? input.name : "",
    credits: typeof input.credits === "number" ? input.credits : 3,
    prereqs: null,
    coreqs: null,
    status: input.status ?? "not_started",
    grade: input.grade,
    semester: input.semester,
    notes: input.notes,
    countedTowardDegree: input.countedTowardDegree ?? true,
    countsTowardGPA: input.countsTowardGPA ?? true,
    countsTowardEarnedHours: input.countsTowardEarnedHours ?? true,
    excludeReason: input.excludeReason,
    manuallyAdded: true,
    source: "manual",
  };
  normalizeCoursePatch({
    name: course.name,
    number: course.number,
    credits: course.credits,
    status: course.status,
    ...(course.grade !== undefined ? { grade: course.grade } : {}),
    ...(course.semester !== undefined ? { semester: course.semester } : {}),
    ...(course.notes !== undefined ? { notes: course.notes } : {}),
    countedTowardDegree: course.countedTowardDegree,
    countsTowardGPA: course.countsTowardGPA,
    countsTowardEarnedHours: course.countsTowardEarnedHours,
    ...(course.excludeReason !== undefined ? { excludeReason: course.excludeReason } : {}),
  });
  const now = nowIso();
  const state = readEditState();
  state.manualEntities.push({ id: `manual-course-${course.id}`, entityType: "course", value: course, provenance: { source: "manual", createdAt: now, updatedAt: now } });
  writeEditState(state);
  return course;
}

export function updateEditableCourse(id: string, rawUpdates: Record<string, unknown>): Course | null {
  const updates = normalizeCoursePatch(rawUpdates);
  const state = readEditState();
  const manual = getManualCourseEntity(state, id);
  const now = nowIso();
  if (manual) {
    manual.value = { ...manual.value, ...updates, manuallyAdded: true, source: "manual" };
    manual.provenance = { ...manual.provenance, updatedAt: now };
    writeEditState(state);
    return readEffectiveCourses().find((course) => course.id === id) ?? null;
  }
  const base = getBaseCourseById(id);
  if (!base) return null;
  for (const [field, value] of Object.entries(updates)) {
    const existing = state.overrides.find((override) => override.entityType === "course" && override.entityId === id && override.field === field);
    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
    } else {
      const provenance = defaultCourseProvenance(base);
      state.overrides.push({
        id: `course-${id}-${field}`,
        entityType: "course",
        entityId: id,
        field,
        value,
        baseValue: (base as unknown as Record<string, unknown>)[field],
        baseSource: provenance.source,
        auditImportId: provenance.source === "audit" ? provenance.auditImportId : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  writeEditState(state);
  return readEffectiveCourses().find((course) => course.id === id) ?? null;
}

export function deleteEditableCourse(id: string): { deleted: true } | { deleted: false; status: number; error: string } {
  const state = readEditState();
  const manual = getManualCourseEntity(state, id);
  if (manual) {
    state.manualEntities = state.manualEntities.filter((entity) => entity !== manual);
    state.overrides = resetEntityOverrides(state.overrides, "course", id);
    writeEditState(state);
    return { deleted: true };
  }
  if (getBaseCourseById(id)) {
    return { deleted: false, status: 400, error: "Audit-sourced courses cannot be destructively deleted" };
  }
  return { deleted: false, status: 404, error: "Course not found" };
}

export function resetEditableCourse(id: string, options: { field?: string; fields?: string[]; all?: boolean }): Course | null {
  const base = getBaseCourseById(id);
  if (!base) return null;
  const state = readEditState();
  if (options.all) {
    state.overrides = resetEntityOverrides(state.overrides, "course", id);
  } else {
    const fields = options.fields ?? (options.field ? [options.field] : []);
    if (fields.length === 0) throw new Error("field, fields, or all is required");
    for (const field of fields) {
      if (!EDITABLE_COURSE_FIELDS.has(field)) throw new Error(`Field ${field} is not editable`);
      state.overrides = resetFieldOverride(state.overrides, "course", id, field === "countsTowardDegree" ? "countedTowardDegree" : field);
    }
  }
  writeEditState(state);
  return readEffectiveCourses().find((course) => course.id === id) ?? null;
}

export function updateCourse(id: string, updates: Partial<Course>): Course | null {
  const courses = readCourses();
  const idx = courses.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  courses[idx] = { ...courses[idx], ...updates };
  writeCourses(courses);
  return courses[idx];
}

export function createCourse(course: Course): Course {
  const courses = readCourses();
  if (courses.some((c) => c.id === course.id)) {
    throw new Error(`Course ${course.id} already exists`);
  }
  courses.push(course);
  writeCourses(courses);
  return course;
}

export function deleteCourse(id: string): boolean {
  const courses = readCourses();
  const idx = courses.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  courses.splice(idx, 1);
  writeCourses(courses);
  return true;
}

function collectRuleCourseIds(rule: PrereqRule | null, ids: Set<string>): void {
  if (!rule) return;
  if (rule.type === "course") {
    ids.add(spaceToDash(rule.courseId));
    return;
  }
  for (const child of rule.rules) collectRuleCourseIds(child, ids);
}

function courseIdToNumber(id: string): string {
  return id.replace("-", " ");
}

/**
 * Adds placeholder courses for IDs referenced by requirements or prereq/coreq
 * rules but missing from courses.json. Scraper enrichment can later fill in
 * titles, credits, descriptions, and richer rules.
 */
export function ensureReferencedCourseStubs(): { added: number } {
  const courses = readCourses();
  const requirements = readRequirements();
  const existing = new Set(courses.map((c) => c.id));
  const referenced = new Set<string>();

  for (const course of courses) {
    collectRuleCourseIds(course.prereqs, referenced);
    collectRuleCourseIds(course.coreqs, referenced);
  }
  for (const requirement of requirements) {
    for (const id of requirement.coursePool) referenced.add(spaceToDash(id));
    for (const id of requirement.selectedCourses ?? []) referenced.add(spaceToDash(id));
  }

  const additions: Course[] = [];
  for (const id of Array.from(referenced).sort()) {
    if (existing.has(id) || id.endsWith("-0000")) continue;
    additions.push({
      id,
      number: courseIdToNumber(id),
      name: courseIdToNumber(id),
      credits: 0,
      prereqs: null,
      coreqs: null,
      status: "not_started",
      countedTowardDegree: true,
      countsTowardGPA: true,
      countsTowardEarnedHours: true,
      source: "stub",
    });
  }

  if (additions.length > 0) {
    writeCourses([...courses, ...additions]);
  }
  return { added: additions.length };
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export function readRequirements(): RequirementGroup[] {
  return readJson<RequirementGroup[]>("requirements.json", []);
}

export function writeRequirements(groups: RequirementGroup[]): void {
  writeJson("requirements.json", groups);
}

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

export function readSemesters(): Semester[] {
  return readJson<Semester[]>("semesters.json", []);
}

export function writeSemesters(semesters: Semester[]): void {
  writeJson("semesters.json", semesters);
}

export function updateSemester(id: string, updates: Partial<Semester>): Semester | null {
  const semesters = readSemesters();
  const idx = semesters.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  semesters[idx] = { ...semesters[idx], ...updates };
  writeSemesters(semesters);
  return semesters[idx];
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export function readPrograms(): ProgramInfo[] {
  return readJson<ProgramInfo[]>("programs.json", []);
}

export function writePrograms(programs: ProgramInfo[]): void {
  writeJson("programs.json", programs);
}

// ---------------------------------------------------------------------------
// Derived semester courses (Fix #3: course.semester is authoritative)
// ---------------------------------------------------------------------------

/**
 * Derive semester.courses from course.semester fields.
 * course.semester is the single source of truth for which semester a course
 * belongs to. semester.courses is derived at read time.
 */
export function deriveSemesterCourses(semesters: Semester[], courses: Course[]): Semester[] {
  // Build lookup: semId → courseIds from course.semester
  const semCourseMap = new Map<string, string[]>();
  for (const sem of semesters) {
    semCourseMap.set(sem.id, []);
  }
  for (const course of courses) {
    if (course.semester && semCourseMap.has(course.semester)) {
      semCourseMap.get(course.semester)!.push(course.id);
    }
  }
  return semesters.map((sem) => ({
    ...sem,
    courses: semCourseMap.get(sem.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Composite read/write
// ---------------------------------------------------------------------------

export function readAppData(): AppData {
  const courses = readCourses();
  const rawSemesters = readSemesters();
  return {
    courses,
    requirements: readRequirements(),
    semesters: deriveSemesterCourses(rawSemesters, courses),
    programs: readPrograms(),
  };
}

/**
 * Merge new audit data into existing data, deduplicating by ID.
 *
 * ## Merge rules (source-aware)
 *
 * Courses:
 * - Audit source (grade, status, semester, counting flags) overwrites when
 *   the new data is more authoritative (non-stub, non-empty).
 * - User-set fields are preserved: prereqs, coreqs, notes (unless new data
 *   has them AND existing didn't).
 * - Enriched data (name, credits from scraper) is preserved when new data
 *   is a stub.
 * - Manually-added courses (source="manual") are NEVER removed by a
 *   re-upload. They are left untouched.
 * - course.source is set to the winning source.
 *
 * RequirementGroups: replace all groups from the same category.
 * Semesters: merge by ID, union courses.
 * Programs: replace matching programCode.
 */
export function mergeAuditData(newData: {
  courses: Course[];
  requirements: RequirementGroup[];
  semesters: Semester[];
  programs: ProgramInfo[];
}): void {
  // Courses: merge by ID, preserving user fields
  const existingCourses = readCourses();
  const courseMap = new Map(existingCourses.map((c) => [c.id, c]));
  for (const nc of newData.courses) {
    const existing = courseMap.get(nc.id);
    if (existing) {
      // Never overwrite manually-added courses with audit/stub data.
      // Legacy courses may have manuallyAdded=true but no source field.
      if ((existing.source === "manual" || existing.manuallyAdded) && nc.source !== "manual") {
        continue;
      }

      // Detect stub names: "DEPT NUMBER" matching the course id
      const ncIsStubName = nc.name === nc.id.replace("-", " ") || nc.name === `${nc.id.split("-")[0]} ${nc.id.split("-")[1]}`;
      courseMap.set(nc.id, {
        ...nc,
        // Preserve enriched data from scraper if new course is a stub
        credits: existing.credits > 0 && nc.credits === 0 ? existing.credits : nc.credits,
        name: !ncIsStubName ? nc.name : existing.name || nc.name,
        // Preserve user-set fields (existing wins for non-null values)
        prereqs: existing.prereqs ?? nc.prereqs,
        coreqs: existing.coreqs ?? nc.coreqs,
        notes: existing.notes ?? nc.notes,
        // Audit fields take precedence for status/grade if audit has them
        status: nc.status !== "not_started" ? nc.status : existing.status,
        grade: nc.grade ?? existing.grade,
        semester: nc.semester ?? existing.semester,
        // Preserve granular counting flags from audit
        countedTowardDegree: nc.countedTowardDegree ?? existing.countedTowardDegree,
        countsTowardGPA: nc.countsTowardGPA ?? existing.countsTowardGPA,
        countsTowardEarnedHours: nc.countsTowardEarnedHours ?? existing.countsTowardEarnedHours,
        excludeReason: nc.excludeReason ?? existing.excludeReason,
        // Source: audit wins over stub/enriched, but manual is protected above
        source: nc.source === "audit" ? "audit" : existing.source ?? nc.source,
        // Preserve manuallyAdded flag
        manuallyAdded: existing.manuallyAdded ?? nc.manuallyAdded,
      });
    } else {
      courseMap.set(nc.id, nc);
    }
  }
  writeCourses(Array.from(courseMap.values()));

  // Requirements: replace groups by category from new audit, keep others.
  // Preserve user selectedCourses from existing groups when replacing.
  const existingReqs = readRequirements();
  const newCategories = new Set(newData.requirements.map((r) => r.category));
  const keptReqs = existingReqs.filter((r) => !newCategories.has(r.category));

  // Build lookup of existing selections by category+name for carry-over
  const existingSelections = new Map<string, string[]>();
  for (const r of existingReqs) {
    if (r.selectedCourses && r.selectedCourses.length > 0) {
      existingSelections.set(`${r.category}::${r.name}`, r.selectedCourses);
    }
  }
  // For each new requirement group, carry over user selections that still exist in the pool
  const mergedNewReqs = newData.requirements.map((nr) => {
    // Try exact match by category+name first, then any group in same category
    let prevSelections = existingSelections.get(`${nr.category}::${nr.name}`);
    if (!prevSelections) {
      // Fallback: find any existing group in the same category with selections
      for (const r of existingReqs) {
        if (r.category === nr.category && r.selectedCourses && r.selectedCourses.length > 0) {
          prevSelections = r.selectedCourses;
          break;
        }
      }
    }
    if (prevSelections && (!nr.selectedCourses || nr.selectedCourses.length === 0)) {
      const poolSet = new Set(nr.coursePool);
      return {
        ...nr,
        selectedCourses: prevSelections.filter((c) => poolSet.has(c)),
      };
    }
    return nr;
  });
  writeRequirements([...keptReqs, ...mergedNewReqs]);

  // Semesters: merge by ID
  const existingSems = readSemesters();
  const semMap = new Map(existingSems.map((s) => [s.id, s]));
  for (const ns of newData.semesters) {
    const existing = semMap.get(ns.id);
    if (existing) {
      semMap.set(ns.id, {
        ...existing,
        status: ns.status,
        // Merge courses without duplicates
        courses: [...new Set([...existing.courses, ...ns.courses])],
      });
    } else {
      semMap.set(ns.id, ns);
    }
  }
  writeSemesters(
    Array.from(semMap.values()).sort((a, b) => {
      const ord: Record<string, number> = { spring: 0, summer: 1, fall: 2 };
      if (a.year !== b.year) return a.year - b.year;
      return (ord[a.type] ?? 0) - (ord[b.type] ?? 0);
    })
  );

  // Programs: replace matching by programCode, keep others
  const existingProgs = readPrograms();
  const newCodes = new Set(newData.programs.map((p) => p.programCode));
  const keptProgs = existingProgs.filter((p) => !newCodes.has(p.programCode));
  writePrograms([...keptProgs, ...newData.programs]);
}

// ---------------------------------------------------------------------------
// Requirements (update single group)
// ---------------------------------------------------------------------------

export function updateRequirement(
  id: string,
  updates: Partial<RequirementGroup>
): RequirementGroup | null {
  const groups = readRequirements();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  groups[idx] = { ...groups[idx], ...updates };
  writeRequirements(groups);
  return groups[idx];
}

// ---------------------------------------------------------------------------
// Semesters (create)
// ---------------------------------------------------------------------------

export function createSemester(sem: Semester): Semester {
  const semesters = readSemesters();
  // Guard against duplicates
  if (semesters.some((s) => s.id === sem.id)) {
    throw new Error(`Semester ${sem.id} already exists`);
  }
  const typeOrd: Record<string, number> = { spring: 0, summer: 1, fall: 2 };
  const updated = [...semesters, sem].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return (typeOrd[a.type] ?? 0) - (typeOrd[b.type] ?? 0);
  });
  writeSemesters(updated);
  return sem;
}

export function deleteSemester(id: string): boolean {
  const semesters = readSemesters();
  const idx = semesters.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  semesters.splice(idx, 1);
  writeSemesters(semesters);
  return true;
}

// ---------------------------------------------------------------------------
// Enrichment from scraper
// ---------------------------------------------------------------------------

interface ScraperEntry {
  number: string;
  name: string;
  credits: number;
  description?: string;
  prereqs: PrereqRule | null;
  coreqs: PrereqRule | null;
}

function spaceToDash(id: string): string {
  return id.replace(/\s+/g, "-");
}

function convertRuleCourseIds(rule: PrereqRule | null): PrereqRule | null {
  if (!rule) return null;
  if (rule.type === "course") {
    return { type: "course", courseId: spaceToDash(rule.courseId) };
  }
  return { ...rule, rules: rule.rules.map((r) => convertRuleCourseIds(r) as PrereqRule) };
}

function isStubName(name: string, number: string): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed === number || trimmed === spaceToDash(number)) return true;
  if (/^[A-Z]+[\s-]\d+[A-Z]?$/.test(trimmed)) return true;
  return false;
}

/**
 * Enriches courses.json with data from ~/Projects/cu-prereq-scraper/prereqs.json.
 * No-ops silently if the scraper file doesn't exist.
 * Returns the number of courses that were updated.
 */
export function enrichCoursesFromScraper(): { enriched: number } {
  const scraperPath = path.join(os.homedir(), "Projects", "cu-prereq-scraper", "prereqs.json");
  if (!fs.existsSync(scraperPath)) return { enriched: 0 };

  const scraper: Record<string, ScraperEntry> = JSON.parse(fs.readFileSync(scraperPath, "utf-8"));
  const courses = readCourses();

  const scraperMap = new Map<string, ScraperEntry>();
  for (const [key, entry] of Object.entries(scraper)) {
    scraperMap.set(spaceToDash(key), entry);
  }

  let enriched = 0;

  for (const course of courses) {
    const entry = scraperMap.get(course.id);
    if (!entry) continue;

    let changed = false;

    if (isStubName(course.name, course.number) && entry.name) {
      course.name = entry.name;
      changed = true;
    }

    if (course.credits === 0 && entry.credits > 0) {
      course.credits = entry.credits;
      changed = true;
    }

    if (entry.description && !course.description) {
      course.description = entry.description;
      changed = true;
    }

    if (entry.description && !course.notes) {
      course.notes = entry.description;
      changed = true;
    }

    const convertedPrereqs = convertRuleCourseIds(entry.prereqs);
    if (convertedPrereqs !== null && course.prereqs === null) {
      course.prereqs = convertedPrereqs;
      changed = true;
    }

    const convertedCoreqs = convertRuleCourseIds(entry.coreqs);
    if (convertedCoreqs !== null && course.coreqs === null) {
      course.coreqs = convertedCoreqs;
      changed = true;
    }

    if (changed) {
      // Mark source as enriched if it was a stub, otherwise preserve original source
      if (course.source === "stub" || !course.source) {
        course.source = "enriched";
      }
      enriched++;
    }
  }

  writeCourses(courses);
  return { enriched };
}
