import fs from "fs";
import path from "path";

export interface LLMSettings {
  provider: "anthropic" | "openai" | "google";
  model: string;
}

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");
const ENV_LOCAL_PATH = path.join(process.cwd(), ".env.local");

const DEFAULTS: LLMSettings = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
};

const PROVIDER_ENV_KEY: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function getApiKey(provider: string): string {
  const envKey = PROVIDER_ENV_KEY[provider];
  if (!envKey) return "";

  // Read .env.local directly (not process.env, which only loads at startup)
  try {
    const content = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
    const parsed = parseEnvFile(content);
    if (parsed[envKey]) return parsed[envKey];
  } catch {
    // .env.local doesn't exist
  }

  // Fall back to process.env
  return process.env[envKey] ?? "";
}

export function saveApiKey(provider: string, key: string): void {
  const envKey = PROVIDER_ENV_KEY[provider];
  if (!envKey) return;

  let content = "";
  try {
    content = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const lines = content.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) return line;
    const lineKey = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (lineKey === envKey) {
      found = true;
      return `${envKey}=${key}`;
    }
    return line;
  });

  if (!found) {
    // Remove trailing empty lines then append
    while (updated.length && updated[updated.length - 1].trim() === "") {
      updated.pop();
    }
    updated.push(`${envKey}=${key}`, "");
  }

  fs.writeFileSync(ENV_LOCAL_PATH, updated.join("\n"), "utf-8");
}

export function getSettings(): LLMSettings {
  let saved: Partial<LLMSettings> = {};
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    saved = JSON.parse(raw) as Partial<LLMSettings>;
  } catch {
    // File doesn't exist or is invalid — use defaults
  }

  return {
    provider: saved.provider ?? DEFAULTS.provider,
    model: saved.model ?? DEFAULTS.model,
  };
}

export function saveSettings(settings: LLMSettings): void {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function getFullConfig(): LLMSettings & { apiKey: string } {
  const settings = getSettings();
  return {
    ...settings,
    apiKey: getApiKey(settings.provider),
  };
}
