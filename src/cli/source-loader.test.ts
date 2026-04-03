import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadModelSource } from "./source-loader.js";

describe("loadModelSource", () => {
  it("returns raw source for .forge.js files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cadlad-source-loader-"));
    try {
      const file = join(dir, "example.forge.js");
      writeFileSync(file, "return box(10, 10, 10);", "utf-8");

      const source = await loadModelSource(file);
      expect(source.trim()).toBe("return box(10, 10, 10);");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("transpiles TypeScript syntax in .forge.ts files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cadlad-source-loader-"));
    try {
      const file = join(dir, "typed.forge.ts");
      writeFileSync(file, "const size: number = 12;\nreturn box(size, size, size);", "utf-8");

      const source = await loadModelSource(file);
      expect(source).toContain("const size = 12;");
      expect(source).not.toContain(": number");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
