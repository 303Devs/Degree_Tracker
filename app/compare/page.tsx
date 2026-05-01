"use client";

import { useState, useEffect } from "react";
import type { PlanComparisonResult } from "@/lib/plan-types";
import ComparisonView from "@/components/ComparisonView";

export default function ComparePage() {
  const [result, setResult] = useState<PlanComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/compare")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: PlanComparisonResult) => {
        setResult(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#d4a843] mb-1">
          Plan Comparison
        </h1>
        <p className="text-sm text-[#6a6a8a]">
          Side-by-side comparison of degree plan variants
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-[#6a6a8a] text-sm">Loading comparison…</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400 font-medium">
            Comparison failed
          </p>
          <p className="text-xs text-red-400/70 mt-1">{error}</p>
        </div>
      )}

      {/* Validation issues (warnings) */}
      {result && result.issues.length > 0 && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <p className="text-sm text-yellow-400 font-medium mb-2">
            Validation Notes ({result.issues.length})
          </p>
          <ul className="space-y-1">
            {result.issues.slice(0, 10).map((issue, i) => (
              <li key={i} className="text-xs text-yellow-400/70">
                [{issue.type}] {issue.message}
              </li>
            ))}
            {result.issues.length > 10 && (
              <li className="text-xs text-yellow-400/50">
                …and {result.issues.length - 10} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Comparison Result */}
      {result?.success && result.comparison && (
        <ComparisonView comparison={result.comparison} />
      )}

      {/* Blocked */}
      {result && !result.success && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400 font-medium">
            Comparison blocked due to validation errors
          </p>
          <ul className="mt-2 space-y-1">
            {result.issues
              .filter((i) => i.type === "error")
              .map((issue, i) => (
                <li key={i} className="text-xs text-red-400/70">
                  {issue.message}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
