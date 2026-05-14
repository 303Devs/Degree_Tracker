import type { DashboardNextAction } from "./audit-dashboard-view";
import type { EntityLocalState } from "./types";

export type DashboardActionLocalState = EntityLocalState & { entityType: "dashboardAction" };

export function getDashboardActionLocalStates(localStates: EntityLocalState[]): DashboardActionLocalState[] {
  return localStates.filter((state): state is DashboardActionLocalState => state.entityType === "dashboardAction");
}

export function isDashboardActionHidden(actionId: string, localStates: EntityLocalState[], now = new Date()): boolean {
  const state = getDashboardActionLocalStates(localStates).find((item) => item.entityId === actionId);
  if (!state) return false;
  if (state.dismissed) return true;
  if (!state.snoozedUntil) return false;
  const until = Date.parse(state.snoozedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

export function filterVisibleDashboardActions<T extends Pick<DashboardNextAction, "id">>(
  actions: T[],
  localStates: EntityLocalState[],
  now = new Date()
): T[] {
  return actions.filter((action) => !isDashboardActionHidden(action.id, localStates, now));
}

export function upsertDashboardActionLocalState(
  localStates: EntityLocalState[],
  actionId: string,
  patch: { dismissed?: boolean; snoozedUntil?: string | null; reason?: string }
): EntityLocalState[] {
  const existing = getDashboardActionLocalStates(localStates).find((state) => state.entityId === actionId);
  const next: DashboardActionLocalState = {
    ...(existing ?? { entityType: "dashboardAction" as const, entityId: actionId }),
    dismissed: patch.dismissed ?? existing?.dismissed,
    snoozedUntil: patch.snoozedUntil === null ? undefined : patch.snoozedUntil ?? existing?.snoozedUntil,
    reason: patch.reason ?? existing?.reason,
    updatedAt: new Date().toISOString(),
  };
  return [...localStates.filter((state) => !(state.entityType === "dashboardAction" && state.entityId === actionId)), next];
}

export function resetDashboardActionLocalState(localStates: EntityLocalState[], actionId: string): EntityLocalState[] {
  return localStates.filter((state) => !(state.entityType === "dashboardAction" && state.entityId === actionId));
}
