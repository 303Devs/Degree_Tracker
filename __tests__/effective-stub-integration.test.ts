import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, FieldOverride, ManualEntity, RequirementGroup } from "../lib/types";

const store: Record<string, string> = {};

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => p.endsWith("/data") || p in store,
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

function key(filename: string): string {
  return `${process.cwd()}/data/${filename}`;
}
function storeJson(filename: string, data: unknown): void {
  store[key(filename)] = JSON.stringify(data);
}
function loadJson<T>(filename: string): T {
  return JSON.parse(store[key(filename)] ?? "null") as T;
}
function requirement(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.name ?? `Requirement ${overrides.id}`,
    category: overrides.category ?? "Major",
    type: overrides.type ?? "complete_all",
    coursePool: overrides.coursePool ?? [],
    selectedCourses: overrides.selectedCourses,
    ...overrides,
  };
}

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("courses.json", []);
  storeJson("requirements.json", [requirement({ id: "REQ-1", coursePool: ["CSCI-1300"] })]);
  storeJson("semesters.json", []);
  storeJson("programs.json", []);
  storeJson("edit-state.json", { overrides: [], manualEntities: [], localStates: [] });
});

describe("effective requirement references create course stubs", () => {
  it("uses requirement coursePool overrides when ensuring referenced course stubs", async () => {
    storeJson("edit-state.json", {
      overrides: [
        {
          id: "requirement-REQ-1-coursePool",
          entityType: "requirement",
          entityId: "REQ-1",
          field: "coursePool",
          value: ["CSCI-1300", "MATH-2400"],
          baseValue: ["CSCI-1300"],
          baseSource: "audit",
          createdAt: "now",
          updatedAt: "now",
        } satisfies FieldOverride,
      ],
      manualEntities: [],
      localStates: [],
    });
    const { ensureReferencedCourseStubs } = await import("../lib/data");

    expect(ensureReferencedCourseStubs()).toEqual({ added: 2 });
    expect(loadJson<Course[]>("courses.json").map((course) => course.id).sort()).toEqual(["CSCI-1300", "MATH-2400"]);
  });

  it("uses manual requirement coursePool references when ensuring referenced course stubs", async () => {
    const manualRequirement = requirement({ id: "MANUAL-REQ", coursePool: ["PHYS-2170"] });
    const manualEntities: ManualEntity[] = [
      { id: "manual-requirement-MANUAL-REQ", entityType: "requirement", value: manualRequirement, provenance: { source: "manual" } },
    ];
    storeJson("edit-state.json", { overrides: [], manualEntities, localStates: [] });
    const { ensureReferencedCourseStubs } = await import("../lib/data");

    expect(ensureReferencedCourseStubs()).toEqual({ added: 2 });
    expect(loadJson<Course[]>("courses.json").map((course) => course.id).sort()).toEqual(["CSCI-1300", "PHYS-2170"]);
  });
});
