/**
 * Degree Audit PDF Parser
 *
 * Step 1 — extractCourseworkHistory(text): regex deterministically extracts every
 *           course, semester, and available program info from the Coursework History
 *           section. No LLM involved. Replaces the old "Call 1".
 *
 * Step 2 — callRequirementsParser: one LLM call extracts requirement groups.
 *           Requirements are too unstructured for regex. "Call 2" unchanged.
 *
 * Step 3 — mergeResults: regex courses are authoritative; LLM requirement groups
 *           reference them. Courses not in the regex output get stubbed as not_started.
 */

import { callLLM } from "./llm";
import type { LLMConfig } from "./llm";
import { getFullConfig } from "./settings";
import type {
  Course,
  ParsedAuditResult,
  ProgramInfo,
  RequirementGroup,
  Semester,
} from "./types";

// ---------------------------------------------------------------------------
// Regex patterns for coursework history parsing
// ---------------------------------------------------------------------------

/**
 * Matches a single course line from the Coursework History section.
 *
 * Format: {TERM}{DEPT}{NUMBER}{CREDITS}{GRADE}[FLAGS][TITLE]
 * Examples:
 *   FA03ASTR11103.0CGen Astronomy-Solar Sys
 *   FA03WRTG11503.0B+1st Yr Writing/Rhetoric   ← grade B+, title starts immediately
 *   SP04CSCI12000.0F>X >N                       ← grade F, two flags, no title
 *   FA26APPM16504.0***Python for Math + Data    ← grade ***, title follows
 *   SU26GEOG19623.0***>RGeographies of Change   ← grade ***, flag >R, then title
 *
 * Groups: [1] term  [2] dept  [3] number  [4] credits  [5] grade  [6] flags  [7] title
 */
const COURSE_LINE_RE =
  /^([A-Z]{2}\d{2})([A-Z]{2,5})(\d{4}[A-Z]?)(\d+\.\d)(\*\*\*|HS|NR|A-|B\+|B-|C\+|C-|D\+|D-|[ABCDFWIP])((?:>[A-Z]\s*)*)(.*)$/;

/**
 * Fallback for high school transfer courses that have no 4-digit course number.
 * Example: 'SP00SPAN3.0HSSpanish' → term=SP00 dept=SPAN credits=3.0 grade=HS title=Spanish
 * Groups: [1] term  [2] dept  [3] credits  [4] grade  [5] flags  [6] title
 */
const HS_COURSE_LINE_RE =
  /^([A-Z]{2}\d{2})([A-Z]{2,5})(\d+\.\d)(HS)((?:>[A-Z]\s*)*)(.*)$/;

/** Semester block markers: *FA2003, *SP2016, etc. */
const SEMESTER_BLOCK_RE = /^\*[A-Z]{2}\d{4}/;

/** Semester summary lines, e.g. "( 13.0HOURS TAKEN)4COURSES TAKEN2.138GPA" */
const SUMMARY_LINE_RE = /HOURS TAKEN|COURSES TAKEN/;

/** "PROCESSED AS:  XXXX" lines that appear after a course line */
const PROCESSED_AS_RE = /^PROCESSED AS:\s+(\S+)/;

// ---------------------------------------------------------------------------
// Grade → grade-point mapping (GPA scale)
// ---------------------------------------------------------------------------

const GRADE_POINTS: Record<string, number> = {
  A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

// ---------------------------------------------------------------------------
// System prompt (requirements LLM call — unchanged)
// ---------------------------------------------------------------------------

const REQUIREMENTS_SYSTEM_PROMPT = `You are a university degree audit parser. Extract all degree requirement groups from a degree audit. Return ONLY a valid JSON object — no markdown fences, no explanation, just the raw JSON.

## Return shape

{
  "requirementGroups": [ ...RequirementGroup ],
  "warnings": [ ...string ]
}

## TypeScript types

interface RequirementGroup {
  id: string;             // lowercase kebab-case: "{category}-{name}", max 80 chars
  name: string;           // EXACT group name from audit text
  category: string;       // EXACT section/category name from audit text
  type: "complete_all" | "pick_n" | "pick_one" | "minimum_hours";
  required?: number;      // pick_n only: how many to pick
  requiredHours?: number; // minimum_hours only: minimum credit hours
  coursePool: string[];   // course IDs in "DEPT-NUMBER" format
  notes?: string;
  minGrade?: string;
}

## Requirement group extraction rules

- Use EXACT section and group names from the audit — do not paraphrase
- SKIP these administrative sections: "Graduation Policy", "MAPS Requirements", "Hours & GPA Requirements", "Courses Not Applicable", "Legend"
- coursePool must use "DEPT-NUMBER" format with a dash, e.g. "CSCI-1300", "STAT-4250", "APPM-3650"
- type rules:
  - "Complete X of the following" / "Choose N from" / "Select N of" → pick_n, set required = N
  - "Complete X or Y" / "Select one from" → pick_one
  - "Complete at least N hours" / "Minimum N hours" → minimum_hours, set requiredHours = N
  - All listed courses are required → complete_all
- id: lowercase kebab slug of "{category}-{name}", replace non-alphanumeric with hyphens, truncate to 80 chars

## CRITICAL: coursePool population rules

For EVERY requirement group, coursePool MUST be populated with all courses mentioned in that group. Empty coursePools are almost always wrong.

### Rule 1 — SELECT FROM lists (compact format)
"SELECT FROM:" lines use a compact format where subsequent course numbers inherit the preceding department prefix.
Example: "STAT4250,4360,4430,4540" means STAT-4250, STAT-4360, STAT-4430, STAT-4540
Example: "APPM4120,APPM4320,4370,4440" means APPM-4120, APPM-4320, APPM-4370, APPM-4440
Parse ALL entries and expand them to full "DEPT-NUMBER" format. A SELECT FROM list may span multiple lines — read all lines until the next requirement marker.

### Rule 2 — Single-course "Complete X:" requirements
"Complete APPM3650:" means coursePool = ["APPM-3650"]
"Complete STAT2600:" means coursePool = ["STAT-2600"]
Always include the named course in coursePool.

### Rule 3 — "Complete A, B, or C:" pick-one requirements
"Complete APPM2340, APPM2350, or MATH2400:" means type = "pick_one", coursePool = ["APPM-2340", "APPM-2350", "MATH-2400"]

### Rule 4 — Course lines with terms/grades
Lines like "FA26STAT26004.0***Intro to Data Science" appearing under a requirement section indicate that course satisfies that requirement — include it in coursePool (here: "STAT-2600").

### Rule 5 — minimum_hours with no specific courses
For "Complete at least N hours outside DEPT" or similar hour-count requirements where no specific courses are listed, coursePool may be empty BUT requiredHours MUST be set.

## Examples of correct extraction

Audit text:
  === Computation ===
  SELECT FROM:
  APPM3310
  -Complete APPM3310:

Correct output:
  { "name": "Complete APPM3310", "category": "Computation", "type": "complete_all", "coursePool": ["APPM-3310"] }

Audit text:
  SELECT FROM:
  APPM2340,2350  MATH2400
  -Complete APPM2340, APPM2350, or MATH2400:

Correct output:
  { "type": "pick_one", "coursePool": ["APPM-2340", "APPM-2350", "MATH-2400"] }

Audit text:
  === Electives ===
  SELECT FROM:
  STAT4250,4360,4430,4540,4630,4700  APPM4120,
  APPM4320,4370,4440,4450,4490,4515,4530,4565,
  APPM4600
  -Complete four of the following courses:

Correct output:
  { "type": "pick_n", "required": 4, "coursePool": ["STAT-4250","STAT-4360","STAT-4430","STAT-4540","STAT-4630","STAT-4700","APPM-4120","APPM-4320","APPM-4370","APPM-4440","APPM-4450","APPM-4490","APPM-4515","APPM-4530","APPM-4565","APPM-4600"] }

## warnings

List anything ambiguous, missing, or that could not be cleanly extracted.`;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type RawCourse = {
  term: string;       // e.g. "FA03"
  dept: string;       // e.g. "ASTR"
  num: string;        // e.g. "1110"; "HS" for high school courses without a number
  credits: number;
  grade: string;      // e.g. "A-", "***", "F"
  flags: string[];    // e.g. [">X", ">N"]
  title: string;
  processedAs?: string;
  creditNote?: string; // set when credits were recovered or estimated for F-grade courses
};

type CourseworkResult = {
  courses: Course[];
  semesters: Semester[];
  programInfo: Partial<ProgramInfo>;
};

type RequirementsResult = {
  requirementGroups: RequirementGroup[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Regex-based extractor for the Coursework History section of a CU DARS audit.
 * Returns every course with full metadata, grouped into semesters, plus whatever
 * program info can be deterministically parsed from the header.
 *
 * This is exported so callers (tests, scripts) can verify extraction without
 * going through the full PDF → LLM pipeline.
 */
export function extractCourseworkHistory(text: string): CourseworkResult {
  const programInfo = extractProgramInfoFromText(text);
  const currentTerm = preparedDateToTerm(programInfo.preparedDate ?? "");

  // Narrow to the Coursework History section.
  // DO NOT use "END OF ANALYSIS" as an end boundary — CU DARS PDFs often
  // have this marker between pages, and future-semester courses (SP26, SU26,
  // FA26 etc.) can appear AFTER it in the extracted text. The course-line
  // regex is specific enough that non-course lines won't false-match.
  const histStart = text.indexOf("Coursework History");
  const histText = histStart !== -1 ? text.slice(histStart) : text;

  const rawCourses = parseRawCourses(histText);

  // Bug 2: F courses reported with 0 earned credits — recover attempted credits
  // from elsewhere in the full audit text (requirement sections list real credits).
  for (const rc of rawCourses) {
    if (rc.grade === "F" && rc.credits === 0) {
      const found = findCreditsInFullText(text, rc.dept, rc.num, rc.processedAs);
      if (found !== undefined) {
        rc.credits = found;
      } else {
        rc.credits = 3.0; // 4-digit CU courses are almost always 3 credits
        rc.creditNote = "Attempted credits estimated";
      }
    }
  }

  // Build a map of courseKey → all terms where it appears (for >N >R logic)
  const allAttempts = new Map<string, string[]>();
  for (const rc of rawCourses) {
    const key = `${rc.dept}-${rc.num}`;
    if (!allAttempts.has(key)) allAttempts.set(key, []);
    allAttempts.get(key)!.push(rc.term);
  }

  const courseMap = new Map<string, Course>();
  // semesterCourses tracks course IDs per term for building Semester objects.
  // A course that appears in multiple terms (repeated attempts) will appear in
  // each term's list; the Course object itself records the most recent term.
  const semesterCourses = new Map<string, string[]>();

  for (const rc of rawCourses) {
    const hasX = rc.flags.includes(">X");
    const hasN = rc.flags.includes(">N");
    const hasR = rc.flags.includes(">R");

    // Determine if this course attempt counts toward the degree
    let countedTowardDegree = true;
    let excludeReason: string | undefined;

    // Grade replacement (>X >N) — excluded from GPA by CU
    if (hasX && hasN) {
      countedTowardDegree = false;
      excludeReason = "Grade replacement (>X >N) — excluded from GPA";
    }

    // Repeated no-credit (>N >R) — skip only when a later attempt exists
    if (hasN && hasR) {
      const later = (allAttempts.get(`${rc.dept}-${rc.num}`) ?? []).filter(
        (t) => compareSemesterIds(t, rc.term) > 0
      );
      if (later.length > 0) {
        countedTowardDegree = false;
        excludeReason = "Repeated course (>N >R) — superseded by later attempt";
      }
    }

    // For excluded courses, use a unique ID that includes the term
    // so multiple attempts of the same course don't overwrite each other
    const baseId = `${rc.dept}-${rc.num}`;
    const courseId = countedTowardDegree ? baseId : `${baseId}__${rc.term}`;

    const status: Course["status"] =
      rc.grade === "***"
        ? compareSemesterIds(rc.term, currentTerm) > 0
          ? "registered"
          : "in_progress"
        : "completed";

    const gradePoints = Object.prototype.hasOwnProperty.call(GRADE_POINTS, rc.grade)
      ? GRADE_POINTS[rc.grade]
      : undefined;

    const noteParts: string[] = [];
    if (rc.processedAs) noteParts.push(`Processed as: ${rc.processedAs}`);
    if (rc.creditNote) noteParts.push(rc.creditNote);
    if (rc.grade === "W" && rc.credits === 0) {
      noteParts.push("Original credits unknown");
    }
    const otherFlags = rc.flags.filter((f) => f !== ">X" && f !== ">N" && f !== ">R");
    if (otherFlags.length > 0) noteParts.push(`Flags: ${otherFlags.join(" ")}`);

    const newCourse: Course = {
      id: courseId,
      number: `${rc.dept} ${rc.num}`,
      name: rc.title,
      credits: rc.credits,
      prereqs: null,
      coreqs: null,
      status,
      grade: rc.grade !== "***" ? rc.grade : undefined,
      semester: rc.term,
      gradePoints,
      notes: noteParts.length > 0 ? noteParts.join("; ") : undefined,
      countedTowardDegree,
      excludeReason,
    };

    // Keep the richer entry; for ties, later (more recent) occurrence wins
    const existing = courseMap.get(courseId);
    if (!existing || courseRichness(newCourse) >= courseRichness(existing)) {
      courseMap.set(courseId, newCourse);
    }

    // Always record the course in its term's list (even if it's a repeat)
    if (!semesterCourses.has(rc.term)) semesterCourses.set(rc.term, []);
    const termList = semesterCourses.get(rc.term)!;
    if (!termList.includes(courseId)) termList.push(courseId);
  }

  const courses = Array.from(courseMap.values());

  const semesters: Semester[] = Array.from(semesterCourses.entries())
    .map(([id, courseIds]) => ({
      id,
      label: semesterIdToLabel(id),
      type: semesterIdToType(id),
      year: semesterIdToYear(id),
      status: determineSemesterStatus(id, currentTerm),
      courses: courseIds,
    }))
    .sort(compareSemesters);

  return { courses, semesters, programInfo };
}

export async function parseAuditPDF(buffer: Buffer): Promise<ParsedAuditResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(buffer);
  const text = data.text as string;

  const settings = getFullConfig();
  if (!settings.apiKey) {
    return makeErrorResult(
      "No API key configured. Add one in Settings or set ANTHROPIC_API_KEY in .env.local."
    );
  }

  // Step 1: deterministic regex extraction — all courses and semesters
  const courseworkResult = extractCourseworkHistory(text);

  // Step 2: LLM extracts requirement groups only (requirements are too messy for regex)
  const requirementsResult = await callRequirementsParser(settings, text);

  return mergeResults(courseworkResult, requirementsResult);
}

// ---------------------------------------------------------------------------
// Raw course parsing
// ---------------------------------------------------------------------------

function parseRawCourses(histText: string): RawCourse[] {
  const lines = histText.split("\n");
  const result: RawCourse[] = [];
  let lastCourse: RawCourse | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      lastCourse = null;
      continue;
    }

    // Semester summary lines (skip)
    if (SUMMARY_LINE_RE.test(line)) {
      lastCourse = null;
      continue;
    }

    // Semester block markers (skip — we derive term from course lines directly)
    if (SEMESTER_BLOCK_RE.test(line)) {
      lastCourse = null;
      continue;
    }

    // "PROCESSED AS: XXXX" — annotate the preceding course
    const processedMatch = PROCESSED_AS_RE.exec(line);
    if (processedMatch) {
      if (lastCourse) lastCourse.processedAs = processedMatch[1];
      continue; // keep lastCourse active for possible title continuation
    }

    // Course line
    const m = COURSE_LINE_RE.exec(line);
    if (m) {
      const [, term, dept, num, credStr, grade, flagsStr, titleRest] = m;
      const flags = flagsStr
        .split(/\s+/)
        .filter((f) => /^>[A-Z]$/.test(f));
      const rc: RawCourse = {
        term,
        dept,
        num,
        credits: parseFloat(credStr),
        grade,
        flags,
        title: titleRest.trim(),
      };
      result.push(rc);
      lastCourse = rc;
      continue;
    }

    // Fallback: high school transfer course with no 4-digit course number
    // e.g. 'SP00SPAN3.0HSSpanish'
    const hsm = HS_COURSE_LINE_RE.exec(line);
    if (hsm) {
      const [, term, dept, credStr, grade, flagsStr, titleRest] = hsm;
      const flags = flagsStr
        .split(/\s+/)
        .filter((f) => /^>[A-Z]$/.test(f));
      const rc: RawCourse = {
        term,
        dept,
        num: "HS",
        credits: parseFloat(credStr),
        grade,
        flags,
        title: titleRest.trim(),
      };
      result.push(rc);
      lastCourse = rc;
      continue;
    }

    // Title continuation: the preceding course line had no title (flags filled the line)
    if (lastCourse && !lastCourse.title) {
      lastCourse.title = line;
      continue; // keep lastCourse active for possible PROCESSED AS after
    }

    lastCourse = null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Credit recovery for F-grade courses
// ---------------------------------------------------------------------------

/**
 * Search the full audit text for a non-zero credit value associated with the
 * given course. CU reports 0 earned credits for F grades, but the course
 * appears with its real credit value in requirement sections of the same PDF.
 *
 * Also checks processedAs aliases (e.g. ERTH1010 for a GEOL1010 equivalent).
 */
function findCreditsInFullText(
  text: string,
  dept: string,
  num: string,
  processedAs?: string
): number | undefined {
  const searchPairs: [string, string][] = [[dept, num]];
  if (processedAs) {
    const m = /^([A-Z]{2,5})(\d{4}[A-Z]?)$/.exec(processedAs);
    if (m) searchPairs.push([m[1], m[2]]);
  }

  for (const [d, n] of searchPairs) {
    // Compact coursework format: TERM(4) + DEPT + NUM + credits
    // e.g. "FA03ASTR11103.0A" — finds the same course in another term
    const compactRe = new RegExp(`[A-Z]{2}\\d{2}${d}${n}(\\d+\\.\\d)`, "g");
    for (const m of text.matchAll(compactRe)) {
      const creds = parseFloat(m[1]);
      if (creds > 0) return creds;
    }

    // Spaced format in requirement sections: "DEPT NUM  3.0"
    const spacedRe = new RegExp(`${d}\\s+${n}\\s+(\\d+\\.\\d)`, "g");
    for (const m of text.matchAll(spacedRe)) {
      const creds = parseFloat(m[1]);
      if (creds > 0) return creds;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Header / program info extraction
// ---------------------------------------------------------------------------

function extractProgramInfoFromText(text: string): Partial<ProgramInfo> {
  const info: Partial<ProgramInfo> = {};

  // Student ID: 9-digit number on its own line
  const idMatch = /\b(\d{9})\b/.exec(text);
  if (idMatch) info.studentId = idMatch[1];

  // Cumulative GPA: "342.6POINTS2.763GPA"
  const gpaMatch = /[\d.]+POINTS([\d.]+)GPA/.exec(text);
  if (gpaMatch) info.gpa = parseFloat(gpaMatch[1]);

  // Earned hours: "EARNED:108.0HOURS"
  const earnedMatch = /EARNED:\s*([\d.]+)\s*HOURS/.exec(text);
  if (earnedMatch) info.earnedHours = parseFloat(earnedMatch[1]);

  // In-progress hours: "IN PROGRESS43.0HOURS"
  const inProgMatch = /IN PROGRESS\s*:?\s*([\d.]+)\s*HOURS/.exec(text);
  if (inProgMatch) info.inProgressHours = parseFloat(inProgMatch[1]);

  // CU format: value comes BEFORE the label
  // Prepared date: "04/25/26 - 12:59 AMPREPARED:" → extract date part
  const prepMatch = /([\d/]+ - [\d:]+\s*[AP]M)PREPARED:/.exec(text);
  if (prepMatch) {
    info.preparedDate = prepMatch[1].trim();
  } else {
    // Fallback: "PREPARED: 04/25/2026"
    const prepFallback = /PREPARED[:\s]+([\d/.-]+)/.exec(text);
    if (prepFallback) info.preparedDate = prepFallback[1];
  }

  // Catalog year: "20267CATALOG YEAR:" → extract year (ignore trailing digit noise)
  const catMatch = /(\d{4})\d?CATALOG YEAR:/.exec(text);
  if (catMatch) {
    info.catalogYear = catMatch[1];
  } else {
    const catFallback = /CATALOG YEAR:\s*(\d{4})/.exec(text);
    if (catFallback) info.catalogYear = catFallback[1];
  }

  // Degree name: "Bachelor of Science in Statistics and Data Science" (line before "College of")
  const degreeMatch = /(Bachelor of [^\n]+?)\s*\n/.exec(text);
  if (degreeMatch) info.degreeName = degreeMatch[1].trim();

  // College: "College of Arts and Sciences" 
  const collegeMatch = /(College of [^\n]+?)\s*\n/.exec(text);
  if (collegeMatch) info.college = collegeMatch[1].trim();

  // Student name: "Merino, Anthony" — line before REQUESTED: or after PREPARED:
  const nameMatch = /([A-Z][a-z]+, [A-Z][a-z]+)\s*\n/.exec(text);
  if (nameMatch) info.studentName = nameMatch[1].trim();

  // Program code: "Program: CUBLD, ARSCU, STAT-BA"
  const progMatch = /Program:\s*([^\n]+)/.exec(text);
  if (progMatch) info.programCode = progMatch[1].trim();

  return info;
}

// ---------------------------------------------------------------------------
// Semester ID helpers
// ---------------------------------------------------------------------------

function semesterIdToYear(id: string): number {
  const yy = parseInt(id.slice(2), 10);
  if (isNaN(yy)) return 0;
  return yy <= 50 ? 2000 + yy : 1900 + yy;
}

function semesterIdToLabel(id: string): string {
  const season = id.slice(0, 2);
  const year = semesterIdToYear(id);
  const names: Record<string, string> = { FA: "Fall", SP: "Spring", SU: "Summer", WI: "Winter" };
  return `${names[season] ?? season} ${year}`;
}

function semesterIdToType(id: string): Semester["type"] {
  const season = id.slice(0, 2);
  if (season === "FA") return "fall";
  if (season === "SU") return "summer";
  return "spring"; // SP and WI
}

/** Chronological ordering: earlier → negative, same → 0, later → positive */
function compareSemesterIds(a: string, b: string): number {
  const ya = semesterIdToYear(a);
  const yb = semesterIdToYear(b);
  if (ya !== yb) return ya - yb;
  const order: Record<string, number> = { SP: 0, WI: 0, SU: 1, FA: 2 };
  return (order[a.slice(0, 2)] ?? 0) - (order[b.slice(0, 2)] ?? 0);
}

function determineSemesterStatus(id: string, currentTerm: string): Semester["status"] {
  if (!currentTerm) return "completed";
  const cmp = compareSemesterIds(id, currentTerm);
  if (cmp < 0) return "completed";
  if (cmp === 0) return "in_progress";
  return "registered";
}

/** Convert a prepared date string to an academic term ID like "SP26". */
function preparedDateToTerm(preparedDate: string): string {
  if (!preparedDate) return "";
  // "MM/DD/YY - HH:MM AM/PM"  (CU DARS compact format with 2-digit year + time)
  const slashYY = /^(\d{1,2})\/\d{1,2}\/(\d{2})\s*-/.exec(preparedDate);
  if (slashYY) {
    const yy = parseInt(slashYY[2]);
    const year = yy <= 50 ? 2000 + yy : 1900 + yy;
    return monthYearToTerm(parseInt(slashYY[1]), year);
  }
  // "MM/DD/YYYY"
  const slash = /^(\d{1,2})\/\d{1,2}\/(\d{4})$/.exec(preparedDate);
  if (slash) return monthYearToTerm(parseInt(slash[1]), parseInt(slash[2]));
  // "YYYY-MM-DD"
  const dash = /^(\d{4})-(\d{2})-\d{2}$/.exec(preparedDate);
  if (dash) return monthYearToTerm(parseInt(dash[2]), parseInt(dash[1]));
  return "";
}

function monthYearToTerm(month: number, year: number): string {
  const yy = String(year).slice(-2);
  if (month >= 8) return `FA${yy}`;
  if (month >= 5) return `SU${yy}`;
  return `SP${yy}`;
}

// ---------------------------------------------------------------------------
// LLM call — requirements only
// ---------------------------------------------------------------------------

async function callRequirementsParser(
  config: LLMConfig,
  text: string,
  isRetry = false,
  previousResponse?: string
): Promise<RequirementsResult> {
  const userMessage = isRetry
    ? `Your previous response was not valid JSON. Return ONLY a valid JSON object with no markdown fences or extra text.\n\nPrevious response (first 500 chars): ${(previousResponse ?? "").slice(0, 500)}\n\nAudit text:\n\n${text}`
    : `Extract all degree requirement groups from this degree audit:\n\n${text}`;

  let rawText: string;
  try {
    rawText = await Promise.race([
      callLLM(config, REQUIREMENTS_SYSTEM_PROMPT, userMessage),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("LLM request timed out after 60 seconds")),
          60_000
        )
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      requirementGroups: [],
      warnings: [`LLM API error (requirements call): ${msg}`],
    };
  }

  rawText = rawText.trim();
  const jsonText = extractJSON(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    if (!isRetry) {
      return callRequirementsParser(config, text, true, rawText);
    }
    return {
      requirementGroups: [],
      warnings: [
        `Could not parse requirements LLM response as JSON after retry: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      requirementGroups: [],
      warnings: ["Requirements LLM returned a non-object JSON value"],
    };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = Array.isArray(obj.warnings)
    ? (obj.warnings as string[]).filter((w) => typeof w === "string")
    : [];

  return {
    requirementGroups: normalizeRequirementGroups(obj.requirementGroups, warnings),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Merge step
// ---------------------------------------------------------------------------

function mergeResults(
  courseworkResult: CourseworkResult,
  requirementsResult: RequirementsResult
): ParsedAuditResult {
  const warnings = [...requirementsResult.warnings];

  // Regex courses are authoritative
  const courseMap = new Map<string, Course>();
  for (const course of courseworkResult.courses) {
    courseMap.set(course.id, course);
  }

  // Stub any course IDs referenced by requirement groups that weren't in the audit history
  for (const rg of requirementsResult.requirementGroups) {
    for (const poolId of rg.coursePool) {
      if (!courseMap.has(poolId)) {
        const [dept, num] = poolId.split("-");
        courseMap.set(poolId, {
          id: poolId,
          number: poolId.replace("-", " "),
          name: `${dept ?? ""} ${num ?? ""}`.trim(),
          credits: 0,
          prereqs: null,
          coreqs: null,
          status: "not_started",
        });
      }
    }
  }

  const courses = Array.from(courseMap.values());

  // Rebuild semester map; ensure every course is listed in its semester
  const semesterMap = new Map<string, Semester>();
  for (const sem of courseworkResult.semesters) {
    semesterMap.set(sem.id, sem);
  }
  for (const course of courses) {
    if (course.semester) {
      const sem = semesterMap.get(course.semester);
      if (sem && !sem.courses.includes(course.id)) {
        sem.courses.push(course.id);
      }
    }
  }

  const semesters = Array.from(semesterMap.values()).sort(compareSemesters);

  const programInfo: ProgramInfo = {
    studentName: courseworkResult.programInfo.studentName ?? "",
    studentId: courseworkResult.programInfo.studentId ?? "",
    programCode: courseworkResult.programInfo.programCode ?? "",
    degreeName: courseworkResult.programInfo.degreeName ?? "",
    college: courseworkResult.programInfo.college ?? "",
    catalogYear: courseworkResult.programInfo.catalogYear ?? "",
    preparedDate: courseworkResult.programInfo.preparedDate ?? "",
    earnedHours: courseworkResult.programInfo.earnedHours ?? 0,
    inProgressHours: courseworkResult.programInfo.inProgressHours ?? 0,
    gpa: courseworkResult.programInfo.gpa ?? 0,
  };

  return {
    programInfo,
    requirementGroups: requirementsResult.requirementGroups,
    courses,
    semesters,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeRequirementGroups(raw: unknown, warnings: string[]): RequirementGroup[] {
  if (!Array.isArray(raw)) {
    warnings.push("requirementGroups field is missing or not an array");
    return [];
  }
  const out: RequirementGroup[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id);
    const name = str(o.name);
    const category = str(o.category);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      category,
      type: validGroupType(o.type),
      required: typeof o.required === "number" ? o.required : undefined,
      requiredHours: typeof o.requiredHours === "number" ? o.requiredHours : undefined,
      coursePool: Array.isArray(o.coursePool)
        ? (o.coursePool as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      notes: str(o.notes) || undefined,
      minGrade: str(o.minGrade) || undefined,
    });
  }
  return out;
}

/** Higher score = richer course entry (more data fields populated). */
function courseRichness(c: Course): number {
  let score = 0;
  if (c.name) score++;
  if (c.grade) score++;
  if (c.semester) score++;
  if (c.credits > 0) score++;
  if (c.gradePoints !== undefined) score++;
  return score;
}

// ---------------------------------------------------------------------------
// Small coercion helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function validGroupType(v: unknown): RequirementGroup["type"] {
  if (
    v === "complete_all" ||
    v === "pick_n" ||
    v === "pick_one" ||
    v === "minimum_hours"
  )
    return v;
  return "complete_all";
}

function compareSemesters(a: Semester, b: Semester): number {
  const seasonOrder: Record<string, number> = { spring: 0, summer: 1, fall: 2 };
  if (a.year !== b.year) return a.year - b.year;
  return (seasonOrder[a.type] ?? 0) - (seasonOrder[b.type] ?? 0);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

function emptyProgramInfo(): ProgramInfo {
  return {
    studentName: "",
    studentId: "",
    programCode: "",
    degreeName: "",
    college: "",
    catalogYear: "",
    preparedDate: "",
    earnedHours: 0,
    inProgressHours: 0,
    gpa: 0,
  };
}

function makeErrorResult(message: string): ParsedAuditResult {
  return {
    programInfo: emptyProgramInfo(),
    requirementGroups: [],
    courses: [],
    semesters: [],
    warnings: [message],
  };
}
