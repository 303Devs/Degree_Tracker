import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, getApiKey, saveApiKey } from "@/lib/settings";

const VALID_PROVIDERS = ["anthropic", "openai", "google"] as const;

export async function GET() {
  const settings = getSettings();
  const apiKey = getApiKey(settings.provider);
  return NextResponse.json({ ...settings, hasKey: Boolean(apiKey) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;
  const { provider, model, apiKey } = body;

  if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (typeof model !== "string" || !model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  saveSettings({
    provider: provider as typeof VALID_PROVIDERS[number],
    model: String(model),
  });

  if (typeof apiKey === "string" && apiKey) {
    saveApiKey(String(provider), apiKey);
  }

  return NextResponse.json({ success: true });
}
