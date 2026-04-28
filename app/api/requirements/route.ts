import { NextResponse } from "next/server";
import { readRequirements } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const requirements = readRequirements();
    return NextResponse.json(requirements);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read requirements: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
