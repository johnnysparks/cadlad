import { describe, expect, it } from "vitest";
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt } from "../prompts.js";
import type { ScoreBreakdown, TaskSpec } from "../types.js";

describe("eval prompts", () => {
  const task: TaskSpec = {
    id: "box-with-hole",
    difficulty: 1,
    description: "A box with a hole.",
    acceptance: {
      body_count: 1,
      validation_errors: 0,
    },
    api_surface: ["box", "cylinder", "subtract", "translate"],
    reference_images: ["box-with-hole-iso.png"],
  };

  it("builds system prompt with required contract and API subset", () => {
    const prompt = buildSystemPrompt(task);
    expect(prompt).toContain("You are a 3D CAD modeling assistant");
    expect(prompt).toContain("Coordinate system: Z-up");
    expect(prompt).toContain("Output ONLY the .forge.ts code in a ```typescript fence.");
    expect(prompt).toContain("- box:");
    expect(prompt).toContain("- subtract:");
  });

  it("builds retry prompt with score and previous code", () => {
    const score: ScoreBreakdown = {
      total: 75,
      pass: true,
      geometry: 80,
      constraints: 70,
      api: 90,
      judge: 0,
      weights: { geometry: 0.44, constraints: 0.33, api: 0.22, judge: 0 },
    };
    const prompt = buildRetryPrompt(task, "return box(1,1,1);", ["Volume too low"], score);

    expect(prompt).toContain("What went wrong");
    expect(prompt).toContain("Volume too low");
    expect(prompt).toContain("Scores: total=75.00");
    expect(prompt).toContain("```typescript");
  });

  it("builds user prompt with acceptance", () => {
    const prompt = buildUserPrompt(task);
    expect(prompt).toContain("TASK ID: box-with-hole");
    expect(prompt).toContain("- body_count: 1");
  });
});
