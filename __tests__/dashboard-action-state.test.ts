import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardNextAction } from "../lib/audit-dashboard-view";
import type { EntityLocalState } from "../lib/types";

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
function readJson<T>(filename: string): T {
  return JSON.parse(store[key(filename)]) as T;
}

const actions: DashboardNextAction[] = [
  { id: "remaining-REQ-1", title: "Choose next course", detail: "Pick one", requirementId: "REQ-1", tone: "remaining" },
  { id: "progress-REQ-2", title: "Confirm current course", detail: "Check it", requirementId: "REQ-2", tone: "progress" },
  { id: "attention-REQ-3", title: "Review warning", detail: "Needs review", requirementId: "REQ-3", tone: "attention" },
];

beforeEach(() => {
  for (const path of Object.keys(store)) delete store[path];
  storeJson("edit-state.json", { overrides: [], manualEntities: [], localStates: [] });
});

describe("dashboard next-action local state", () => {
  it("filters dismissed and actively snoozed actions while keeping expired snoozes visible", async () => {
    const { filterVisibleDashboardActions } = await import("../lib/dashboard-action-state");
    const localStates: EntityLocalState[] = [
      { entityType: "dashboardAction", entityId: "remaining-REQ-1", dismissed: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      { entityType: "dashboardAction", entityId: "progress-REQ-2", snoozedUntil: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { entityType: "dashboardAction", entityId: "attention-REQ-3", snoozedUntil: "2025-12-31T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];

    expect(filterVisibleDashboardActions(actions, localStates, new Date("2026-01-02T00:00:00.000Z")).map((action) => action.id)).toEqual(["attention-REQ-3"]);
  });

  it("updates and resets dashboard action state without touching overrides or manual entities", async () => {
    const { resetDashboardActionState, updateDashboardActionState } = await import("../lib/data");
    storeJson("edit-state.json", {
      overrides: [{ id: "override-1" }],
      manualEntities: [{ id: "manual-1" }],
      localStates: [{ entityType: "course", entityId: "CSCI-1300", hidden: true, updatedAt: "2026-01-01T00:00:00.000Z" }],
    });

    updateDashboardActionState("remaining-REQ-1", { dismissed: true, reason: "dismissed" });
    let state = readJson<{ overrides: unknown[]; manualEntities: unknown[]; localStates: EntityLocalState[] }>("edit-state.json");

    expect(state.overrides).toEqual([{ id: "override-1" }]);
    expect(state.manualEntities).toEqual([{ id: "manual-1" }]);
    expect(state.localStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "course", entityId: "CSCI-1300", hidden: true }),
      expect.objectContaining({ entityType: "dashboardAction", entityId: "remaining-REQ-1", dismissed: true, reason: "dismissed" }),
    ]));

    updateDashboardActionState("remaining-REQ-1", { dismissed: false, snoozedUntil: "2026-01-08T00:00:00.000Z", reason: "snoozed" });
    state = readJson("edit-state.json");
    expect(state.localStates.filter((item) => item.entityType === "dashboardAction" && item.entityId === "remaining-REQ-1")).toHaveLength(1);
    expect(state.localStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "dashboardAction", entityId: "remaining-REQ-1", dismissed: false, snoozedUntil: "2026-01-08T00:00:00.000Z", reason: "snoozed" }),
    ]));

    resetDashboardActionState("remaining-REQ-1");
    state = readJson("edit-state.json");
    expect(state.localStates.some((item) => item.entityType === "dashboardAction" && item.entityId === "remaining-REQ-1")).toBe(false);
    expect(state.localStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "course", entityId: "CSCI-1300", hidden: true }),
    ]));
  });
});
