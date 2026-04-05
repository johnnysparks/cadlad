import { describe, expect, it, vi, beforeEach } from "vitest";
import { runEval } from "../runner.js";
import type { TaskSpec, ModelConfig } from "../types.js";
import * as modelAdapter from "../model-adapter.js";
import * as runtime from "@cadlad/api/runtime.js";
import { RenderSession } from "../renderer.js";
import * as imageSimilarity from "../image-similarity.js";
import * as manifoldBackend from "@cadlad/kernel/manifold-backend.js";
import * as fs from "node:fs";

// Mock the external dependencies
vi.mock("../model-adapter.js");
vi.mock("@cadlad/api/runtime.js");
vi.mock("../renderer.js");
vi.mock("../image-similarity.js");
vi.mock("@cadlad/kernel/manifold-backend.js");
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    readFileSync: vi.fn((path) => {
      const p = path.toString();
      if (p.endsWith("ref.png") || p.endsWith("snap1.png")) return Buffer.from("fake-image");
      return actual.readFileSync(path);
    }),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

describe("Evaluation Loop E2E (Mocked)", () => {
  const task: TaskSpec = {
    id: "e2e-test-box",
    difficulty: 1,
    description: "Create a simple box",
    acceptance: {
      body_count: 1,
      volume_min: 100,
      volume_max: 2000,
      validation_errors: 0,
    },
    api_surface: ["box"],
    max_iterations: 2,
    pass_threshold: 70,
    reference_images: ["ref.png"],
  };

  const config: ModelConfig = {
    provider: "openai",
    model: "gpt-4o",
    supportsVision: true,
  };

  const judgeConfig: ModelConfig = {
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    supportsVision: true,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(manifoldBackend.initManifold).mockResolvedValue(undefined as any);
  });

  it("completes a successful evaluation in one iteration", async () => {
    const mockCode = "return box(10, 10, 10);";
    
    // 1. Mock Model Response
    const mockAdapter = {
      supportsVision: true,
      generate: vi.fn().mockResolvedValue({
        text: `\`\`\`typescript\n${mockCode}\n\`\`\``,
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        raw: {},
      }),
    };
    vi.mocked(modelAdapter.createModelAdapter).mockReturnValue(mockAdapter as any);
    vi.mocked(modelAdapter.extractCode).mockReturnValue(mockCode);

    // 2. Mock Runtime Evaluation
    vi.mocked(runtime.evaluateModel).mockResolvedValue({
      errors: [],
      warnings: [],
      evaluation: {
        summary: { errorCount: 0, warningCount: 0 },
        stats: {
          available: true,
          data: {
            triangles: 12,
            bodies: 1,
            boundingBox: { min: [-5, -5, -5], max: [5, 5, 5] },
            volume: 1000,
            checks: { hasZeroVolume: false, hasDegenerateBoundingBox: false },
          },
        },
      } as any,
    } as any);

    // 3. Mock Renderer
    const mockRenderSession = {
      renderCode: vi.fn().mockResolvedValue(["/tmp/snap1.png"]),
    };

    // 4. Mock Image Similarity
    vi.mocked(imageSimilarity.scoreImageSimilarity).mockResolvedValue({
      score: 95,
      pairs: [{ reference: "ref.png", candidate: "/tmp/snap1.png", ssim: 0.95 }],
    });

    // 5. Mock Judge (indirectly via model adapter creation in runner)
    const mockJudgeAdapter = {
      supportsVision: true,
      generate: vi.fn().mockResolvedValue({
        text: "SCORE: 5\nPASS: yes\nFEEDBACK: Perfect box matching the description.",
        usage: { total_tokens: 50 },
      }),
    };
    // Second call to createModelAdapter is for the judge
    vi.mocked(modelAdapter.createModelAdapter).mockReturnValueOnce(mockAdapter as any).mockReturnValueOnce(mockJudgeAdapter as any);

    const result = await runEval(task, config, {
      judgeConfig,
      renderSession: mockRenderSession as any,
    });

    expect(result.pass).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.judge).toBe(100); // SCORE 5 -> 100%
    expect(mockAdapter.generate).toHaveBeenCalledTimes(1);
    expect(mockRenderSession.renderCode).toHaveBeenCalledWith(mockCode, expect.any(String), task.id, expect.any(Array));
    expect(imageSimilarity.scoreImageSimilarity).toHaveBeenCalled();
  });

  it("retries once on failure and then passes", async () => {
    const badCode = "return box(-1);"; // Invalid
    const goodCode = "return box(10, 10, 10);";

    // 1. Mock Model Responses (1st fail, 2nd success)
    const mockAdapter = {
      supportsVision: true,
      generate: vi.fn()
        .mockResolvedValueOnce({
          text: `\`\`\`typescript\n${badCode}\n\`\`\``,
          usage: { total_tokens: 100 },
        })
        .mockResolvedValueOnce({
          text: `\`\`\`typescript\n${goodCode}\n\`\`\``,
          usage: { total_tokens: 100 },
        }),
    };
    vi.mocked(modelAdapter.createModelAdapter).mockReturnValue(mockAdapter as any);
    vi.mocked(modelAdapter.extractCode)
      .mockReturnValueOnce(badCode)
      .mockReturnValueOnce(goodCode);

    // 2. Mock Runtime Evaluation
    vi.mocked(runtime.evaluateModel)
      .mockResolvedValueOnce({
        errors: ["Invalid dimensions"],
        warnings: [],
        evaluation: { summary: { errorCount: 1, warningCount: 0 }, stats: { available: false } } as any,
      } as any)
      .mockResolvedValueOnce({
        errors: [],
        warnings: [],
        evaluation: {
          summary: { errorCount: 0, warningCount: 0 },
          stats: {
            available: true,
            data: {
              triangles: 12,
              bodies: 1,
              boundingBox: { min: [-5, -5, -5], max: [5, 5, 5] },
              volume: 1000,
              checks: { hasZeroVolume: false, hasDegenerateBoundingBox: false },
            },
          },
        } as any,
      } as any);

    const result = await runEval(task, config);

    expect(result.pass).toBe(true);
    expect(result.iterations).toBe(2);
    expect(mockAdapter.generate).toHaveBeenCalledTimes(2);
  });
});
