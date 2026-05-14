import { NextRequest, NextResponse } from "next/server";
import { createManualRequirement, readEffectiveRequirements } from "@/lib/data";
import type { RequirementGroup } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const requirements = readEffectiveRequirements();
    return NextResponse.json(requirements);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read requirements: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<RequirementGroup>;
    const created = createManualRequirement(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("already exists") ? 409 : msg.includes("required") || msg.includes("invalid") || msg.includes("must") || msg.includes("subset") || msg.includes("exceed") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
