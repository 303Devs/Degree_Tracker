import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, FieldOverride, ParsedAuditResult, RequirementGroup } from "../lib/types";

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

vi.mock("../lib/parser", () => ({ parseAuditPDF: vi.fn() }));

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
  return new Request("http://localhost/api/audit/confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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
function audit(): ParsedAuditResult {
  return {
    programInfo: {
      studentName: "Student",
      studentId: "1",
      programCode: "PROG",
      degreeName: "Degree",
      college: "College",
      catalogYear: "2026",
      preparedDate: "2026-01-01",
      earnedHours: 0,
      inProgressHours: 0,
      gpa: 0,
    },
    requirementGroups: [requirement({ id: "REQ-1", name: "Incoming", coursePool: ["CSCI-1300"] })],
    courses: [course({ id: "CSCI-1300", name: "Incoming" })],
    semesters: [],
    warnings: [],
  };
}

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("courses.json", [course({ id: "CSCI-1300", name: "Base" })]);
  storeJson("requirements.json", [requirement({ id: "REQ-1", name: "Base", coursePool: ["CSCI-1300"] })]);
  storeJson("semesters.json", []);
  storeJson("programs.json", []);
  storeJson("edit-state.json", {
    overrides: [{ id: "course-CSCI-1300-name", entityType: "course", entityId: "CSCI-1300", field: "name", value: "Edited", baseValue: "Base", baseSource: "audit", createdAt: "now", updatedAt: "now" } satisfies FieldOverride],
    manualEntities: [],
    localStates: [{ entityType: "dashboardAction", entityId: "remaining-REQ-1", dismissed: true, updatedAt: "now" }],
  });
});

describe("audit confirm re-import trust API", () => {
  it("rejects reset-all without explicit confirmation", async () => {
    const { POST } = await import("../app/api/audit/confirm/route");

    const response = await POST(request({ audit: audit(), reimport: { mode: "reset_all" } }) as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("explicit confirmation");
    expect(loadJson<{ overrides: unknown[] }>("edit-state.json").overrides).toHaveLength(1);
  });

  it("applies preserve decisions by clearing only conflicts resolved to new audit", async () => {
    const { POST } = await import("../app/api/audit/confirm/route");

    const response = await POST(request({
      audit: audit(),
      reimport: { mode: "preserve", decisions: [{ conflictId: "course:CSCI-1300:name", resolution: "use_new_audit" }] },
    }) as never);

    expect(response.status).toBe(200);
    const editState = loadJson<{ overrides: unknown[]; localStates: unknown[] }>("edit-state.json");
    expect(editState.overrides).toEqual([]);
    expect(editState.localStates).toEqual([expect.objectContaining({ entityType: "dashboardAction", entityId: "remaining-REQ-1" })]);
  });
});
