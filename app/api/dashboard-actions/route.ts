import { NextResponse } from "next/server";
import { readDashboardActionLocalStates } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(readDashboardActionLocalStates());
  } catch (err) {
    return NextResponse.json({ error: "Failed to read dashboard action state: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
