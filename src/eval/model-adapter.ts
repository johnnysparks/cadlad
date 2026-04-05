import type { ModelConfig } from "./types.js";

export interface ModelMessage {
  role: "system" | "user";
  content: string;
}

export interface GenerateCodeRequest {
  messages: ModelMessage[];
  images?: Uint8Array[];
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateCodeResponse {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  raw: unknown;
}

const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com";
const DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com";

export async function generateCode(config: ModelConfig, request: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  switch (config.provider) {
    case "ollama":
      return generateViaOllama(config, request);
    case "openai":
      return generateViaOpenAI(config, request);
    case "anthropic":
      return generateViaAnthropic(config, request);
    default:
      throw new Error(`Unsupported model provider: ${String(config.provider)}`);
  }
}

export function parseModelConfig(modelRef: string): ModelConfig {
  const match = modelRef.match(/^(ollama|openai|anthropic):\/\/(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid model reference \"${modelRef}\". Expected format: <provider>://<model>, e.g. ollama://llama3.2`,
    );
  }

  const provider = match[1] as ModelConfig["provider"];
  const model = match[2].trim();

  if (!model) {
    throw new Error(`Model reference \"${modelRef}\" is missing a model name.`);
  }

  if (provider === "openai") {
    return { provider, model, endpoint: DEFAULT_OPENAI_ENDPOINT, apiKeyEnvVar: "OPENAI_API_KEY" };
  }

  if (provider === "anthropic") {
    return { provider, model, endpoint: DEFAULT_ANTHROPIC_ENDPOINT, apiKeyEnvVar: "ANTHROPIC_API_KEY" };
  }

  return { provider, model, endpoint: DEFAULT_OLLAMA_ENDPOINT };
}

async function generateViaOllama(config: ModelConfig, request: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  const endpoint = config.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  const prompt = flattenPrompt(request.messages);

  const response = await fetch(`${trimTrailingSlash(endpoint)}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: {
        temperature: request.temperature ?? config.temperature,
        num_predict: request.maxTokens ?? config.maxTokens,
      },
      images: request.images?.map((img) => toBase64(img)),
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${extractErrorMessage(payload)}`);
  }

  const result = payload as {
    response?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  if (!result.response) {
    throw new Error("Ollama response missing generated text.");
  }

  const promptTokens = result.prompt_eval_count ?? 0;
  const completionTokens = result.eval_count ?? 0;

  return {
    text: result.response,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    raw: payload,
  };
}

async function generateViaOpenAI(config: ModelConfig, request: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  const endpoint = config.endpoint ?? DEFAULT_OPENAI_ENDPOINT;
  const apiKey = resolveApiKey(config, "OPENAI_API_KEY");

  const response = await fetch(`${trimTrailingSlash(endpoint)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildOpenAIMessages(request),
      temperature: request.temperature ?? config.temperature,
      max_tokens: request.maxTokens ?? config.maxTokens,
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${extractErrorMessage(payload)}`);
  }

  const result = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const first = result.choices?.[0]?.message?.content;
  const text = typeof first === "string"
    ? first
    : Array.isArray(first)
      ? first.map((part) => (part.type === "text" ? part.text ?? "" : "")).join("")
      : "";

  if (!text.trim()) {
    throw new Error("OpenAI response missing generated text.");
  }

  const promptTokens = result.usage?.prompt_tokens ?? 0;
  const completionTokens = result.usage?.completion_tokens ?? 0;

  return {
    text,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: result.usage?.total_tokens ?? promptTokens + completionTokens,
    },
    raw: payload,
  };
}

async function generateViaAnthropic(config: ModelConfig, request: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  const endpoint = config.endpoint ?? DEFAULT_ANTHROPIC_ENDPOINT;
  const apiKey = resolveApiKey(config, "ANTHROPIC_API_KEY");

  const response = await fetch(`${trimTrailingSlash(endpoint)}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: extractSystemPrompt(request.messages),
      max_tokens: request.maxTokens ?? config.maxTokens ?? 1024,
      temperature: request.temperature ?? config.temperature,
      messages: [
        {
          role: "user",
          content: buildAnthropicContent(request),
        },
      ],
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${extractErrorMessage(payload)}`);
  }

  const result = payload as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("");

  if (!text.trim()) {
    throw new Error("Anthropic response missing generated text.");
  }

  const promptTokens = result.usage?.input_tokens ?? 0;
  const completionTokens = result.usage?.output_tokens ?? 0;

  return {
    text,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    raw: payload,
  };
}

function buildOpenAIMessages(request: GenerateCodeRequest): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (!request.images || request.images.length === 0) {
    return messages;
  }

  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""))
    .join("\n\n")
    .trim();

  return [
    ...messages.filter((message) => message.role === "system"),
    {
      role: "user",
      content: [
        { type: "text", text },
        ...request.images.map((image) => ({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${toBase64(image)}` },
        })),
      ],
    },
  ];
}

function buildAnthropicContent(request: GenerateCodeRequest): Array<Record<string, unknown>> {
  const userText = request.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];

  for (const image of request.images ?? []) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: toBase64(image),
      },
    });
  }

  return content;
}

function flattenPrompt(messages: ModelMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n")
    .trim();
}

function extractSystemPrompt(messages: ModelMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
}

function resolveApiKey(config: ModelConfig, defaultEnv: string): string {
  const variable = config.apiKeyEnvVar ?? defaultEnv;
  const value = process.env[variable];
  if (!value) {
    throw new Error(`Missing API key environment variable: ${variable}`);
  }
  return value;
}

function trimTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Unknown error";
  }

  const data = payload as { error?: unknown; message?: unknown };
  if (typeof data.error === "string") {
    return data.error;
  }
  if (data.error && typeof data.error === "object") {
    const nested = data.error as { message?: unknown };
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }
  if (typeof data.message === "string") {
    return data.message;
  }

  return "Unknown error";
}
