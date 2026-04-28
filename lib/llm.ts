export interface LLMConfig {
  provider: "anthropic" | "openai" | "google";
  model: string;
  apiKey: string;
}

export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, systemPrompt, userMessage);
    case "openai":
      return callOpenAI(config, systemPrompt, userMessage);
    case "google":
      return callGoogle(config, systemPrompt, userMessage);
    default:
      throw new Error(`Unknown provider: ${(config as LLMConfig).provider}`);
  }
}

async function callAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: config.apiKey });
  const response = await client.messages.create({
    model: config.model,
    max_tokens: 8096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected non-text response from Anthropic");
  return block.text;
}

async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: config.apiKey });
  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: 8096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
}

async function callGoogle(
  config: LLMConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(config.apiKey);
  const model = client.getGenerativeModel({
    model: config.model,
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userMessage);
  const text = result.response.text();
  if (!text) throw new Error("Empty response from Google Gemini");
  return text;
}
