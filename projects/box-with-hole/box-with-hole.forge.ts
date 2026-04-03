return defineScene({
  meta: {
    id: "box-with-hole",
    name: "Box with Hole",
    description: "Strict forge.ts scene envelope for a hello-world subtractive model.",
    version: "0.1.0",
    tags: ["example", "strict-scene"],
  },
  params: {
    width: { value: mm(60), min: 20, max: 200, unit: "mm", label: "Width" },
    depth: { value: mm(40), min: 20, max: 200, unit: "mm", label: "Depth" },
    height: { value: mm(20), min: 5, max: 100, unit: "mm", label: "Height" },
    holeRadius: { value: mm(8), min: 2, max: 30, unit: "mm", label: "Hole Radius" },
  },
  features: [
    { id: "base.box", kind: "primitive.box", label: "Main body" },
    { id: "hole.cylinder", kind: "primitive.cylinder", label: "Through hole cutter" },
  ],
  validators: [
    ({ params }) =>
      params.holeRadius * 2 >= params.width
        ? "Hole diameter must be smaller than width."
        : undefined,
  ],
  tests: [
    {
      id: "hole-through",
      run: ({ params }) =>
        params.height <= 0 ? "Height must be positive." : undefined,
    },
  ],
  model: ({ params }) => {
    const base = box(params.width, params.depth, params.height).color("#5f87c6");
    const hole = cylinder(params.height + 2, params.holeRadius);
    return base.subtract(hole);
  },
});
