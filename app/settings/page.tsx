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
    return <div className="flex items-center justify-center min-h-screen text-[#6a6a8a]">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-400 text-sm p-8">
        Failed to load settings: {error}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#d0d0e8]">Settings</h2>
        <p className="text-[#6a6a8a] text-sm mt-1">Manage semesters, courses, and audit imports.</p>
      </div>

      {/* LLM Provider */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">LLM Provider</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">Configure the AI model used to parse degree audits.</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6a6a8a] mb-1.5">Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
              >
                {Object.entries(PROVIDER_MODELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6a6a8a] mb-1.5">Model</label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
              >
                {(PROVIDER_MODELS[llmProvider]?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-[#6a6a8a]">API Key</label>
              <span className={`text-xs ${llmHasKey ? "text-green-400" : "text-[#4a4a6a]"}`}>
                {llmHasKey ? "Key configured ✓" : "No key set"}
              </span>
            </div>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="Enter new API key…"
              className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#1e1e34] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50 placeholder:text-[#3a3a5a]"
            />
          </div>
          {llmStatus && (
            <p className={`text-xs ${llmStatus.ok ? "text-green-400" : "text-red-400"}`}>
              {llmStatus.msg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleLlmTest}
              disabled={llmTesting || llmSaving}
              className="px-4 py-2 bg-[#1e1e34] border border-[#2a2a3e] text-[#8888a8] rounded-xl text-sm hover:bg-[#2a2a40] hover:text-[#d0d0e8] transition-colors disabled:opacity-50"
            >
              {llmTesting ? "Testing…" : "Test Connection"}
            </button>
            <button
              onClick={handleLlmSave}
              disabled={llmSaving || llmTesting}
              className="px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors disabled:opacity-50"
            >
              {llmSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </section>

      {/* Prerequisite Data */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Prerequisite Data</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">Import prerequisite data from the cu-prereq-scraper to enrich course details.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-[#6a6a8a] mb-1.5">Scraper JSON file</label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => { setPrereqFile(e.target.files?.[0] ?? null); setPrereqResult(null); }}
              className="w-full text-xs text-[#8888a8] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#2a2a3e] file:bg-[#1e1e34] file:text-[#8888a8] file:text-xs hover:file:bg-[#2a2a40] file:cursor-pointer cursor-pointer"
            />
          </div>
          {prereqResult && (
            <p className={`text-xs ${prereqResult.ok ? "text-green-400" : "text-red-400"}`}>
              {prereqResult.msg}
            </p>
          )}
          <button
            onClick={handlePrereqImport}
            disabled={!prereqFile || prereqImporting}
            className="px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors disabled:opacity-50"
          >
            {prereqImporting ? "Importing…" : "Import"}
          </button>
        </div>
      </section>

      {/* Audit Import */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Audit Import</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">Upload a new degree audit PDF to refresh your data.</p>
        </div>
        <div className="px-5 py-4">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors"
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
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Semesters</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">
            Add semesters from the{" "}
            <Link href="/degree-plan" className="text-[#d4a843] hover:underline">Degree Plan</Link>.
            Delete planned semesters here.
          </p>
        </div>
        {semesters.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[#4a4a6a] text-center">No semesters yet.</div>
        ) : (
          <div className="divide-y divide-[#1a1a2e]">
            {semesters.map((sem) => (
              <div key={sem.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <span className="text-sm text-[#d0d0e8]">{sem.label}</span>
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                    sem.status === "completed" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    sem.status === "in_progress" ? "bg-[#d4a843]/10 text-[#d4a843] border-[#d4a843]/20" :
                    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                  }`}>{sem.status.replace("_", " ")}</span>
                </div>
                <span className="text-xs text-[#4a4a6a]">{sem.courses.length} courses</span>
                {sem.status === "planned" && (
                  deleteConfirm === sem.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteSemester(sem.id)}
                        disabled={saving}
                        className="text-xs px-2 py-1 bg-red-500/15 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs px-2 py-1 bg-[#1e1e34] border border-[#2a2a3e] text-[#6a6a8a] rounded-lg hover:bg-[#2a2a40] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(sem.id)}
                      className="text-xs text-[#4a4a6a] hover:text-red-400 transition-colors"
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
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Course Management</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">
            Add, edit, or delete courses with full field control.
          </p>
        </div>
        <div className="px-5 py-4">
          <Link
            href="/course-library"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] rounded-xl text-sm font-medium hover:bg-[#d4a843]/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Open Course Library
          </Link>
        </div>
      </section>
    </div>
  );
}
