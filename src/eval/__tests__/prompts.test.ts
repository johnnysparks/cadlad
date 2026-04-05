import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../prompts.js";
import type { TaskSpec } from "../types.js";

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

  it("builds system prompt with API subset", () => {
    const prompt = buildSystemPrompt(task);
    expect(prompt).toContain("API REFERENCE (subset)");
    expect(prompt).toContain("- box:");
    expect(prompt).toContain("- subtract:");
  });

  it("builds user prompt with acceptance and references", () => {
    const prompt = buildUserPrompt(task);
    expect(prompt).toContain("TASK ID: box-with-hole");
    expect(prompt).toContain("- body_count: 1");
    expect(prompt).toContain("REFERENCE IMAGES");
  });
});
