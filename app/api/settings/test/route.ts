import { NextRequest, NextResponse } from "next/server";
import { callLLM, type LLMConfig } from "@/lib/llm";
import { getApiKey } from "@/lib/settings";

const VALID_PROVIDERS = ["anthropic", "openai", "google"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;
  const { provider, model } = body;

  if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json({ success: false, error: "Invalid provider" }, { status: 400 });
  }

  if (typeof model !== "string" || !model) {
    return NextResponse.json({ success: false, error: "provider and model are required" }, { status: 400 });
  }

  const apiKey = getApiKey(String(provider));
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "No API key configured for this provider" }, { status: 400 });
  }

  const config: LLMConfig = {
    provider: provider as LLMConfig["provider"],
    model,
    apiKey,
  };

  try {
    await Promise.race([
      callLLM(config, "You are a helpful assistant.", "Respond with OK"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out after 15 seconds")), 15_000)
      ),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message });
  }
}
