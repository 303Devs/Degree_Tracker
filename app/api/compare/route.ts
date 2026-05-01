import { NextResponse } from "next/server";
import { readCourses, readRequirements } from "@/lib/data";
import { normalizePlansFromJson } from "@/lib/plan-normalization";
import { comparePlans } from "@/lib/plan-comparison";
import type { RawPlanData } from "@/lib/plan-types";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Load fixture data
    const fixtureRaw = fs.readFileSync(
      path.join(process.cwd(), "ml-dl-plans.json"),
      "utf-8",
    );
    const fixture: RawPlanData = JSON.parse(fixtureRaw);

    // Load courses and requirements from data layer
    const courses = readCourses();
    const requirements = readRequirements();

    // Normalize plans
    const normResult = await normalizePlansFromJson(fixture, courses);
    const hasErrors = normResult.issues.some((i) => i.type === "error");
    if (hasErrors || normResult.plans.length < 2) {
      return NextResponse.json(
        {
          error: "Plan normalization failed",
          issues: normResult.issues,
        },
        { status: 400 },
      );
    }

    const [planA, planB] = normResult.plans;

    // Run comparison
    const result = comparePlans(planA, planB, courses, requirements);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Comparison failed: " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    );
  }
}
