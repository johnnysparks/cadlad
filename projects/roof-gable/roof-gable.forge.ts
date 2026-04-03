return defineScene({
  meta: {
    id: "roof-gable",
    name: "Roof Gable Strict Feature Demo",
    description: "Example of registry-backed wall.straight + roof.gable features.",
    version: "0.1.0",
    tags: ["example", "strict-scene", "roof"],
  },
  features: [
    feature("wall.straight", {
      id: "wall-main",
      length: 80,
      height: 30,
      thickness: 3,
    }),
    feature("roof.gable", {
      id: "roof-main",
      hostId: "wall-main",
      width: 82,
      depth: 44,
      pitchDeg: 32,
      overhang: 1,
    }),
  ],
  model: () => {
    const wallMass = box(80, 40, 30).translate(0, 0, 15).color("#cfbea8");
    const roofHeight = Math.tan((32 * Math.PI) / 180) * (82 / 2);
    const roofProfile = Sketch.begin(-41, 0)
      .lineTo(0, roofHeight)
      .lineTo(41, 0)
      .close();
    const roofSolid = roofProfile
      .extrude(44)
      .translate(0, 0, 30)
      .translate(0, -22, 0)
      .color("#8c3b2f");

    return wallMass.union(roofSolid);
  },
});
