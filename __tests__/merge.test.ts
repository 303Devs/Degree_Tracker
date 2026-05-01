/**
 * Tests for mergeAuditData in lib/data.ts.
 *
 * Uses vi.mock to intercept fs operations so tests don't touch real data.
 * This validates the merge LOGIC independent of the file system layout.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Course, RequirementGroup, Semester, ProgramInfo } from "../lib/types";

// ---------------------------------------------------------------------------
// In-memory file system mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => {
        if (p.endsWith("/data")) return true;
        return p in store;
      },
      mkdirSync: () => {},
      readFileSync: (p: string) => {
        if (p in store) return store[p];
        throw new Error(`ENOENT: ${p}`);
      },
      writeFileSync: (p: string, content: string) => {
        store[p] = content;
      },
    },
  };
});

function storeJson(filename: string, data: unknown) {
  // mergeAuditData uses path.join(process.cwd(), "data", filename)
  const key = `${process.cwd()}/data/${filename}`;
  store[key] = JSON.stringify(data);
}

function loadJson<T>(filename: string): T {
  const key = `${process.cwd()}/data/${filename}`;
  return JSON.parse(store[key]) as T;
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & { id: string }): Course {
  return {
    number: overrides.id.replace("-", " "),
    name: `Course ${overrides.id}`,
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "completed",
    ...overrides,
  };
}

function makeSemester(id: string, courses: string[] = []): Semester {
  const season = id.slice(0, 2);
  const yy = parseInt(id.slice(2));
  const year = yy <= 50 ? 2000 + yy : 1900 + yy;
  return {
    id,
    label: `${season === "FA" ? "Fall" : "Spring"} ${year}`,
    type: season === "FA" ? "fall" : "spring",
    year,
    status: "completed",
    courses,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mergeAuditData", () => {
  it("adds new courses to empty data", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", []);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-3100", grade: "A", semester: "FA25" })],
      requirements: [],
      semesters: [makeSemester("FA25", ["STAT-3100"])],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.length).toBe(1);
    expect(courses[0].id).toBe("STAT-3100");
    expect(courses[0].grade).toBe("A");
  });

  it("preserves user-set prereqs on re-upload", async () => {
    const { mergeAuditData } = await import("../lib/data");

    const existingPrereqs = { type: "course" as const, courseId: "MATH-1300" };
    storeJson("courses.json", [
      makeCourse({ id: "STAT-3100", prereqs: existingPrereqs, grade: "B" }),
    ]);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-3100", prereqs: null, grade: "A" })],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    const stat = courses.find((c) => c.id === "STAT-3100")!;
    expect(stat.prereqs).toEqual(existingPrereqs);
    expect(stat.grade).toBe("A");
  });

  it("audit status overrides existing when not 'not_started'", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", [
      makeCourse({ id: "STAT-3100", status: "not_started" }),
    ]);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-3100", status: "in_progress" })],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.find((c) => c.id === "STAT-3100")!.status).toBe("in_progress");
  });

  it("preserves existing status when new status is 'not_started'", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", [
      makeCourse({ id: "STAT-3100", status: "completed", grade: "A" }),
    ]);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-3100", status: "not_started" })],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.find((c) => c.id === "STAT-3100")!.status).toBe("completed");
  });

  it("preserves enriched name when new course is a stub", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", [
      makeCourse({ id: "STAT-4250", name: "Applied Regression" }),
    ]);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-4250", name: "STAT 4250", credits: 0 })],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.find((c) => c.id === "STAT-4250")!.name).toBe("Applied Regression");
  });

  it("preserves enriched credits when new course has 0", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", [
      makeCourse({ id: "STAT-4250", credits: 3 }),
    ]);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [makeCourse({ id: "STAT-4250", credits: 0 })],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.find((c) => c.id === "STAT-4250")!.credits).toBe(3);
  });

  it("replaces requirement groups by category", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", []);
    storeJson("requirements.json", [
      {
        id: "core-calc",
        name: "Calculus",
        category: "Core",
        type: "complete_all",
        coursePool: ["MATH-1300"],
      },
      {
        id: "electives-ud",
        name: "Upper Division",
        category: "Electives",
        type: "pick_n",
        required: 4,
        coursePool: ["STAT-4250"],
      },
    ]);
    storeJson("semesters.json", []);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [],
      requirements: [
        {
          id: "core-calc-v2",
          name: "Calculus v2",
          category: "Core",
          type: "complete_all",
          coursePool: ["MATH-1300", "MATH-2300"],
        },
      ],
      semesters: [],
      programs: [],
    });

    const reqs = loadJson<RequirementGroup[]>("requirements.json");
    expect(reqs.length).toBe(2);
    expect(reqs.find((r) => r.category === "Core")!.id).toBe("core-calc-v2");
    expect(reqs.find((r) => r.category === "Electives")!.id).toBe("electives-ud");
  });

  it("merges semesters by ID without duplicating courses", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", []);
    storeJson("requirements.json", []);
    storeJson("semesters.json", [
      makeSemester("FA25", ["STAT-3100", "MATH-1300"]),
    ]);
    storeJson("programs.json", []);

    mergeAuditData({
      courses: [],
      requirements: [],
      semesters: [makeSemester("FA25", ["STAT-3100", "ENGL-1010"])],
      programs: [],
    });

    const sems = loadJson<Semester[]>("semesters.json");
    const fa25 = sems.find((s) => s.id === "FA25")!;
    expect(fa25.courses.sort()).toEqual(["ENGL-1010", "MATH-1300", "STAT-3100"]);
  });

  it("replaces programs by programCode", async () => {
    const { mergeAuditData } = await import("../lib/data");

    storeJson("courses.json", []);
    storeJson("requirements.json", []);
    storeJson("semesters.json", []);
    storeJson("programs.json", [
      {
        studentName: "Test",
        studentId: "123456789",
        programCode: "STAT-BA",
        degreeName: "Old Name",
        college: "",
        catalogYear: "2025",
        preparedDate: "",
        earnedHours: 100,
        inProgressHours: 0,
        gpa: 3.0,
      },
    ]);

    mergeAuditData({
      courses: [],
      requirements: [],
      semesters: [],
      programs: [
        {
          studentName: "Test",
          studentId: "123456789",
          programCode: "STAT-BA",
          degreeName: "New Name",
          college: "",
          catalogYear: "2025",
          preparedDate: "",
          earnedHours: 108,
          inProgressHours: 0,
          gpa: 3.1,
        },
      ],
    });

    const progs = loadJson<ProgramInfo[]>("programs.json");
    expect(progs.length).toBe(1);
    expect(progs[0].degreeName).toBe("New Name");
    expect(progs[0].earnedHours).toBe(108);
  });
});
