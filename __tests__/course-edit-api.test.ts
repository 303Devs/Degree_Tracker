import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, FieldOverride, ManualEntity } from "../lib/types";

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

function request(body: unknown): Request {
  return new Request("http://localhost/api/courses", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
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

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("courses.json", [course({ id: "CSCI-1300", name: "Computer Science 1", credits: 3, source: "audit" })]);
  storeJson("requirements.json", []);
  storeJson("semesters.json", []);
  storeJson("programs.json", []);
  storeJson("edit-state.json", { overrides: [], manualEntities: [], localStates: [] });
});

describe("course edit API MVP", () => {
  it("creates manual courses in dedicated edit state", async () => {
    const { POST } = await import("../app/api/courses/route");

    const response = await POST(request({ id: "MATH-9999", number: "MATH 9999", name: "Manual Math", credits: 4 }) as never);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toMatchObject({ id: "MATH-9999", source: "manual", manuallyAdded: true });
    const state = loadJson<{ manualEntities: ManualEntity[] }>("edit-state.json");
    expect(state.manualEntities).toHaveLength(1);
    expect(state.manualEntities[0].value).toMatchObject({ id: "MATH-9999", name: "Manual Math" });
    expect(loadJson<Course[]>("courses.json")).toHaveLength(1);
  });

  it("updates manual courses by changing the ManualEntity value directly", async () => {
    storeJson("edit-state.json", {
      overrides: [],
      manualEntities: [{ id: "manual-course-MATH-9999", entityType: "course", value: course({ id: "MATH-9999", source: "manual", manuallyAdded: true }), provenance: { source: "manual" } }],
      localStates: [],
    });
    const { PATCH } = await import("../app/api/courses/[id]/route");

    const response = await PATCH(request({ name: "Updated Manual", credits: 5 }) as never, params("MATH-9999"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ id: "MATH-9999", name: "Updated Manual", credits: 5, source: "manual" });
    const state = loadJson<{ manualEntities: ManualEntity[]; overrides: FieldOverride[] }>("edit-state.json");
    expect(state.manualEntities[0].value).toMatchObject({ name: "Updated Manual", credits: 5 });
    expect(state.overrides).toEqual([]);
  });

  it("updates audit-sourced courses by writing field overrides without mutating base data", async () => {
    const { PATCH } = await import("../app/api/courses/[id]/route");

    const response = await PATCH(request({ name: "Intro CS", credits: 4 }) as never, params("CSCI-1300"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ id: "CSCI-1300", name: "Intro CS", credits: 4 });
    expect(loadJson<Course[]>("courses.json")[0]).toMatchObject({ name: "Computer Science 1", credits: 3 });
    const state = loadJson<{ overrides: FieldOverride[] }>("edit-state.json");
    expect(state.overrides.map((override) => [override.field, override.value])).toEqual(expect.arrayContaining([["name", "Intro CS"], ["credits", 4]]));
  });

  it("rejects excluded or invalid fields", async () => {
    const { PATCH } = await import("../app/api/courses/[id]/route");

    expect((await PATCH(request({ prereqs: null }) as never, params("CSCI-1300"))).status).toBe(400);
    expect((await PATCH(request({ credits: -1 }) as never, params("CSCI-1300"))).status).toBe(400);
    expect((await PATCH(request({}) as never, params("CSCI-1300"))).status).toBe(400);
  });

  it("deletes manual courses and rejects audit-sourced destructive delete", async () => {
    storeJson("edit-state.json", {
      overrides: [],
      manualEntities: [{ id: "manual-course-MATH-9999", entityType: "course", value: course({ id: "MATH-9999", source: "manual", manuallyAdded: true }), provenance: { source: "manual" } }],
      localStates: [],
    });
    const { DELETE } = await import("../app/api/courses/[id]/route");

    expect((await DELETE(new Request("http://localhost") as never, params("CSCI-1300"))).status).toBe(400);
    expect((await DELETE(new Request("http://localhost") as never, params("MATH-9999"))).status).toBe(200);
    expect(loadJson<{ manualEntities: ManualEntity[] }>("edit-state.json").manualEntities).toEqual([]);
  });

  it("resets one field or all overrides for audit-sourced courses", async () => {
    const { PATCH } = await import("../app/api/courses/[id]/route");
    const { POST: RESET } = await import("../app/api/courses/[id]/reset/route");

    await PATCH(request({ name: "Intro CS", credits: 4 }) as never, params("CSCI-1300"));
    const one = await RESET(request({ field: "name" }) as never, params("CSCI-1300"));
    expect(await one.json()).toMatchObject({ name: "Computer Science 1", credits: 4 });

    const all = await RESET(request({ all: true }) as never, params("CSCI-1300"));
    expect(await all.json()).toMatchObject({ name: "Computer Science 1", credits: 3 });
    expect(loadJson<{ overrides: FieldOverride[] }>("edit-state.json").overrides).toEqual([]);
  });
});
