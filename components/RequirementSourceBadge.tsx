import type { RequirementGroup } from "@/lib/types";

export function isManualRequirement(requirement?: RequirementGroup | null): boolean {
  if (!requirement) return false;
  return requirement.category.toLowerCase() === "manual" || requirement.id.toLowerCase().startsWith("manual");
}

export function RequirementSourceBadge({ requirement }: { requirement: RequirementGroup }) {
  const manual = isManualRequirement(requirement);
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        manual
          ? "border-purple-200 bg-purple-50 text-purple-700"
          : "border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent)]"
      }`}
    >
      {manual ? "Manual" : "Imported"}
    </span>
  );
}
