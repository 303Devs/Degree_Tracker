import type { Course } from "@/lib/types";
import { getCourseLibraryMeta } from "@/lib/course-library";

export function CourseSourceBadge({ course }: { course: Course }) {
  const meta = getCourseLibraryMeta(course);
  const label = course.manuallyAdded || course.source === "manual" ? "Manual" : meta.source;
  const styles: Record<string, string> = {
    Manual: "bg-purple-50 text-purple-700 border-purple-200",
    Audit: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--border)]",
    Catalog: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${styles[label] ?? styles.Audit}`}>
      {label}
    </span>
  );
}
