import { NextResponse } from "next/server";
import { readPrograms } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const programs = readPrograms();
    return NextResponse.json(programs);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read programs: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
