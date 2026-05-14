import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldOverride, ManualEntity, RequirementGroup } from "../lib/types";

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
  return new Request("http://localhost/api/requirements", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function requirement(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.name ?? `Requirement ${overrides.id}`,
    category: overrides.category ?? "Major",
    type: overrides.type ?? "complete_all",
    required: overrides.required,
    requiredHours: overrides.requiredHours,
    coursePool: overrides.coursePool ?? ["CSCI-1300"],
    selectedCourses: overrides.selectedCourses,
    notes: overrides.notes,
    minGrade: overrides.minGrade,
  };
}

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("requirements.json", [requirement({ id: "REQ-1", name: "Base requirement", coursePool: ["CSCI-1300", "MATH-1300"] })]);
  storeJson("courses.json", []);
  storeJson("semesters.json", []);
  storeJson("programs.json", []);
  storeJson("edit-state.json", { overrides: [], manualEntities: [], localStates: [] });
});

describe("requirement edit API MVP", () => {
  it("returns effective requirements from GET", async () => {
    storeJson("edit-state.json", {
      overrides: [{ id: "override-name", entityType: "requirement", entityId: "REQ-1", field: "name", value: "Effective requirement", baseSource: "audit", createdAt: "now", updatedAt: "now" }],
      manualEntities: [],
      localStates: [],
    });
    const { GET } = await import("../app/api/requirements/route");
    const response = await GET();
    const json = await response.json();
    expect(json[0].name).toBe("Effective requirement");
  });

  it("creates manual requirements in edit state", async () => {
    const { POST } = await import("../app/api/requirements/route");
    const response = await POST(request({ id: "MANUAL-REQ", name: "Manual", category: "Custom", type: "pick_one", coursePool: ["CSCI-1300"], selectedCourses: ["CSCI-1300"] }) as never);
    expect(response.status).toBe(201);
    const state = loadJson<{ manualEntities: ManualEntity[] }>("edit-state.json");
    expect(state.manualEntities).toHaveLength(1);
    expect(state.manualEntities[0].value).toMatchObject({ id: "MANUAL-REQ", name: "Manual" });
  });

  it("updates manual requirements directly", async () => {
    storeJson("edit-state.json", { overrides: [], manualEntities: [{ id: "manual-requirement-MANUAL-REQ", entityType: "requirement", value: requirement({ id: "MANUAL-REQ", name: "Manual" }), provenance: { source: "manual" } }], localStates: [] });
    const { PATCH } = await import("../app/api/requirements/[id]/route");
    const response = await PATCH(request({ name: "Manual updated", coursePool: ["CSCI-1300", "MATH-1300"] }) as never, params("MANUAL-REQ"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.name).toBe("Manual updated");
    const state = loadJson<{ manualEntities: ManualEntity[]; overrides: FieldOverride[] }>("edit-state.json");
    expect(state.manualEntities[0].value.name).toBe("Manual updated");
    expect(state.overrides).toEqual([]);
  });

  it("updates audit requirements through overrides without mutating base", async () => {
    const { PATCH } = await import("../app/api/requirements/[id]/route");
    const response = await PATCH(request({ name: "Override requirement", coursePool: ["CSCI-1300"], selectedCourses: ["CSCI-1300"] }) as never, params("REQ-1"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({ name: "Override requirement", coursePool: ["CSCI-1300"], selectedCourses: ["CSCI-1300"] });
    expect(loadJson<RequirementGroup[]>("requirements.json")[0].name).toBe("Base requirement");
    const state = loadJson<{ overrides: FieldOverride[] }>("edit-state.json");
    expect(state.overrides.map((override) => override.field)).toEqual(expect.arrayContaining(["name", "coursePool", "selectedCourses"]));
  });

  it("deletes manual requirements and rejects audit delete", async () => {
    storeJson("edit-state.json", { overrides: [], manualEntities: [{ id: "manual-requirement-MANUAL-REQ", entityType: "requirement", value: requirement({ id: "MANUAL-REQ" }), provenance: { source: "manual" } }], localStates: [] });
    const { DELETE } = await import("../app/api/requirements/[id]/route");
    expect((await DELETE(new Request("http://localhost") as never, params("REQ-1"))).status).toBe(400);
    expect((await DELETE(new Request("http://localhost") as never, params("MANUAL-REQ"))).status).toBe(200);
    expect(loadJson<{ manualEntities: ManualEntity[] }>("edit-state.json").manualEntities).toEqual([]);
  });

  it("resets one field or all audit requirement overrides", async () => {
    const { PATCH } = await import("../app/api/requirements/[id]/route");
    const { POST: RESET } = await import("../app/api/requirements/[id]/reset/route");
    await PATCH(request({ name: "Override requirement", notes: "local" }) as never, params("REQ-1"));
    const one = await RESET(request({ field: "name" }) as never, params("REQ-1"));
    expect(await one.json()).toMatchObject({ name: "Base requirement", notes: "local" });
    const all = await RESET(request({ all: true }) as never, params("REQ-1"));
    const allJson = await all.json();
    expect(allJson).toMatchObject({ name: "Base requirement" });
    expect(allJson).not.toHaveProperty("notes");
    expect(loadJson<{ overrides: FieldOverride[] }>("edit-state.json").overrides).toEqual([]);
  });

  it("validates unknown fields, type rules, dash IDs, and selection constraints", async () => {
    const { PATCH } = await import("../app/api/requirements/[id]/route");
    expect((await PATCH(request({ id: "NEW" }) as never, params("REQ-1"))).status).toBe(400);
    expect((await PATCH(request({ name: "" }) as never, params("REQ-1"))).status).toBe(400);
    expect((await PATCH(request({ type: "pick_n", required: 1, coursePool: ["CSCI 1300"] }) as never, params("REQ-1"))).status).toBe(400);
    expect((await PATCH(request({ selectedCourses: ["PHYS-1111"] }) as never, params("REQ-1"))).status).toBe(400);
    expect((await PATCH(request({ type: "pick_one", selectedCourses: ["CSCI-1300", "MATH-1300"] }) as never, params("REQ-1"))).status).toBe(400);
  });
});
