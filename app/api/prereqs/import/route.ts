/**
 * POST /api/prereqs/import
 *
 * Accepts a JSON body (or multipart file) from the cu-prereq-scraper project.
 * Expected format: Array of { courseId: string, prereqs: PrereqRule | null, coreqs: PrereqRule | null }
 * or a map of courseId → { prereqs, coreqs }.
 *
 * Attaches prereq rules to matching courses in the data store.
 */

import { NextRequest, NextResponse } from "next/server";
import { readCourses, writeCourses } from "@/lib/data";
import type { PrereqRule } from "@/lib/types";

export const runtime = "nodejs";

interface PrereqEntry {
  courseId: string;
  name?: string;
  credits?: number;
  description?: string;
  prereqs: PrereqRule | null;
  coreqs?: PrereqRule | null;
}

/** Convert "STAT 3100" → "STAT-3100" */
function spaceToDash(id: string): string {
  return id.replace(/\s+/g, "-");
}

/** Recursively convert all courseIds in a PrereqRule tree from space to dash format */
function convertRuleCourseIds(rule: PrereqRule | null): PrereqRule | null {
  if (!rule) return null;
  if (rule.type === "course") {
    return { type: "course", courseId: spaceToDash(rule.courseId) };
  }
  return { ...rule, rules: rule.rules.map((r) => convertRuleCourseIds(r) as PrereqRule) };
}

/** Returns true if the name looks like a stub ("STAT 4250" or "STAT-4250") */
function isStubName(name: string, number: string): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed === number || trimmed === spaceToDash(number)) return true;
  if (/^[A-Z]+[\s-]\d+[A-Z]?$/.test(trimmed)) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let entries: PrereqEntry[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Accept as file upload
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
      const text = await file.text();
      const parsed = JSON.parse(text);
      entries = normalizePrereqData(parsed);
    } else {
      // Accept as JSON body
      const body = await request.json();
      entries = normalizePrereqData(body);
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "No prereq entries found in payload" }, { status: 400 });
    }

    const courses = readCourses();
    let updated = 0;
    let notFound = 0;

    for (const entry of entries) {
      // Normalize course ID format: "STAT3100" → "STAT-3100", or already "STAT-3100"
      const normalizedId = normalizeCourseId(entry.courseId);
      const idx = courses.findIndex(
        (c) => c.id === normalizedId || c.id === entry.courseId
      );
      if (idx === -1) {
        notFound++;
        continue;
      }
      const current = courses[idx];
      courses[idx] = {
        ...current,
        prereqs: convertRuleCourseIds(entry.prereqs),
        coreqs: convertRuleCourseIds(entry.coreqs ?? null),
        ...(entry.name && isStubName(current.name, current.number) ? { name: entry.name } : {}),
        ...(entry.credits && current.credits === 0 ? { credits: entry.credits } : {}),
        ...(entry.description && !current.description ? { description: entry.description } : {}),
        ...(entry.description && !current.notes ? { notes: entry.description } : {}),
      };
      updated++;
    }

    writeCourses(courses);

    return NextResponse.json({
      success: true,
      updated,
      notFound,
      total: entries.length,
    });
  } catch (err) {
    console.error("Prereq import error:", err);
    return NextResponse.json(
      { error: "Failed to import prereqs: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

function normalizeCourseId(id: string): string {
  // "STAT3100" → "STAT-3100"
  const m = id.match(/^([A-Z]+)(\d+.*)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return id;
}

function isValidPrereqEntry(item: unknown): item is PrereqEntry {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as Record<string, unknown>).courseId === "string" &&
    (item as Record<string, unknown>).courseId !== ""
  );
}

function normalizePrereqData(raw: unknown): PrereqEntry[] {
  if (Array.isArray(raw)) {
    return raw.filter(isValidPrereqEntry);
  }

  // Object map: { "STAT 3100": { number, name, credits, prereqs, coreqs }, ... }
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw as Record<string, unknown>).map(([courseId, val]) => {
      const v = val as { name?: string; credits?: number; description?: string; prereqs?: PrereqRule | null; coreqs?: PrereqRule | null };
      return { courseId, name: v.name, credits: v.credits, description: v.description, prereqs: v.prereqs ?? null, coreqs: v.coreqs ?? null };
    });
  }

  return [];
}
