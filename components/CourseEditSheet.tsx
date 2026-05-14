import { useEffect, useState } from "react";
import type { Course } from "@/lib/types";
import { CourseForm, courseToFormValues, toCoursePayload, type CourseFormValues } from "./CourseForm";
import { CourseSourceBadge } from "./CourseSourceBadge";

const RESET_FIELDS = ["name", "number", "description", "credits", "status", "grade", "semester", "notes", "countedTowardDegree", "countsTowardGPA", "countsTowardEarnedHours", "excludeReason"];

function isManual(course?: Course | null): boolean {
  return Boolean(course?.manuallyAdded || course?.source === "manual");
}

export function CourseEditSheet({
  course,
  mode,
  onClose,
  onSaved,
  onDeleted,
}: {
  course: Course | null;
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (course: Course) => void;
  onDeleted: (id: string) => void;
}) {
  const [values, setValues] = useState<CourseFormValues>(() => courseToFormValues(course ?? undefined));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetField, setResetField] = useState("name");

  useEffect(() => {
    setValues(courseToFormValues(course ?? undefined));
    setError(null);
  }, [course, mode]);

  if (mode === "edit" && !course) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === "create" ? "/api/courses" : `/api/courses/${course!.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toCoursePayload(values, mode === "create")),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to save course");
      onSaved(json as Course);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(field: string, all = false) {
    if (!course) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${course.id}/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { field }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to reset course field");
      onSaved(json as Course);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteManualCourse() {
    if (!course) return;
    if (!window.confirm(`Delete manual course ${course.number}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to delete course");
      onDeleted(course.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const manual = isManual(course);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-stretch sm:justify-end" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Close course editor" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:h-full sm:max-h-none sm:w-[34rem] sm:rounded-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--accent)]">{mode === "create" ? "Add course" : "Edit course"}</p>
            <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{mode === "create" ? "Manual course" : course?.number}</h3>
            {course && <div className="mt-2"><CourseSourceBadge course={course} /></div>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">Close</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <CourseForm values={values} onChange={setValues} mode={mode} />

          {mode === "edit" && course && !manual && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Audit course controls</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Imported courses cannot be destructively deleted. Reset returns edited fields to imported values.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select value={resetField} onChange={(e) => setResetField(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  {RESET_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
                <button disabled={busy} onClick={() => reset(resetField)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--accent)]">Reset field</button>
                <button disabled={busy} onClick={() => reset(resetField, true)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">Reset all</button>
              </div>
              <button disabled className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-70">Delete disabled for imported courses</button>
            </div>
          )}

          {mode === "edit" && course && manual && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Manual course delete</p>
              <p className="mt-1 text-xs text-rose-700/80">This removes the user-created course after confirmation.</p>
              <button disabled={busy} onClick={deleteManualCourse} className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white">Delete manual course</button>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <button disabled={busy} onClick={save} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Save course"}</button>
          <button disabled={busy} onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
