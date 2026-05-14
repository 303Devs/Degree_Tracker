import { useEffect, useState } from "react";
import type { RequirementGroup } from "@/lib/types";
import { RequirementForm, requirementToFormValues, toRequirementPayload, type RequirementFormValues } from "./RequirementForm";
import { isManualRequirement, RequirementSourceBadge } from "./RequirementSourceBadge";

const RESET_FIELDS = ["name", "category", "type", "required", "requiredHours", "coursePool", "selectedCourses", "notes", "minGrade"];

export function RequirementEditSheet({
  requirement,
  mode,
  onClose,
  onSaved,
  onDeleted,
}: {
  requirement: RequirementGroup | null;
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (requirement: RequirementGroup) => void;
  onDeleted: (id: string) => void;
}) {
  const [values, setValues] = useState<RequirementFormValues>(() => requirementToFormValues(requirement ?? undefined));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetField, setResetField] = useState("name");

  useEffect(() => {
    setValues(requirementToFormValues(requirement ?? undefined));
    setError(null);
  }, [requirement, mode]);

  if (mode === "edit" && !requirement) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === "create" ? "/api/requirements" : `/api/requirements/${requirement!.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toRequirementPayload(values, mode === "create")),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to save requirement");
      onSaved(json as RequirementGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(field: string, all = false) {
    if (!requirement) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/requirements/${requirement.id}/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { field }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to reset requirement field");
      onSaved(json as RequirementGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteManualRequirement() {
    if (!requirement) return;
    if (!window.confirm(`Delete manual requirement ${requirement.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/requirements/${requirement.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to delete requirement");
      onDeleted(requirement.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const manual = isManualRequirement(requirement);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-stretch sm:justify-end" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Close requirement editor" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:h-full sm:max-h-none sm:w-[36rem] sm:rounded-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--accent)]">{mode === "create" ? "Add requirement" : "Edit requirement"}</p>
            <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{mode === "create" ? "Manual requirement" : requirement?.name}</h3>
            {requirement && <div className="mt-2"><RequirementSourceBadge requirement={requirement} /></div>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">Close</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <RequirementForm values={values} onChange={setValues} mode={mode} />

          {mode === "edit" && requirement && !manual && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Imported requirement controls</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Audit-sourced requirements cannot be destructively deleted. Reset returns edited fields to imported values.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select value={resetField} onChange={(e) => setResetField(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  {RESET_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
                <button disabled={busy} onClick={() => reset(resetField)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--accent)]">Reset field</button>
                <button disabled={busy} onClick={() => reset(resetField, true)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">Reset all</button>
              </div>
              <button disabled className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-70">Delete disabled for imported requirements</button>
            </div>
          )}

          {mode === "edit" && requirement && manual && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Manual requirement delete</p>
              <p className="mt-1 text-xs text-rose-700/80">This removes the user-created requirement after confirmation.</p>
              <button disabled={busy} onClick={deleteManualRequirement} className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white">Delete manual requirement</button>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <button disabled={busy} onClick={save} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Save requirement"}</button>
          <button disabled={busy} onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
