import { NextRequest, NextResponse } from "next/server";
import { parseAuditPDF } from "@/lib/parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseAuditPDF(buffer);

    return NextResponse.json({
      success: true,
      data: result,
      fileName: file.name,
    });
  } catch (err) {
    console.error("Audit upload error:", err);
    return NextResponse.json(
      { error: "Failed to parse PDF: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
