import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { CAPABILITIES } from "@cadlad/api/capabilities.js";
import { runEval } from "../runner.js";
import * as modelAdapter from "../model-adapter.js";
import type { TaskSpec } from "../types.js";

vi.mock("../model-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("../model-adapter.js")>("../model-adapter.js");
  return { ...actual, createModelAdapter: vi.fn() };
});

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("eval capability execution", () => {
  it("evaluates every advertised example through the real eval runner", async () => {
    const examples = CAPABILITIES.filter((capability) => capability.example);

    for (const [index, capability] of examples.entries()) {
      const source = capability.example as string;
      vi.mocked(modelAdapter.createModelAdapter).mockReturnValueOnce({
        supportsVision: false,
        generate: vi.fn().mockResolvedValue({
          text: source,
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          raw: { test: true },
        }),
      });

      const task: TaskSpec = {
        id: `capability-${capability.name}-${index}`,
        difficulty: 1,
        description: `Execute the ${capability.name} capability example.`,
        acceptance: {},
        api_surface: [],
        reference_images: [],
        max_iterations: 1,
        pass_threshold: 0,
      };

      const result = await runEval(task, {
        provider: "manual",
        model: "capability-test",
      });

      expect(result.pass, capability.name).toBe(true);
      expect(result.iterations, capability.name).toBe(1);
      expect(readFileSync(result.source_path, "utf8"), capability.name).toBe(source);
      expect(readFileSync(result.log_path, "utf8"), capability.name).toContain('"event":"eval.completed"');

      tempRoots.push(resolve("infra/eval/eval-logs", task.id));
      tempRoots.push(resolve("infra/eval/eval-scratch", task.id));
    }
  }, 30_000);
});
