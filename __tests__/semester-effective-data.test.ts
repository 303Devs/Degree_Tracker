import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, FieldOverride, Semester } from "../lib/types";

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
function course(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.number ?? overrides.id.replace("-", " "),
    name: overrides.name ?? `Course ${overrides.id}`,
    credits: overrides.credits ?? 3,
    prereqs: null,
    coreqs: null,
    status: overrides.status ?? "planned",
    source: overrides.source ?? "audit",
    ...overrides,
  };
}
function semester(id: string, label: string): Semester {
  return { id, label, type: "fall", year: 2027, status: "planned", courses: [] };
}

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("courses.json", [course({ id: "CSCI-1300", semester: "FA27" })]);
  storeJson("requirements.json", []);
  storeJson("semesters.json", [semester("FA27", "Fall 2027"), semester("SP28", "Spring 2028")]);
  storeJson("programs.json", []);
  storeJson("edit-state.json", {
    overrides: [
      {
        id: "course-CSCI-1300-semester",
        entityType: "course",
        entityId: "CSCI-1300",
        field: "semester",
        value: "SP28",
        baseValue: "FA27",
        baseSource: "audit",
        createdAt: "now",
        updatedAt: "now",
      } satisfies FieldOverride,
    ],
    manualEntities: [],
    localStates: [],
  });
});

describe("semester effective-data integration", () => {
  it("derives API semester course membership and details from effective course edits", async () => {
    const { GET } = await import("../app/api/semesters/route");

    const response = await GET();
    const json = await response.json() as Array<Semester & { courseDetails: Course[] }>;

    expect(json.find((s) => s.id === "FA27")?.courses).toEqual([]);
    expect(json.find((s) => s.id === "SP28")?.courses).toEqual(["CSCI-1300"]);
    expect(json.find((s) => s.id === "SP28")?.courseDetails[0]).toMatchObject({ id: "CSCI-1300", semester: "SP28" });
  });

  it("derives readAppData semesters from effective course edits", async () => {
    const { readAppData } = await import("../lib/data");

    const appData = readAppData();

    expect(appData.semesters.find((s) => s.id === "FA27")?.courses).toEqual([]);
    expect(appData.semesters.find((s) => s.id === "SP28")?.courses).toEqual(["CSCI-1300"]);
    expect(appData.courses[0]).toMatchObject({ id: "CSCI-1300", semester: "SP28" });
  });
});
