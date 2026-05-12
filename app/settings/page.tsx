"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Semester } from "@/lib/types";

const PROVIDER_MODELS: Record<string, { label: string; models: { id: string; name: string }[] }> = {
  anthropic: {
    label: "Anthropic",
    models: [
      { id: "claude-opus-4-20250620", name: "Claude Opus 4" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-haiku-4-20250414", name: "Claude Haiku 4" },
    ],
  },
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-5.5", name: "GPT-5.5" },
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
  },
  google: {
    label: "Google Gemini",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
  },
};

export default function SettingsPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prereq import state
  const [prereqFile, setPrereqFile] = useState<File | null>(null);
  const [prereqImporting, setPrereqImporting] = useState(false);
  const [prereqResult, setPrereqResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // LLM Provider state
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-20250514");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmHasKey, setLlmHasKey] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/semesters").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([s, llm]) => {
      setSemesters(Array.isArray(s) ? s : []);
      if (llm && typeof llm === "object") {
        setLlmProvider(llm.provider ?? "anthropic");
        setLlmModel(llm.model ?? "claude-sonnet-4-20250514");
        setLlmHasKey(Boolean(llm.hasKey));
      }
      setLoading(false);
    }).catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  function handleProviderChange(provider: string) {
    setLlmProvider(provider);
    const models = PROVIDER_MODELS[provider]?.models ?? [];
    setLlmModel(models[0]?.id ?? "");
    setLlmStatus(null);
  }

  async function handleLlmSave() {
    setLlmSaving(true);
    setLlmStatus(null);
    try {
      const body: Record<string, string> = { provider: llmProvider, model: llmModel };
      if (llmApiKey) body.apiKey = llmApiKey;
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setLlmStatus({ ok: true, msg: "Settings saved." });
        if (llmApiKey) {
          setLlmHasKey(true);
          setLlmApiKey("");
        }
      } else {
        const data = await res.json() as { error?: string };
        setLlmStatus({ ok: false, msg: data.error ?? "Failed to save." });
      }
    } catch (err) {
      setLlmStatus({ ok: false, msg: String(err) });
    }
    setLlmSaving(false);
  }

  async function handlePrereqImport() {
    if (!prereqFile) return;
    setPrereqImporting(true);
    setPrereqResult(null);
    try {
      const formData = new FormData();
      formData.append("file", prereqFile);
      const res = await fetch("/api/prereqs/import", { method: "POST", body: formData });
      const data = await res.json() as { updated?: number; notFound?: number; error?: string };
      if (res.ok) {
        setPrereqResult({ ok: true, msg: `${data.updated ?? 0} courses updated, ${data.notFound ?? 0} not found` });
      } else {
        setPrereqResult({ ok: false, msg: data.error ?? "Import failed." });
      }
    } catch (err) {
      setPrereqResult({ ok: false, msg: String(err) });
    }
    setPrereqImporting(false);
  }

  async function handleLlmTest() {
    setLlmTesting(true);
    setLlmStatus(null);
    // Save any pending new key first so the server can read it
    if (llmApiKey) {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: llmProvider, model: llmModel, apiKey: llmApiKey }),
      });
      setLlmHasKey(true);
      setLlmApiKey("");
    } else if (!llmHasKey) {
      setLlmStatus({ ok: false, msg: "No API key configured. Enter a key and save first." });
      setLlmTesting(false);
      return;
    }
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: llmProvider, model: llmModel }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        setLlmStatus({ ok: true, msg: "Connection successful." });
      } else {
        setLlmStatus({ ok: false, msg: data.error ?? "Test failed." });
      }
    } catch (err) {
      setLlmStatus({ ok: false, msg: String(err) });
    }
    setLlmTesting(false);
  }

  async function handleDeleteSemester(semId: string) {
    setSaving(true);
    try {
      await fetch(`/api/semesters/${semId}`, { method: "DELETE" });
      setSemesters((prev) => prev.filter((s) => s.id !== semId));
      setDeleteConfirm(null);
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[var(--text-secondary)]">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-rose-600 text-sm p-8">
        Failed to load settings: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 sm:p-8 max-w-4xl space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--accent)] font-semibold">Settings</p>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-2">Manage import tools and planning setup</h2>
        <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-3xl leading-relaxed">Configure audit parsing, prerequisite imports, and planned-semester support tools.</p>
      </div>

      {/* LLM Provider */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">LLM Provider</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Configure the AI model used to parse degree audits.</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {Object.entries(PROVIDER_MODELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Model</label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {(PROVIDER_MODELS[llmProvider]?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-[var(--text-secondary)]">API Key</label>
              <span className={`text-xs ${llmHasKey ? "text-green-700" : "text-[var(--text-muted)]"}`}>
                {llmHasKey ? "Key configured ✓" : "No key set"}
              </span>
            </div>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="Enter new API key…"
              className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          {llmStatus && (
            <p className={`text-xs ${llmStatus.ok ? "text-green-700" : "text-rose-600"}`}>
              {llmStatus.msg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleLlmTest}
              disabled={llmTesting || llmSaving}
              className="px-4 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              {llmTesting ? "Testing…" : "Test Connection"}
            </button>
            <button
              onClick={handleLlmSave}
              disabled={llmSaving || llmTesting}
              className="px-4 py-2 bg-[var(--accent-soft)] border border-[var(--border)] text-[var(--accent)] rounded-xl text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
            >
              {llmSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </section>

      {/* Prerequisite Data */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Prerequisite Data</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Import prerequisite data from the cu-prereq-scraper to enrich course details.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Scraper JSON file</label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => { setPrereqFile(e.target.files?.[0] ?? null); setPrereqResult(null); }}
              className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-subtle)] file:text-[var(--text-secondary)] file:text-xs hover:file:bg-[var(--surface-subtle)] file:cursor-pointer cursor-pointer"
            />
          </div>
          {prereqResult && (
            <p className={`text-xs ${prereqResult.ok ? "text-green-700" : "text-rose-600"}`}>
              {prereqResult.msg}
            </p>
          )}
          <button
            onClick={handlePrereqImport}
            disabled={!prereqFile || prereqImporting}
            className="px-4 py-2 bg-[var(--accent-soft)] border border-[var(--border)] text-[var(--accent)] rounded-xl text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
          >
            {prereqImporting ? "Importing…" : "Import"}
          </button>
        </div>
      </section>

      {/* Audit Import */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Audit Import</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Upload a new degree audit PDF to refresh your data.</p>
        </div>
        <div className="px-5 py-4">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-soft)] border border-[var(--border)] text-[var(--accent)] rounded-xl text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Audit PDF
          </Link>
        </div>
      </section>

      {/* Manage Semesters */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Semesters</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Add semesters from the{" "}
            <Link href="/" className="text-[var(--accent)] hover:underline">Audit Plan</Link>.
            Delete planned semesters here.
          </p>
        </div>
        {semesters.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--text-muted)] text-center">No semesters yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {semesters.map((sem) => (
              <div key={sem.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <span className="text-sm text-[var(--text-primary)]">{sem.label}</span>
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                    sem.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                    sem.status === "in_progress" ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--border)]" :
                    "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--border)]"
                  }`}>{sem.status.replace("_", " ")}</span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{sem.courses.length} courses</span>
                {sem.status === "planned" && (
                  deleteConfirm === sem.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteSemester(sem.id)}
                        disabled={saving}
                        className="text-xs px-2 py-1 bg-red-500/15 border border-rose-200 text-rose-600 rounded-lg hover:bg-red-500/25 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs px-2 py-1 bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-subtle)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(sem.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-rose-600 transition-colors"
                    >
                      Delete
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Course Management */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Course tools</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Open the searchable course workspace for audit, catalog, and planned course details.
          </p>
        </div>
        <div className="px-5 py-4">
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-soft)] border border-[var(--border)] text-[var(--accent)] rounded-xl text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Open Courses
          </Link>
        </div>
      </section>
    </div>
  );
}
