import type { RequirementGroup, RequirementGroupType } from "@/lib/types";

export type RequirementFormValues = {
  id: string;
  name: string;
  category: string;
  type: RequirementGroupType;
  required: number | undefined;
  requiredHours: number | undefined;
  coursePoolText: string;
  selectedCoursesText: string;
  notes: string;
  minGrade: string;
};

const TYPES: RequirementGroupType[] = ["complete_all", "pick_n", "pick_one", "minimum_hours"];

function idsToText(ids?: string[]): string {
  return (ids ?? []).join("\n");
}

function textToIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function requirementToFormValues(requirement?: RequirementGroup): RequirementFormValues {
  return {
    id: requirement?.id ?? "",
    name: requirement?.name ?? "",
    category: requirement?.category ?? "Manual",
    type: requirement?.type ?? "complete_all",
    required: requirement?.required,
    requiredHours: requirement?.requiredHours,
    coursePoolText: idsToText(requirement?.coursePool),
    selectedCoursesText: idsToText(requirement?.selectedCourses),
    notes: requirement?.notes ?? "",
    minGrade: requirement?.minGrade ?? "",
  };
}

export function toRequirementPayload(values: RequirementFormValues, includeId: boolean): Record<string, unknown> {
  return {
    ...(includeId ? { id: values.id } : {}),
    name: values.name,
    category: values.category,
    type: values.type,
    required: values.type === "pick_n" ? values.required : undefined,
    requiredHours: values.type === "minimum_hours" ? values.requiredHours : undefined,
    coursePool: textToIds(values.coursePoolText),
    selectedCourses: textToIds(values.selectedCoursesText),
    notes: values.notes || undefined,
    minGrade: values.minGrade || undefined,
  };
}

export function RequirementForm({
  values,
  onChange,
  mode,
}: {
  values: RequirementFormValues;
  onChange: (values: RequirementFormValues) => void;
  mode: "create" | "edit";
}) {
  function set<K extends keyof RequirementFormValues>(key: K, value: RequirementFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]";
  const labelClass = "space-y-1.5 text-xs font-medium text-[var(--text-secondary)]";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        Requirement ID
        <input className={inputClass} value={values.id} onChange={(e) => set("id", e.target.value)} disabled={mode === "edit"} placeholder="MANUAL-REQ" />
      </label>
      <label className={labelClass}>
        Category
        <input className={inputClass} value={values.category} onChange={(e) => set("category", e.target.value)} placeholder="Major" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Name
        <input className={inputClass} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Requirement name" />
      </label>
      <label className={labelClass}>
        Type
        <select className={inputClass} value={values.type} onChange={(e) => set("type", e.target.value as RequirementGroupType)}>
          {TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Minimum grade
        <input className={inputClass} value={values.minGrade} onChange={(e) => set("minGrade", e.target.value)} placeholder="C-" />
      </label>
      {values.type === "pick_n" && (
        <label className={labelClass}>
          Required choices
          <input className={inputClass} type="number" min="1" step="1" value={values.required ?? ""} onChange={(e) => set("required", e.target.value ? Number(e.target.value) : undefined)} />
        </label>
      )}
      {values.type === "minimum_hours" && (
        <label className={labelClass}>
          Required hours
          <input className={inputClass} type="number" min="0.5" step="0.5" value={values.requiredHours ?? ""} onChange={(e) => set("requiredHours", e.target.value ? Number(e.target.value) : undefined)} />
        </label>
      )}
      <label className={`${labelClass} sm:col-span-2`}>
        Course pool (dash IDs, whole-field replacement)
        <textarea className={inputClass} rows={5} value={values.coursePoolText} onChange={(e) => set("coursePoolText", e.target.value)} placeholder={"CSCI-1300\nMATH-1300"} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Selected/counting courses (dash IDs, whole-field replacement)
        <textarea className={inputClass} rows={3} value={values.selectedCoursesText} onChange={(e) => set("selectedCoursesText", e.target.value)} placeholder="Only IDs from the course pool" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Notes
        <textarea className={inputClass} rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
    </div>
  );
}
