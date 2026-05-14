import type { Course, CourseStatus } from "@/lib/types";

export type CourseFormValues = Pick<Course, "id" | "number" | "name" | "description" | "credits" | "status" | "grade" | "semester" | "notes" | "countedTowardDegree" | "countsTowardGPA" | "countsTowardEarnedHours" | "excludeReason">;

const STATUSES: CourseStatus[] = ["not_started", "planned", "in_progress", "registered", "completed"];

export function courseToFormValues(course?: Course): CourseFormValues {
  return {
    id: course?.id ?? "",
    number: course?.number ?? "",
    name: course?.name ?? "",
    description: course?.description ?? "",
    credits: course?.credits ?? 3,
    status: course?.status ?? "not_started",
    grade: course?.grade ?? "",
    semester: course?.semester ?? "",
    notes: course?.notes ?? "",
    countedTowardDegree: course?.countedTowardDegree ?? true,
    countsTowardGPA: course?.countsTowardGPA ?? true,
    countsTowardEarnedHours: course?.countsTowardEarnedHours ?? true,
    excludeReason: course?.excludeReason ?? "",
  };
}

export function toCoursePayload(values: CourseFormValues, includeId: boolean): Record<string, unknown> {
  return {
    ...(includeId ? { id: values.id } : {}),
    number: values.number,
    name: values.name,
    description: values.description || undefined,
    credits: Number(values.credits),
    status: values.status,
    grade: values.grade || undefined,
    semester: values.semester || undefined,
    notes: values.notes || undefined,
    countedTowardDegree: values.countedTowardDegree,
    countsTowardGPA: values.countsTowardGPA,
    countsTowardEarnedHours: values.countsTowardEarnedHours,
    excludeReason: values.excludeReason || undefined,
  };
}

export function CourseForm({
  values,
  onChange,
  mode,
}: {
  values: CourseFormValues;
  onChange: (values: CourseFormValues) => void;
  mode: "create" | "edit";
}) {
  function set<K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]";
  const labelClass = "space-y-1.5 text-xs font-medium text-[var(--text-secondary)]";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        Course ID
        <input className={inputClass} value={values.id} onChange={(e) => set("id", e.target.value)} disabled={mode === "edit"} placeholder="CSCI-1300" />
      </label>
      <label className={labelClass}>
        Number
        <input className={inputClass} value={values.number} onChange={(e) => set("number", e.target.value)} placeholder="CSCI 1300" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Name
        <input className={inputClass} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Course name" />
      </label>
      <label className={labelClass}>
        Credits
        <input className={inputClass} type="number" min="0" step="0.5" value={values.credits} onChange={(e) => set("credits", Number(e.target.value))} />
      </label>
      <label className={labelClass}>
        Status
        <select className={inputClass} value={values.status} onChange={(e) => set("status", e.target.value as CourseStatus)}>
          {STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Grade
        <input className={inputClass} value={values.grade} onChange={(e) => set("grade", e.target.value)} placeholder="A-" />
      </label>
      <label className={labelClass}>
        Semester
        <input className={inputClass} value={values.semester} onChange={(e) => set("semester", e.target.value)} placeholder="FA26" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Description
        <textarea className={inputClass} rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Notes
        <textarea className={inputClass} rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
      <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={values.countedTowardDegree} onChange={(e) => set("countedTowardDegree", e.target.checked)} /> Counts toward degree</label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={values.countsTowardGPA} onChange={(e) => set("countsTowardGPA", e.target.checked)} /> Counts toward GPA</label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={values.countsTowardEarnedHours} onChange={(e) => set("countsTowardEarnedHours", e.target.checked)} /> Counts toward earned hours</label>
      </div>
      <label className={`${labelClass} sm:col-span-2`}>
        Exclude reason
        <input className={inputClass} value={values.excludeReason} onChange={(e) => set("excludeReason", e.target.value)} />
      </label>
    </div>
  );
}
