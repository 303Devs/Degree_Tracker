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
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#e2e8f0]">Audit Upload</h2>
        <p className="text-[#8892a4] text-sm mt-1">
          Upload your CU degree audit PDF. The parser extracts requirements, courses,
          grades, and hours automatically.
        </p>
      </div>

      {/* Upload zone */}
      {(state === "idle" || state === "error") && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-[#2a2d3a] hover:border-[#4a4d5a] hover:bg-white/5"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="font-medium text-[#e2e8f0]">Drop your audit PDF here</p>
          <p className="text-sm text-[#8892a4] mt-1">or click to browse</p>
          <p className="text-xs text-[#8892a4] mt-3">
            Get your audit from{" "}
            <span className="text-indigo-400">MyCUInfo → Student → Degree Audit</span>
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
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Uploading */}
      {state === "uploading" && (
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-8 text-center space-y-3">
          <div className="text-2xl animate-pulse">⚙</div>
          <p className="font-medium">Parsing {fileName}…</p>
          <p className="text-sm text-[#8892a4]">Extracting requirements and courses from audit</p>
        </div>
      )}

      {/* Review */}
      {state === "review" && parsed && (
        <div className="space-y-6">
          <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-[#e2e8f0]">Parsed: {fileName}</h3>

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
            <div className="flex gap-6 pt-2 border-t border-[#2a2d3a] text-sm">
              <div>
                <span className="text-[#8892a4]">Courses extracted: </span>
                <span className="font-semibold text-indigo-300">{parsed.courses.length}</span>
              </div>
              <div>
                <span className="text-[#8892a4]">Requirement groups: </span>
                <span className="font-semibold text-indigo-300">{parsed.requirementGroups.length}</span>
              </div>
              <div>
                <span className="text-[#8892a4]">Semesters: </span>
                <span className="font-semibold text-indigo-300">{parsed.semesters.length}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {parsed.warnings.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 space-y-1">
              <p className="text-yellow-300 text-sm font-medium">Parser warnings</p>
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-yellow-200/70 text-xs">{w}</p>
              ))}
            </div>
          )}

          {/* Requirement groups preview */}
          <details className="bg-[#1a1d27] border border-[#2a2d3a] rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[#e2e8f0] hover:text-indigo-300">
              Requirement groups ({parsed.requirementGroups.length})
            </summary>
            <div className="border-t border-[#2a2d3a] divide-y divide-[#2a2d3a] max-h-64 overflow-y-auto">
              {parsed.requirementGroups.map((g) => (
                <div key={g.id} className="px-4 py-2 text-xs">
                  <span className="text-[#8892a4]">{g.category} → </span>
                  <span className="text-[#e2e8f0]">{g.name}</span>
                  <span className="ml-2 text-indigo-400 font-mono">[{g.type}]</span>
                  {g.coursePool.length > 0 && (
                    <span className="ml-2 text-[#8892a4]">{g.coursePool.length} courses</span>
                  )}
                </div>
              ))}
            </div>
          </details>

          {/* Courses preview */}
          <details className="bg-[#1a1d27] border border-[#2a2d3a] rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[#e2e8f0] hover:text-indigo-300">
              Courses ({parsed.courses.length})
            </summary>
            <div className="border-t border-[#2a2d3a] max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-[#8892a4] border-b border-[#2a2d3a]">
                  <tr>
                    <th className="px-4 py-2 text-left">Course</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-right">Credits</th>
                    <th className="px-4 py-2 text-left">Grade</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2d3a]">
                  {parsed.courses.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="px-4 py-1.5 font-mono text-indigo-300">{c.number}</td>
                      <td className="px-4 py-1.5 text-[#e2e8f0]">{c.name}</td>
                      <td className="px-4 py-1.5 text-right text-[#8892a4]">{c.credits}</td>
                      <td className="px-4 py-1.5 text-[#8892a4]">{c.grade ?? "—"}</td>
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
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium text-sm transition-colors"
            >
              Confirm &amp; Save
            </button>
            <button
              onClick={() => { setState("idle"); setParsed(null); }}
              className="px-6 py-2.5 bg-[#1a1d27] hover:bg-[#2a2d3a] border border-[#2a2d3a] rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saving */}
      {state === "saving" && (
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-8 text-center">
          <div className="text-2xl animate-pulse">💾</div>
          <p className="font-medium mt-3">Saving…</p>
        </div>
      )}

      {/* Done */}
      {state === "done" && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-8 text-center space-y-4">
          <div className="text-3xl">✓</div>
          <p className="font-medium text-green-300">Audit imported successfully</p>
          <p className="text-sm text-[#8892a4]">
            Your courses and requirements have been saved.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <a
              href="/"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors"
            >
              Go to Dashboard
            </a>
            <button
              onClick={() => setState("idle")}
              className="px-5 py-2 bg-[#1a1d27] border border-[#2a2d3a] hover:bg-[#2a2d3a] rounded-lg text-sm transition-colors"
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
      <span className="text-[#8892a4]">{label}: </span>
      <span className="text-[#e2e8f0]">{value || "—"}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "text-green-400",
    in_progress: "text-yellow-400",
    planned: "text-blue-400",
    not_started: "text-[#8892a4]",
  };
  return (
    <span className={`${colors[status] ?? "text-[#8892a4]"} text-xs`}>
      {status.replace("_", " ")}
    </span>
  );
}
