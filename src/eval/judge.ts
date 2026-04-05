import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { ModelAdapter } from "./model-adapter.js";
import type { TaskSpec } from "./types.js";

export interface JudgeVerdict {
  score: number;
  pass: boolean;
  feedback: string;
  normalized: number;
}

const ANGLE_PRIORITY = ["iso", "front", "right", "top"] as const;

export async function judgeModel(opts: {
  task: TaskSpec;
  screenshotPaths: string[];
  model: ModelAdapter;
  source?: string;
}): Promise<JudgeVerdict> {
  const selectedPaths = selectScreenshots(opts.screenshotPaths);
  const images = selectedPaths.map((path) => readFileSync(path));

  const prompt = [
    "You are evaluating a 3D CAD model. Score it 1-5.",
    "",
    `TASK: ${opts.task.description.trim()}`,
    "",
    "CRITERIA:",
    "5 = Clearly matches the description. Correct shape, proportions, and features.",
    "4 = Mostly correct. Minor issues (slightly wrong proportions, missing small detail).",
    "3 = Recognizable attempt. Right general shape but notable problems.",
    "2 = Partially relevant. Some elements present but major issues.",
    "1 = Wrong or broken. Does not resemble the description.",
    "",
    "Look at the screenshot(s) from multiple angles. Respond in EXACTLY this format:",
    "SCORE: <1-5>",
    "PASS: <yes/no>",
    "FEEDBACK: <one sentence>",
    opts.source ? `\nSOURCE (optional context):\n${opts.source}` : "",
  ].join("\n");

  const response = await opts.model.generate({
    messages: [{ role: "user", content: prompt }],
    images,
  });

  const scoreMatch = response.text.match(/SCORE:\s*(\d)/);
  const passMatch = response.text.match(/PASS:\s*(yes|no)/i);
  const feedbackMatch = response.text.match(/FEEDBACK:\s*(.+)/);

  if (!scoreMatch || !passMatch || !feedbackMatch) {
    return {
      score: 2,
      pass: false,
      feedback: "Judge response unparseable",
      normalized: 25,
    };
  }

  const score = clampScore(Number(scoreMatch[1]));
  const pass = passMatch[1].toLowerCase() === "yes";
  const feedback = feedbackMatch[1].trim();

  return {
    score,
    pass,
    feedback,
    normalized: (score - 1) * 25,
  };
}

function selectScreenshots(paths: string[]): string[] {
  if (paths.length <= 4) {
    return paths;
  }

  const chosen = new Set<string>();
  for (const angle of ANGLE_PRIORITY) {
    const match = paths.find((path) => basename(path).toLowerCase().includes(angle));
    if (match) {
      chosen.add(match);
    }
  }

  for (const path of paths) {
    if (chosen.size >= 4) {
      break;
    }
    chosen.add(path);
  }

  return Array.from(chosen).slice(0, 4);
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 2;
  }
  return Math.max(1, Math.min(5, Math.round(score)));
}
