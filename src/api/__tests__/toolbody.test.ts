import { beforeAll, describe, expect, it } from "vitest";
import { box } from "../../engine/primitives.js";
import { initManifold } from "../../engine/manifold-backend.js";
import { isToolBody, toolBody } from "../toolbody.js";

beforeAll(async () => {
  await initManifold();
});

describe("toolBody", () => {
  it("wraps a solid as construction geometry", () => {
    const cutter = toolBody("main-cut", box(10, 10, 10));
    expect(cutter.name).toBe("main-cut");
    expect(cutter.solid.volume()).toBeGreaterThan(0);
    expect(isToolBody(cutter)).toBe(true);
  });
});
