import fs from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, FieldOverride, ManualEntity, RequirementGroup } from "../lib/types";

const store: Record<string, string> = {};

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => p.endsWith("/data") || p in store || actual.existsSync(p),
      mkdirSync: () => {},
      readFileSync: (p: string, options?: BufferEncoding | { encoding?: BufferEncoding } | null) => {
        if (p in store) return store[p];
        return actual.readFileSync(p, options as never);
      },
      writeFileSync: (p: string, content: string) => {
        store[p] = content;
      },
    },
  };
});

function key(filename: string): string {
  return `${process.cwd()}/data/${filename}`;
}
function storeJson(filename: string, data: unknown): void {
  store[key(filename)] = JSON.stringify(data);
}
function readSource(path: string): string {
  return fs.readFileSync(path, "utf-8");
}
function course(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.number ?? overrides.id.replace("-", " "),
    name: overrides.name ?? `Course ${overrides.id}`,
    credits: overrides.credits ?? 3,
    prereqs: null,
    coreqs: null,
    status: overrides.status ?? "not_started",
    source: overrides.source ?? "audit",
    ...overrides,
  };
}
function requirement(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.name ?? `Requirement ${overrides.id}`,
    category: overrides.category ?? "Major",
    type: overrides.type ?? "complete_all",
    coursePool: overrides.coursePool ?? [],
    ...overrides,
  };
}

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("courses.json", [course({ id: "CSCI-1300", name: "Base CS", credits: 3, semester: "FA27" })]);
  storeJson("requirements.json", [requirement({ id: "REQ-1", name: "Base requirement", coursePool: ["CSCI-1300"] })]);
  storeJson("semesters.json", [{ id: "FA27", label: "Fall 2027", type: "fall", year: 2027, status: "planned", courses: [] }]);
  storeJson("programs.json", []);
  const manualRequirement = requirement({ id: "MANUAL-REQ", name: "Manual requirement", coursePool: ["MATH-2400"] });
  const editState = {
    overrides: [
      {
        id: "course-CSCI-1300-name",
        entityType: "course",
        entityId: "CSCI-1300",
        field: "name",
        value: "Edited CS",
        baseValue: "Base CS",
        baseSource: "audit",
        createdAt: "now",
        updatedAt: "now",
      } satisfies FieldOverride,
      {
        id: "course-CSCI-1300-credits",
        entityType: "course",
        entityId: "CSCI-1300",
        field: "credits",
        value: 4,
        baseValue: 3,
        baseSource: "audit",
        createdAt: "now",
        updatedAt: "now",
      } satisfies FieldOverride,
      {
        id: "requirement-REQ-1-name",
        entityType: "requirement",
        entityId: "REQ-1",
        field: "name",
        value: "Edited requirement",
        baseValue: "Base requirement",
        baseSource: "audit",
        createdAt: "now",
        updatedAt: "now",
      } satisfies FieldOverride,
    ],
    manualEntities: [
      { id: "manual-requirement-MANUAL-REQ", entityType: "requirement", value: manualRequirement, provenance: { source: "manual" } } satisfies ManualEntity,
    ],
    localStates: [],
  };
  storeJson("edit-state.json", editState);
});

describe("Phase 5 effective-data QA", () => {
  it("course and requirement APIs expose edited/manual effective data for UI consumers", async () => {
    const { GET: getCourses } = await import("../app/api/courses/route");
    const { GET: getRequirements } = await import("../app/api/requirements/route");

    const courses = await (await getCourses()).json() as Course[];
    const requirements = await (await getRequirements()).json() as RequirementGroup[];

    expect(courses.find((item) => item.id === "CSCI-1300")).toMatchObject({ name: "Edited CS", credits: 4 });
    expect(requirements.find((item) => item.id === "REQ-1")).toMatchObject({ name: "Edited requirement" });
    expect(requirements.find((item) => item.id === "MANUAL-REQ")).toMatchObject({ name: "Manual requirement", coursePool: ["MATH-2400"] });
  });

  it("primary read surfaces are wired to effective course and requirement APIs", () => {
    const surfaces = {
      auditDashboard: readSource("components/audit-dashboard/AuditDashboard.tsx"),
      planner: readSource("components/PlannerWorkspace.tsx"),
      gpa: readSource("app/gpa/page.tsx"),
      courseLibrary: readSource("components/CourseLibraryWorkspace.tsx"),
      requirements: readSource("components/RequirementsWorkspace.tsx"),
      uncountedProgress: readSource("app/uncounted/page.tsx"),
    };

    for (const [name, source] of Object.entries(surfaces)) {
      expect(source, `${name} should read effective courses`).toContain("/api/courses");
    }
    for (const [name, source] of Object.entries(surfaces)) {
      if (name === "uncountedProgress" || name === "gpa" || name === "auditDashboard" || name === "planner" || name === "courseLibrary" || name === "requirements") {
        expect(source, `${name} should read effective requirements`).toContain("/api/requirements");
      }
    }
  });

  it("app-data composite reads effective courses, effective requirements, and effective semester derivations", async () => {
    const { readAppData } = await import("../lib/data");

    const appData = readAppData();

    expect(appData.courses.find((item) => item.id === "CSCI-1300")).toMatchObject({ name: "Edited CS", credits: 4 });
    expect(appData.requirements.find((item) => item.id === "REQ-1")).toMatchObject({ name: "Edited requirement" });
    expect(appData.requirements.find((item) => item.id === "MANUAL-REQ")).toBeTruthy();
    expect(appData.semesters.find((item) => item.id === "FA27")?.courses).toEqual(["CSCI-1300"]);
  });
});
