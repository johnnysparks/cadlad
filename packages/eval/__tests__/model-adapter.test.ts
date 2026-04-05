import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCode, parseModelConfig } from "../model-adapter.js";
import type { ModelConfig } from "../types.js";

const originalFetch = globalThis.fetch;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalAnthropicModel = process.env.ANTHROPIC_MODEL;
const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  process.env.OPENAI_MODEL = originalOpenAiModel;
  process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
  process.env.ANTHROPIC_MODEL = originalAnthropicModel;
  process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl;
  vi.restoreAllMocks();
});

describe("parseModelConfig", () => {
  it("parses ollama model references", () => {
    const config = parseModelConfig("ollama://llama3.2");
    expect(config).toEqual({
      provider: "ollama",
      model: "llama3.2",
      endpoint: "http://localhost:11434",
    });
  });

  it("sets key env var defaults for hosted providers", () => {
    expect(parseModelConfig("openai://gpt-4o-mini")).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY",
    });

    expect(parseModelConfig("anthropic://claude-sonnet-4-6")).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    });
  });

  it("parses lmstudio model references without requiring an API key", () => {
    const config = parseModelConfig("lmstudio://google/gemma-4-26b-a4b");
    expect(config).toEqual({
      provider: "openai",
      model: "google/gemma-4-26b-a4b", supportsVision: true,
      endpoint: "http://localhost:1234",
      requiresApiKey: false,
    });
  });

  it("parses openai-compatible http model references", () => {
    const config = parseModelConfig("http://localhost:1234/google%2Fgemma-4-26b-a4b");
    expect(config).toEqual({
      provider: "openai",
      model: "google/gemma-4-26b-a4b",
      endpoint: "http://localhost:1234",
      requiresApiKey: false,
    });
  });

  it("rejects malformed references", () => {
    expect(() => parseModelConfig("llama3.2")).toThrow("Invalid model reference");
  });

  it("parses context-loop aliases for codex/cloud style environments", () => {
    process.env.OPENAI_MODEL = "gpt-5";
    process.env.OPENAI_BASE_URL = "https://gateway.example.com";
    const config = parseModelConfig("context-loop");
    expect(config).toEqual({
      provider: "openai",
      model: "gpt-5",
      endpoint: "https://gateway.example.com",
      requiresApiKey: false,
      apiKeyEnvVar: "OPENAI_API_KEY",
    });
  });

  it("accepts spaced current context loop aliases", () => {
    process.env.OPENAI_MODEL = "gpt-5";
    process.env.OPENAI_BASE_URL = "https://gateway.example.com";

    expect(parseModelConfig("current context loop")).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      endpoint: "https://gateway.example.com",
    });

    expect(parseModelConfig("openai://current context loop")).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      endpoint: "https://gateway.example.com",
    });
  });

  it("parses provider-scoped context-loop aliases for claude code style environments", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_BASE_URL = "https://claude-gateway.example.com";
    const config = parseModelConfig("anthropic://current-context-loop");
    expect(config).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      endpoint: "https://claude-gateway.example.com",
      requiresApiKey: false,
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    });
  });
});

describe("generateCode", () => {
  it("calls ollama and maps usage counters", async () => {
    const responsePayload = {
      response: "```ts\nreturn box(10, 10, 10);\n```",
      prompt_eval_count: 21,
      eval_count: 40,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responsePayload),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config: ModelConfig = { provider: "ollama", model: "llama3.2" };
    const result = await generateCode(config, {
      messages: [{ role: "user", content: "Make a box" }],
      images: [new Uint8Array([1, 2, 3])],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.text).toContain("return box");
    expect(result.usage.total_tokens).toBe(61);
  });

  it("calls openai chat completions and uses API key", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "return cylinder(10, 5);" } }],
        usage: { prompt_tokens: 13, completion_tokens: 9, total_tokens: 22 },
      }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateCode(
      { provider: "openai", model: "gpt-4o-mini" },
      { messages: [{ role: "user", content: "Make a cylinder" }] },
    );

    expect(result.text).toBe("return cylinder(10, 5);");
    expect(result.usage.total_tokens).toBe(22);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ authorization: "Bearer test-key" }),
    });
  });

  it("calls anthropic messages API", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        content: [{ type: "text", text: "return sphere(8);" }],
        usage: { input_tokens: 17, output_tokens: 6 },
      }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateCode(
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      {
        messages: [
          { role: "system", content: "You are a CAD model generator." },
          { role: "user", content: "Make a sphere" },
        ],
      },
    );

    expect(result.text).toBe("return sphere(8);");
    expect(result.usage.total_tokens).toBe(23);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails clearly when API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateCode(
        { provider: "openai", model: "gpt-4o-mini" },
        { messages: [{ role: "user", content: "hello" }] },
      ),
    ).rejects.toThrow("Missing API key environment variable");
  });

  it("calls openai-compatible endpoint without API key when disabled", async () => {
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "return roundedBox(20, 20, 20, 2);" } }],
        usage: { prompt_tokens: 7, completion_tokens: 8, total_tokens: 15 },
      }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateCode(
      {
        provider: "openai",
        model: "google/gemma-4-26b-a4b", supportsVision: true,
        endpoint: "http://localhost:1234",
        requiresApiKey: false,
      },
      { messages: [{ role: "user", content: "Make a rounded box" }] },
    );

    expect(result.text).toContain("roundedBox");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/v1/chat/completions",
      expect.not.objectContaining({
        headers: expect.objectContaining({ authorization: expect.any(String) }),
      }),
    );
  });
});
