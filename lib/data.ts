/**
 * JSON file read/write utilities for degree tracker data.
 * All data is stored in the data/ directory at the project root.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { AppData, Course, PrereqRule, ProgramInfo, RequirementGroup, Semester } from "./types";
export { calcProgress } from "./prereqs";

const DATA_DIR = path.join(process.cwd(), "data");

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

export function getCourseById(id: string): Course | undefined {
  return readCourses().find((c) => c.id === id);
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
 * Courses: new overrides existing (grade/status updates from audit), preserving
 * user-edited fields (notes, manually-set semester/prereqs).
 * RequirementGroups: replace all groups from the same category.
 * Semesters: merge by ID.
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
      // Detect stub names: "DEPT NUMBER" matching the course id (e.g. "STAT 4250" for "STAT-4250")
      const ncIsStubName = nc.name === nc.id.replace("-", " ") || nc.name === `${nc.id.split("-")[0]} ${nc.id.split("-")[1]}`;
      courseMap.set(nc.id, {
        ...nc,
        // Preserve enriched data from scraper if new course is a stub
        credits: existing.credits > 0 && nc.credits === 0 ? existing.credits : nc.credits,
        name: !ncIsStubName ? nc.name : existing.name || nc.name,
        // Preserve user-set fields
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
      });
    } else {
      courseMap.set(nc.id, nc);
    }
  }
  writeCourses(Array.from(courseMap.values()));

  // Requirements: replace groups by category from new audit, keep others
  const existingReqs = readRequirements();
  const newCategories = new Set(newData.requirements.map((r) => r.category));
  const keptReqs = existingReqs.filter((r) => !newCategories.has(r.category));
  writeRequirements([...keptReqs, ...newData.requirements]);

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

    if (changed) enriched++;
  }

  writeCourses(courses);
  return { enriched };
}

