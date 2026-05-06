"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course, CourseStatus, Semester } from "@/lib/types";

const GRADE_OPTIONS = ["", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W", "P", "NP", "I"];
const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "planned", label: "Planned" },
  { value: "registered", label: "Registered" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const GRADE_POINTS: Record<string, number> = {
  A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0,
};

function gradeColor(grade: string): string {
  const p = GRADE_POINTS[grade] ?? -1;
  if (p >= 3.7) return "text-green-400";
  if (p >= 2.7) return "text-indigo-400";
  if (p >= 1.7) return "text-yellow-400";
  if (p >= 0) return "text-red-400";
  return "text-[#6a6a8a]";
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    in_progress: "bg-[#d4a843]/10 text-[#d4a843] border-[#d4a843]/20",
    registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    planned: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    not_started: "bg-[#1e1e34] text-[#6a6a8a] border-[#2a2a3a]",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] border ${styles[status] ?? styles.not_started} uppercase tracking-wider`}>
      {status.replace("_", " ")}
    </span>
  );
}

interface CourseFormData {
  dept: string;
  num: string;
  name: string;
  credits: string;
  grade: string;
  semester: string;
  status: CourseStatus;
  notes: string;
  countedTowardDegree: boolean;
  countsTowardGPA: boolean;
  countsTowardEarnedHours: boolean;
}

const emptyForm: CourseFormData = {
  dept: "",
  num: "",
  name: "",
  credits: "3",
  grade: "",
  semester: "",
  status: "not_started",
  notes: "",
  countedTowardDegree: true,
  countsTowardGPA: true,
  countsTowardEarnedHours: true,
};

function EditDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close edit dialog" />
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#2a2a3e] bg-[#111120] shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function CourseForm({
  initial,
  isEdit,
  onSave,
  onCancel,
  saving,
  error,
  semesters,
}: {
  initial: CourseFormData;
  isEdit: boolean;
  onSave: (data: CourseFormData) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  semesters: Semester[];
}) {
  const [form, setForm] = useState(initial);

  function update(field: keyof CourseFormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#d0d0e8]">
            {isEdit ? "Edit Course" : "Add New Course"}
          </h3>
          <p className="mt-1 text-xs text-[#6a6a8a]">
            {isEdit ? `${form.dept} ${form.num}` : "Create a course record manually."}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-lg border border-[#2a2a3e] bg-[#1e1e34] px-2.5 py-1 text-xs text-[#8888a8] hover:text-[#d0d0e8]"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Department</label>
          <input
            value={form.dept}
            onChange={(e) => update("dept", e.target.value.toUpperCase())}
            placeholder="CSCI"
            disabled={isEdit}
            maxLength={5}
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 placeholder:text-[#3a3a5a] disabled:opacity-50 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Course Number</label>
          <input
            value={form.num}
            onChange={(e) => update("num", e.target.value)}
            placeholder="1300"
            disabled={isEdit}
            maxLength={5}
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 placeholder:text-[#3a3a5a] disabled:opacity-50 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-[#6a6a8a] mb-1">Course Name</label>
        <input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="CS 1: Starting Computing"
          className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 placeholder:text-[#3a3a5a]"
        />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Credits</label>
          <input
            type="number"
            value={form.credits}
            onChange={(e) => update("credits", e.target.value)}
            min="0" max="8" step="0.5"
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
          />
        </div>
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Grade</label>
          <select
            value={form.grade}
            onChange={(e) => update("grade", e.target.value)}
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>{g || "—"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Semester</label>
          <select
            value={form.semester}
            onChange={(e) => update("semester", e.target.value)}
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 font-mono"
          >
            <option value="">— none —</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>{s.label} ({s.id})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#6a6a8a] mb-1">Status</label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[#6a6a8a] mb-1">Notes</label>
        <input
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Optional notes..."
          className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 placeholder:text-[#3a3a5a]"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#1e1e34] bg-[#0d0d1a] p-3">
        <label className="flex items-start gap-2 text-xs text-[#8888a8]">
          <input
            type="checkbox"
            checked={form.countedTowardDegree}
            onChange={(e) => update("countedTowardDegree", e.target.checked)}
            className="mt-0.5 accent-[#d4a843]"
          />
          <span><span className="block text-[#d0d0e8]">Degree progress</span>Counts toward requirements.</span>
        </label>
        <label className="flex items-start gap-2 text-xs text-[#8888a8]">
          <input
            type="checkbox"
            checked={form.countsTowardGPA}
            onChange={(e) => update("countsTowardGPA", e.target.checked)}
            className="mt-0.5 accent-[#d4a843]"
          />
          <span><span className="block text-[#d0d0e8]">GPA</span>Counts in GPA denominator.</span>
        </label>
        <label className="flex items-start gap-2 text-xs text-[#8888a8]">
          <input
            type="checkbox"
            checked={form.countsTowardEarnedHours}
            onChange={(e) => update("countsTowardEarnedHours", e.target.checked)}
            className="mt-0.5 accent-[#d4a843]"
          />
          <span><span className="block text-[#d0d0e8]">Earned hours</span>Counts toward earned credits.</span>
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || (!isEdit && (!form.dept || !form.num))}
          className="px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Update Course" : "Add Course"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-[#1e1e34] border border-[#2a2a3e] text-[#8888a8] rounded-xl text-sm hover:bg-[#2a2a40] hover:text-[#d0d0e8] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ManageCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showUncounted, setShowUncounted] = useState(false);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/semesters").then((r) => r.json()),
    ]).then(([c, s]) => {
      setCourses(Array.isArray(c) ? c : []);
      setSemesters(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let list = courses;
    if (!showUncounted) {
      list = list.filter((c) => c.countedTowardDegree !== false);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.number.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    return list;
  }, [courses, search, showUncounted]);

  async function handleAdd(form: CourseFormData) {
    setSaving(true);
    setFormError(null);
    const id = `${form.dept}-${form.num}`;
    const gradePoints = form.grade ? GRADE_POINTS[form.grade] : undefined;

    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          number: `${form.dept} ${form.num}`,
          name: form.name,
          credits: parseFloat(form.credits) || 3,
          grade: form.grade || undefined,
          semester: form.semester || undefined,
          status: form.status,
          gradePoints,
          notes: form.notes || undefined,
          manuallyAdded: true,
          countedTowardDegree: form.countedTowardDegree,
          countsTowardGPA: form.countsTowardGPA,
          countsTowardEarnedHours: form.countsTowardEarnedHours,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? "Failed to add course");
        setSaving(false);
        return;
      }
      const created = await res.json();
      setCourses((prev) => [...prev, created]);
      setShowForm(false);
    } catch (err) {
      setFormError(String(err));
    }
    setSaving(false);
  }

  async function handleEdit(form: CourseFormData) {
    if (!editingCourse) return;
    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/courses/${editingCourse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          credits: parseFloat(form.credits) || editingCourse.credits,
          grade: form.grade || undefined,
          semester: form.semester || undefined,
          status: form.status,
          notes: form.notes || undefined,
          countedTowardDegree: form.countedTowardDegree,
          countsTowardGPA: form.countsTowardGPA,
          countsTowardEarnedHours: form.countsTowardEarnedHours,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? "Failed to update course");
        setSaving(false);
        return;
      }
      const updated = await res.json();
      setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setEditingCourse(null);
    } catch (err) {
      setFormError(String(err));
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCourses((prev) => prev.filter((c) => c.id !== id));
        setDeleteConfirm(null);
      }
    } catch {
      /* ignore */
    }
  }

  function startEdit(course: Course) {
    const [dept, ...numParts] = course.id.split("-");
    setEditingCourse(course);
    setFormError(null);
    setShowForm(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#6a6a8a]">Loading…</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-screen text-red-400 text-sm p-8">Failed to load: {error}</div>;
  }

  const editFormData: CourseFormData | null = editingCourse ? {
    dept: editingCourse.id.split("-")[0],
    num: editingCourse.id.split("-").slice(1).join("-"),
    name: editingCourse.name,
    credits: String(editingCourse.credits),
    grade: editingCourse.grade ?? "",
    semester: editingCourse.semester ?? "",
    status: editingCourse.status,
    notes: editingCourse.notes ?? "",
    countedTowardDegree: editingCourse.countedTowardDegree !== false,
    countsTowardGPA: editingCourse.countsTowardGPA !== false,
    countsTowardEarnedHours: editingCourse.countsTowardEarnedHours !== false,
  } : null;

  return (
    <div className="p-8 max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#d0d0e8]">Manage Courses</h2>
          <p className="text-[#6a6a8a] text-sm mt-1">Add, edit, or delete courses. Full control over all fields.</p>
        </div>
        {!showForm && !editingCourse && (
          <button
            onClick={() => { setShowForm(true); setEditingCourse(null); setFormError(null); }}
            className="px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Course
          </button>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {showForm && (
        <EditDialog onClose={() => { setShowForm(false); setFormError(null); }}>
          <CourseForm
            initial={emptyForm}
            isEdit={false}
            onSave={handleAdd}
            onCancel={() => { setShowForm(false); setFormError(null); }}
            saving={saving}
            error={formError}
            semesters={semesters}
          />
        </EditDialog>
      )}

      {editingCourse && editFormData && (
        <EditDialog onClose={() => { setEditingCourse(null); setFormError(null); }}>
          <CourseForm
            key={editingCourse.id}
            initial={editFormData}
            isEdit={true}
            onSave={handleEdit}
            onCancel={() => { setEditingCourse(null); setFormError(null); }}
            saving={saving}
            error={formError}
            semesters={semesters}
          />
        </EditDialog>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search courses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] placeholder-[#4a4a6a] focus:outline-none focus:border-[#d4a843]/40"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-[#4a4a6a]">
          {filtered.length} courses{!showUncounted ? " (excluding uncounted)" : ""}
        </p>
        <button
          onClick={() => setShowUncounted((v) => !v)}
          className="text-xs text-[#6a6a8a] hover:text-[#d4a843] transition-colors"
        >
          {showUncounted ? "Hide uncounted" : `Show uncounted (${courses.filter((c) => c.countedTowardDegree === false).length})`}
        </button>
      </div>

      {/* Course Table */}
      <div className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[#1e1e34] text-[#6a6a8a] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Course</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Cr</th>
              <th className="px-4 py-3 text-center">Grade</th>
              <th className="px-4 py-3 text-left">Semester</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-center">Source</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1a2e]">
            {filtered.map((course) => (
              <tr key={course.id} className={`hover:bg-white/[0.02] transition-colors ${course.countedTowardDegree === false ? "opacity-60" : ""}`}>
                <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{course.number}</td>
                <td className="px-4 py-3 text-[#c0c0d8] max-w-[200px] truncate">{course.name || <span className="text-[#4a4a6a] italic">unnamed</span>}</td>
                <td className="px-4 py-3 text-right text-[#6a6a8a] text-xs">{course.credits}</td>
                <td className="px-4 py-3 text-center">
                  {course.grade ? (
                    <span className={`font-mono text-xs font-bold ${gradeColor(course.grade)}`}>{course.grade}</span>
                  ) : (
                    <span className="text-[#3a3a5a]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#6a6a8a] text-xs font-mono">{course.semester ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={course.status} /></td>
                <td className="px-4 py-3 text-center">
                  {course.manuallyAdded ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#d4a843]/10 text-[#d4a843] border-[#d4a843]/20">manual</span>
                  ) : (
                    <span className="text-[10px] text-[#4a4a6a]">audit</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(course)}
                      className="text-xs text-[#6a6a8a] hover:text-[#d4a843] transition-colors"
                    >
                      Edit
                    </button>
                    {deleteConfirm === course.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(course.id)}
                          className="text-xs px-1.5 py-0.5 bg-red-500/15 border border-red-500/20 text-red-400 rounded hover:bg-red-500/25"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs text-[#4a4a6a] hover:text-[#8888a8]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(course.id)}
                        className="text-xs text-[#4a4a6a] hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-[#4a4a6a] text-sm">No courses match your search.</div>
        )}
      </div>
    </div>
  );
}
