import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "@cadlad/kernel/manifold-backend.js";
import { assembly } from "@cadlad/api/assembly.js";
import { box } from "@cadlad/kernel/primitives.js";

beforeAll(async () => {
  await initManifold();
});

describe("Assembly", () => {
  it("collects parts", () => {
    const asm = assembly("test")
      .add("a", box(10, 10, 10))
      .add("b", box(5, 5, 5), [20, 0, 0]);
    expect(asm.parts()).toHaveLength(2);
  });

  it("toBodies returns named bodies", () => {
    const bodies = assembly("frame")
      .add("left", box(10, 10, 10))
      .add("right", box(10, 10, 10), [20, 0, 0])
      .toBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].name).toBe("frame/left");
    expect(bodies[1].name).toBe("frame/right");
  });

  it("toBodies preserves part colors", () => {
    const bodies = assembly("colored")
      .add("red", box(10, 10, 10).color("#ff0000"))
      .add("blue", box(10, 10, 10).color("#0000ff"), [20, 0, 0])
      .toBodies();
    expect(bodies[0].color![0]).toBeCloseTo(1, 1); // red
    expect(bodies[1].color![2]).toBeCloseTo(1, 1); // blue
  });

  it("toSolid merges into one body", () => {
    const s = assembly("merged")
      .add("a", box(10, 10, 10))
      .add("b", box(10, 10, 10), [20, 0, 0])
      .toSolid();
    expect(s.volume()).toBeGreaterThan(1000);
  });

  it("empty assembly throws on toSolid", () => {
    expect(() => assembly("empty").toSolid()).toThrow("empty");
  });
});
