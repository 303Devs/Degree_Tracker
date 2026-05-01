/**
 * Tests for merge semantics with source-aware provenance (Task 5).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Course, RequirementGroup } from "../lib/types";

// ---------------------------------------------------------------------------
// In-memory file system mock (same pattern as merge.test.ts)
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
  const key = `${process.cwd()}/data/${filename}`;
  store[key] = JSON.stringify(data);
}

function loadJson<T>(filename: string): T {
  const key = `${process.cwd()}/data/${filename}`;
  return JSON.parse(store[key]) as T;
}

function initEmpty() {
  storeJson("courses.json", []);
  storeJson("requirements.json", []);
  storeJson("semesters.json", []);
  storeJson("programs.json", []);
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("merge — source-aware provenance", () => {
  it("manually-added courses survive re-upload", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    // User manually adds a course
    storeJson("courses.json", [
      makeCourse({
        id: "PHYS-2170",
        name: "Foundations of Modern Physics",
        source: "manual",
        manuallyAdded: true,
        status: "planned",
        semester: "FA27",
      }),
    ]);

    // Re-upload audit with a stub for same course
    mergeAuditData({
      courses: [
        makeCourse({
          id: "PHYS-2170",
          name: "PHYS 2170",
          source: "stub",
          status: "not_started",
          credits: 0,
        }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    const phys = courses.find((c) => c.id === "PHYS-2170")!;
    // Manual course is untouched
    expect(phys.source).toBe("manual");
    expect(phys.name).toBe("Foundations of Modern Physics");
    expect(phys.semester).toBe("FA27");
    expect(phys.status).toBe("planned");
    expect(phys.manuallyAdded).toBe(true);
  });

  it("audit source overwrites stub source", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    storeJson("courses.json", [
      makeCourse({
        id: "STAT-3100",
        name: "Intro to Stats",
        source: "stub",
        credits: 0,
        status: "not_started",
      }),
    ]);

    mergeAuditData({
      courses: [
        makeCourse({
          id: "STAT-3100",
          name: "Intro to Theory of Stats",
          source: "audit",
          credits: 3,
          grade: "A",
          status: "completed",
          semester: "FA25",
        }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    const stat = courses.find((c) => c.id === "STAT-3100")!;
    expect(stat.source).toBe("audit");
    expect(stat.name).toBe("Intro to Theory of Stats");
    expect(stat.credits).toBe(3);
    expect(stat.grade).toBe("A");
    expect(stat.status).toBe("completed");
  });

  it("audit re-upload preserves enriched name/credits from scraper", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    storeJson("courses.json", [
      makeCourse({
        id: "STAT-4250",
        name: "Applied Regression Analysis",
        source: "enriched",
        credits: 3,
        prereqs: { type: "course", courseId: "STAT-3100" },
      }),
    ]);

    // Audit re-upload has stub data for this course
    mergeAuditData({
      courses: [
        makeCourse({
          id: "STAT-4250",
          name: "STAT 4250",
          source: "stub",
          credits: 0,
          status: "not_started",
        }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    const stat = courses.find((c) => c.id === "STAT-4250")!;
    // Enriched data preserved
    expect(stat.name).toBe("Applied Regression Analysis");
    expect(stat.credits).toBe(3);
    // User-set prereqs preserved
    expect(stat.prereqs).toEqual({ type: "course", courseId: "STAT-3100" });
  });

  it("preserves manuallyAdded flag through re-upload", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    storeJson("courses.json", [
      makeCourse({
        id: "CSCI-3002",
        manuallyAdded: true,
        source: "manual",
      }),
    ]);

    // Manual source is protected — audit can't overwrite
    mergeAuditData({
      courses: [
        makeCourse({ id: "CSCI-3002", source: "audit", status: "not_started" }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses.find((c) => c.id === "CSCI-3002")!.manuallyAdded).toBe(true);
    expect(courses.find((c) => c.id === "CSCI-3002")!.source).toBe("manual");
  });

  it("new courses from audit get source='audit' if not already present", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    mergeAuditData({
      courses: [
        makeCourse({ id: "STAT-3100", source: "audit", grade: "A" }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    expect(courses[0].source).toBe("audit");
  });

  it("legacy manual courses with manuallyAdded=true but no source field survive re-upload", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    // Simulate a legacy course: manuallyAdded=true but NO source field
    storeJson("courses.json", [
      makeCourse({
        id: "PHYS-1110",
        name: "Physics 1",
        manuallyAdded: true,
        // source deliberately omitted — legacy data
        status: "planned",
        semester: "SP27",
        credits: 4,
      }),
    ]);

    // Re-upload audit with actual audit data for same course
    mergeAuditData({
      courses: [
        makeCourse({
          id: "PHYS-1110",
          name: "General Physics 1",
          source: "audit",
          status: "completed",
          credits: 4,
          grade: "B+",
          semester: "FA26",
        }),
      ],
      requirements: [],
      semesters: [],
      programs: [],
    });

    const courses = loadJson<Course[]>("courses.json");
    const phys = courses.find((c) => c.id === "PHYS-1110")!;
    // Legacy manual course must be preserved — audit should NOT clobber it
    expect(phys.name).toBe("Physics 1");
    expect(phys.semester).toBe("SP27");
    expect(phys.status).toBe("planned");
    expect(phys.credits).toBe(4);
    expect(phys.manuallyAdded).toBe(true);
  });

  it("requirement selectedCourses are preserved on re-upload", async () => {
    const { mergeAuditData } = await import("../lib/data");
    initEmpty();

    // User has selected courses in a pick_n requirement group
    storeJson("requirements.json", [
      {
        id: "electives-ud",
        name: "Upper Division Electives",
        category: "Electives",
        type: "pick_n",
        required: 3,
        coursePool: ["STAT-4250", "STAT-4520", "STAT-4610", "STAT-4630"],
        selectedCourses: ["STAT-4250", "STAT-4520", "STAT-4610"],
      },
      {
        id: "core-req",
        name: "Core Math",
        category: "Core",
        type: "complete_all",
        coursePool: ["MATH-1300"],
        selectedCourses: [],
      },
    ]);

    // Re-upload audit updates the Electives category
    mergeAuditData({
      courses: [],
      requirements: [
        {
          id: "electives-ud-v2",
          name: "Upper Division Electives v2",
          category: "Electives",
          type: "pick_n",
          required: 3,
          coursePool: ["STAT-4250", "STAT-4520", "STAT-4610", "STAT-4630", "STAT-4840"],
          // No selectedCourses from audit
        },
      ],
      semesters: [],
      programs: [],
    });

    const reqs = loadJson<RequirementGroup[]>("requirements.json");
    const electives = reqs.find((r) => r.category === "Electives")!;
    // The new group should have the updated pool but preserve user selections
    // (only selections that still exist in the new pool)
    expect(electives.coursePool).toContain("STAT-4840");
    expect(electives.selectedCourses).toEqual(
      expect.arrayContaining(["STAT-4250", "STAT-4520", "STAT-4610"])
    );
    // Core category should be untouched
    expect(reqs.find((r) => r.category === "Core")!.id).toBe("core-req");
  });
});
