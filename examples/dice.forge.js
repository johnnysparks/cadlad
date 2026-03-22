// Six-sided die with pip indentations
const size = param("Size", 16, { min: 10, max: 30, unit: "mm" });
const pipR = param("Pip Radius", 1.2, { min: 0.5, max: 2.5, unit: "mm" });
const pipDepth = param("Pip Depth", 0.8, { min: 0.3, max: 1.5, unit: "mm" });

const body = box(size, size, size).color("#f0f0f0");

const s = size / 2;
const g = size / 4;

// Pip cutter — sphere gives a nice rounded indentation
const pip = sphere(pipR);

// Helper: subtract a pip at an offset from a face
// Face normals: +Z(1), -Z(6), -Y(2), +Y(5), +X(3), -X(4)

let die = body;

// Face 1 — top (+Z): 1 center pip
die = die.subtract(pip.translate(0, 0, s));

// Face 6 — bottom (-Z): 6 pips
die = die.subtract(pip.translate(-g, -g, -s));
die = die.subtract(pip.translate(-g, 0, -s));
die = die.subtract(pip.translate(-g, g, -s));
die = die.subtract(pip.translate(g, -g, -s));
die = die.subtract(pip.translate(g, 0, -s));
die = die.subtract(pip.translate(g, g, -s));

// Face 2 — front (-Y): 2 pips
die = die.subtract(pip.translate(-g, -s, g));
die = die.subtract(pip.translate(g, -s, -g));

// Face 5 — back (+Y): 5 pips
die = die.subtract(pip.translate(0, s, 0));
die = die.subtract(pip.translate(-g, s, g));
die = die.subtract(pip.translate(g, s, g));
die = die.subtract(pip.translate(-g, s, -g));
die = die.subtract(pip.translate(g, s, -g));

// Face 3 — right (+X): 3 pips diagonal
die = die.subtract(pip.translate(s, 0, 0));
die = die.subtract(pip.translate(s, -g, g));
die = die.subtract(pip.translate(s, g, -g));

// Face 4 — left (-X): 4 pips
die = die.subtract(pip.translate(-s, -g, g));
die = die.subtract(pip.translate(-s, g, g));
die = die.subtract(pip.translate(-s, -g, -g));
die = die.subtract(pip.translate(-s, g, -g));

return die.named("Die").color("#f5f0e8");
