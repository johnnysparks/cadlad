import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

describe("eval-score CLI", () => {
  it("uses the task pass_threshold instead of the default 70", () => {
    const root = mkdtempSync(join(tmpdir(), "cadlad-eval-score-"));
    try {
      const taskPath = join(root, "task.yaml");
      const codePath = join(root, "model.forge.ts");
      writeFileSync(taskPath, [
        "id: strict-threshold",
        "difficulty: 1",
        "description: A simple block",
        "acceptance:",
        "  body_count: 1",
        "api_surface: [box]",
        "pass_threshold: 101",
        "",
      ].join("\n"));
      writeFileSync(codePath, "return box(10, 10, 10);\n");

      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "apps/cli/index.ts", "eval-score", taskPath, codePath, "--json"],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout) as { pass: boolean; score: number; breakdown: { pass: boolean } };
      expect(output.score).toBe(100);
      expect(output.pass).toBe(false);
      expect(output.breakdown.pass).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
