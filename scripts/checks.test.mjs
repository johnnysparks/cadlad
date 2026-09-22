import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe.each([
  ["typecheck", "typescript/bin/tsc", ["--noEmit"]],
  ["test", "vitest/vitest.mjs", ["run"]],
  ["lint", "eslint/bin/eslint.js", ["apps/", "packages/", "infra/", "scripts/"]],
])("%s command", (name, binary, args) => {
  function setup(toolSource) {
    const root = mkdtempSync(join(tmpdir(), "cadlad-check-"));
    roots.push(root);
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    for (const file of [`${name}.mjs`, "run-check.mjs"]) {
      cpSync(new URL(file, import.meta.url), join(root, "scripts", file));
    }
    if (toolSource !== undefined) {
      const tool = join(root, "node_modules", binary);
      mkdirSync(dirname(tool), { recursive: true });
      writeFileSync(tool, toolSource);
    }
    return {
      root,
      run: () => spawnSync(process.execPath, [join(root, "scripts", `${name}.mjs`), "--fixture-arg"], {
        // Exercise invocation outside the checkout, without tools on PATH.
        cwd: tmpdir(), env: { ...process.env, PATH: "" }, encoding: "utf8",
      }),
    };
  }

  it("fails with an actionable message when the local tool is missing", () => {
    const result = setup().run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing local tool");
    expect(result.stderr).toContain("npm ci");
  });

  it("preserves all diagnostics and the tool's nonzero status", () => {
    const result = setup('console.error("missing dependency AND genuine type error"); process.exit(2);').run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing dependency AND genuine type error");
  });

  it("fails on a tool crash instead of treating missing status as success", () => {
    const result = setup('process.kill(process.pid, "SIGTERM");').run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SIGTERM");
  });

  it("runs the pinned tool in the repository and forwards arguments", () => {
    const fixture = setup('console.log(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));');
    const result = fixture.run();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    // macOS may canonicalize /var to /private/var in process.cwd().
    expect(output.cwd.replace(/^\/private/, "")).toBe(fixture.root.replace(/^\/private/, ""));
    expect(output.args).toEqual([...args, "--fixture-arg"]);
  });
});
