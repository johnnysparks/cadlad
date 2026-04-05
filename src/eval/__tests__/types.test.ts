import { describe, expect, it } from "vitest";
import { parseTaskSpec } from "../types.js";

describe("parseTaskSpec", () => {
  it("parses literal block descriptions used by benchmark tasks", () => {
    const spec = parseTaskSpec(`id: demo\ndifficulty: 1\ndescription: |\n  First line\n  Second line\nacceptance:\n  body_count: 1\napi_surface: [box]\n`);

    expect(spec.description).toBe("First line\nSecond line");
  });

  it("parses folded descriptions", () => {
    const spec = parseTaskSpec(`id: folded\ndifficulty: 1\ndescription: >\n  Line one\n  Line two\nacceptance:\n  body_count: 1\napi_surface: [box]\n`);

    expect(spec.description).toBe("Line one Line two");
  });
});
