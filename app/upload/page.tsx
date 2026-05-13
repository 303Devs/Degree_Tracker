"use client";

import { useState, useRef } from "react";
import type { ParsedAuditResult } from "@/lib/types";

type UploadState = "idle" | "uploading" | "review" | "saving" | "done" | "error";

export default function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [parsed, setParsed] = useState<ParsedAuditResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      setState("error");
      return;
    }

    setFileName(file.name);
    setState("uploading");
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/audit/upload", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Upload failed");
      }

      setParsed(json.data as ParsedAuditResult);
      setState("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  async function handleConfirm() {
    if (!parsed) return;
    setState("saving");

    try {
      const res = await fetch("/api/audit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--accent)] font-semibold">Upload · Review · Save</p>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-2">Upload a degree audit</h2>
        <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-3xl leading-relaxed">
          Start with a CU degree audit PDF, review what the parser finds, then save the updated courses and requirements.
        </p>
      </div>

      {/* Upload zone */}
      {(state === "idle" || state === "error") && (
        <div
          className={`border-2 border-dashed rounded-2xl bg-[var(--surface)] p-12 text-center cursor-pointer shadow-[var(--shadow-card)] transition-colors ${
            dragOver
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)]"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="font-medium text-[var(--text-primary)]">Drop your audit PDF here</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">or click to browse</p>
          <p className="text-xs text-[var(--text-secondary)] mt-3">
            Get your audit from{" "}
            <span className="text-[var(--accent)]">MyCUInfo → Student → Degree Audit</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Uploading */}
      {state === "uploading" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center space-y-3 shadow-[var(--shadow-card)]">
          <div className="text-2xl animate-pulse">⚙</div>
          <p className="font-medium">Parsing {fileName}…</p>
          <p className="text-sm text-[var(--text-secondary)]">Extracting requirements and courses from audit</p>
        </div>
      )}

      {/* Review */}
      {state === "review" && parsed && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-[var(--text-primary)]">Parsed: {fileName}</h3>

            {/* Program info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Degree" value={parsed.programInfo.degreeName} />
              <InfoRow label="Student" value={parsed.programInfo.studentName} />
              <InfoRow label="Catalog Year" value={parsed.programInfo.catalogYear} />
              <InfoRow label="Program Code" value={parsed.programInfo.programCode} />
              <InfoRow label="Hours Earned" value={`${parsed.programInfo.earnedHours}`} />
              <InfoRow label="GPA" value={parsed.programInfo.gpa?.toFixed(3) ?? "—"} />
            </div>

            {/* Stats */}
            <div className="flex gap-6 pt-2 border-t border-[var(--border)] text-sm">
              <div>
                <span className="text-[var(--text-secondary)]">Courses extracted: </span>
                <span className="font-semibold text-[var(--accent)]">{parsed.courses.length}</span>
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Requirement groups: </span>
                <span className="font-semibold text-[var(--accent)]">{parsed.requirementGroups.length}</span>
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Semesters: </span>
                <span className="font-semibold text-[var(--accent)]">{parsed.semesters.length}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {parsed.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
              <p className="text-amber-700 text-sm font-medium">Parser warnings</p>
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-amber-700 text-xs">{w}</p>
              ))}
            </div>
          )}

          {/* Requirement groups preview */}
          <details className="bg-[var(--surface)] border border-[var(--border)] rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">
              Requirement groups ({parsed.requirementGroups.length})
            </summary>
            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
              {parsed.requirementGroups.map((g) => (
                <div key={g.id} className="px-4 py-2 text-xs">
                  <span className="text-[var(--text-secondary)]">{g.category} → </span>
                  <span className="text-[var(--text-primary)]">{g.name}</span>
                  <span className="ml-2 rounded border border-[var(--border)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[var(--accent)]">[{g.type}]</span>
                  {g.coursePool.length > 0 && (
                    <span className="ml-2 text-[var(--text-secondary)]">{g.coursePool.length} courses</span>
                  )}
                </div>
              ))}
            </div>
          </details>

          {/* Courses preview */}
          <details className="bg-[var(--surface)] border border-[var(--border)] rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">
              Courses ({parsed.courses.length})
            </summary>
            <div className="border-t border-[var(--border)] max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-4 py-2 text-left">Course</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-right">Credits</th>
                    <th className="px-4 py-2 text-left">Grade</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {parsed.courses.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-1.5 font-mono text-[var(--accent)]">{c.number}</td>
                      <td className="px-4 py-1.5 text-[var(--text-primary)]">{c.name}</td>
                      <td className="px-4 py-1.5 text-right text-[var(--text-secondary)]">{c.credits}</td>
                      <td className="px-4 py-1.5 text-[var(--text-secondary)]">{c.grade ?? "—"}</td>
                      <td className="px-4 py-1.5">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="px-6 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Confirm &amp; Save
            </button>
            <button
              onClick={() => { setState("idle"); setParsed(null); }}
              className="px-6 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saving */}
      {state === "saving" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center shadow-[var(--shadow-card)]">
          <div className="text-2xl animate-pulse">💾</div>
          <p className="font-medium mt-3">Saving…</p>
        </div>
      )}

      {/* Done */}
      {state === "done" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center shadow-[var(--shadow-card)] space-y-4">
          <div className="text-3xl">✓</div>
          <p className="font-medium text-green-700">Audit imported successfully</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Your courses and requirements have been saved.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <a
              href="/"
              className="px-5 py-2 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Go to Dashboard
            </a>
            <button
              onClick={() => setState("idle")}
              className="px-5 py-2 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-subtle)] rounded-lg text-sm transition-colors"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--text-secondary)]">{label}: </span>
      <span className="text-[var(--text-primary)]">{value || "—"}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed:   "rounded border border-green-200   bg-green-50   px-1.5 py-0.5 text-green-700",
    in_progress: "rounded border border-amber-200   bg-amber-50   px-1.5 py-0.5 text-amber-700",
    registered:  "rounded border border-[var(--badge-registered-border)] bg-[var(--badge-registered-bg)] px-1.5 py-0.5 text-[var(--badge-registered-text)]",
    planned:     "rounded border border-[var(--badge-planned-border)]    bg-[var(--badge-planned-bg)]    px-1.5 py-0.5 text-[var(--badge-planned-text)]",
    not_started: "text-[var(--text-secondary)]",
  };
  return (
    <span className={`${colors[status] ?? "text-[var(--text-secondary)]"} text-xs`}>
      {status.replace("_", " ")}
    </span>
  );
}
