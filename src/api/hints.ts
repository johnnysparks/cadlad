/**
 * Contextual hint engine — baked-in learnings from building real models.
 *
 * Hints are advisory warnings that fire when the runtime detects patterns
 * that commonly lead to problems. They're discovered organically — you only
 * see a hint when you're doing the thing it warns about.
 *
 * Hints never block execution. They appear as warnings in the output.
 */

export interface Hint {
  id: string;
  message: string;
  severity: "tip" | "warning";
}

type HintDetector = (ctx: HintContext) => Hint | null;

export interface HintContext {
  /** The raw user code string */
  code: string;
  /** Names assigned via .named() during this evaluation */
  names: string[];
  /** Count of union operations */
  unionCount: number;
  /** Whether .color() was called after .union() */
  colorAfterUnion: boolean;
  /** Whether Sketch.extrude was followed by .rotate() */
  sketchExtrudeRotate: boolean;
  /** Count of cylinder().rotate() patterns */
  horizontalCylinders: number;
  /** Count of subtract operations */
  subtractCount: number;
  /** Subtract operations with no size oversize */
  thinSubtracts: number;
  /** Whether sphere().subtract(sphere()).subtract(box()) pattern detected */
  sphereShellPattern: boolean;
  /** Whether code defines helper functions */
  hasHelperFunctions: boolean;
  /** Detected geometry issues */
  emptyBodies: number;
}

// ── Detectors ──────────────────────────────────────────────────

const detectors: HintDetector[] = [
  // 1. Long union chains → suggest assembly
  (ctx) => {
    if (ctx.unionCount >= 4) {
      return {
        id: "union-chain",
        severity: "tip",
        message:
          `Chaining ${ctx.unionCount} unions — consider assembly() to keep parts named, colored, and individually addressable.`,
      };
    }
    return null;
  },

  // 2. .color() after .union() overwrites part colors
  (ctx) => {
    if (ctx.colorAfterUnion) {
      return {
        id: "color-after-union",
        severity: "tip",
        message:
          "Calling .color() after .union() replaces all part colors with one. Apply .color() to each part before union, or use assembly() to preserve individual colors.",
      };
    }
    return null;
  },

  // 3. Sketch extrude then rotate — coordinate confusion
  (ctx) => {
    if (ctx.sketchExtrudeRotate) {
      return {
        id: "sketch-rotate",
        severity: "tip",
        message:
          "Sketch extrudes along Z. Rotating an extruded shape can be disorienting. Consider drawing your 2D profile in the plane you need from the start.",
      };
    }
    return null;
  },

  // 4. Many horizontal cylinders via rotate
  (ctx) => {
    if (ctx.horizontalCylinders >= 2) {
      return {
        id: "horizontal-cylinder",
        severity: "tip",
        message:
          "cylinder() builds along Z. For horizontal cylinders: rotate(90, 0, 0) aligns along Y, rotate(0, 90, 0) aligns along X.",
      };
    }
    return null;
  },

  // 5. Named object patterns — domain-specific advice
  (ctx) => {
    for (const name of ctx.names) {
      const hint = namedObjectHint(name, ctx);
      if (hint) return hint;
    }
    return null;
  },

  // 6. Long subtract chains → suggest loops
  (ctx) => {
    if (ctx.subtractCount >= 8) {
      return {
        id: "subtract-chain",
        severity: "tip",
        message:
          `${ctx.subtractCount} subtract operations — for repetitive cuts (pips, holes, slots), use a for-loop to keep the code maintainable.`,
      };
    }
    return null;
  },

  // 7. Sphere shell pattern — fragile coordinate math
  (ctx) => {
    if (ctx.sphereShellPattern) {
      return {
        id: "sphere-shell",
        severity: "tip",
        message:
          "Sphere shell (sphere subtract sphere subtract box) is fragile — the cut box must fully exceed the sphere radius or geometry vanishes. Add 2mm+ margin to cut dimensions, and verify with .volume().",
      };
    }
    return null;
  },

  // 8. Helper functions — encourage the pattern
  (ctx) => {
    if (ctx.hasHelperFunctions && ctx.names.length === 0) {
      return {
        id: "name-helper-results",
        severity: "tip",
        message:
          "You're using helper functions to build parts — nice! Consider .named() on each result so they're identifiable in the viewport and export.",
      };
    }
    return null;
  },

  // 9. Empty bodies after evaluation
  (ctx) => {
    if (ctx.emptyBodies > 0) {
      return {
        id: "empty-body",
        severity: "warning",
        message:
          "Some geometry produced zero-volume bodies. This often happens when a subtract removes everything, or walls are too thin. Check with .volume() to debug.",
      };
    }
    return null;
  },
];

// ── Named object hints ─────────────────────────────────────────

interface NamedPattern {
  keywords: string[];
  hints: Array<{ check: (ctx: HintContext) => boolean; hint: Hint }>;
}

const namedPatterns: NamedPattern[] = [
  {
    keywords: ["bolt", "screw", "fastener"],
    hints: [
      {
        check: (ctx) => !ctx.code.includes("Sketch") && !ctx.code.includes("extrudePolygon"),
        hint: {
          id: "bolt-hex-head",
          severity: "tip",
          message:
            "Building a bolt? Extrude a hexagonal Sketch for the head instead of combining faces — cleaner geometry, fewer booleans.",
        },
      },
      {
        check: (ctx) => !ctx.code.includes("cylinder") || ctx.unionCount < 1,
        hint: {
          id: "bolt-structure",
          severity: "tip",
          message:
            "A bolt is typically: hex head (extruded hexagon) + shaft (cylinder) + optional thread detail. Union the head and shaft.",
        },
      },
    ],
  },
  {
    keywords: ["gear", "cog", "sprocket"],
    hints: [
      {
        check: () => true,
        hint: {
          id: "gear-profile",
          severity: "tip",
          message:
            "For gears, define the tooth profile as a 2D Sketch, replicate around a circle using rotate(), then extrude. Involute curves can be approximated with arc segments.",
        },
      },
    ],
  },
  {
    keywords: ["chair", "stool", "bench", "seat"],
    hints: [
      {
        check: (ctx) => ctx.unionCount >= 4 && !ctx.code.includes("assembly"),
        hint: {
          id: "chair-assembly",
          severity: "tip",
          message:
            "Furniture with many parts (seat, legs, back) works better as an assembly(). Each part keeps its name and color, and you can test fit before merging.",
        },
      },
    ],
  },
  {
    keywords: ["cabinet", "shelf", "bookcase", "drawer"],
    hints: [
      {
        check: (ctx) => ctx.code.includes("subtract") && !ctx.code.includes("volume"),
        hint: {
          id: "cabinet-shell",
          severity: "tip",
          message:
            "When hollowing a box for a cabinet, verify walls with .volume(). Thin walls (< 2mm) can vanish or render poorly. Consider building from panels instead of shell subtraction.",
        },
      },
    ],
  },
  {
    keywords: ["house", "barn", "building", "shed"],
    hints: [
      {
        check: (ctx) => ctx.code.includes("rotate") && (ctx.code.includes("Sketch") || ctx.code.includes("extrude")),
        hint: {
          id: "building-roof",
          severity: "tip",
          message:
            "For roofs, Sketch the gable profile in XZ (side view), then extrude along Y for depth. This avoids the rotate-after-extrude confusion.",
        },
      },
    ],
  },
  {
    keywords: ["wheel", "tire", "rim"],
    hints: [
      {
        check: (ctx) => ctx.code.includes("cylinder") && ctx.code.includes("rotate"),
        hint: {
          id: "wheel-orientation",
          severity: "tip",
          message:
            "Wheels: cylinder() builds along Z. For a wheel on the ground, rotate(0, 90, 0) aligns the axle along X. Use .translate() after rotate to position.",
        },
      },
    ],
  },
  {
    keywords: ["pipe", "tube", "hose"],
    hints: [
      {
        check: (ctx) => ctx.code.includes("subtract") && ctx.code.includes("cylinder"),
        hint: {
          id: "pipe-construction",
          severity: "tip",
          message:
            "Pipes: subtract an inner cylinder from an outer. Make the inner cylinder 2mm longer than the outer to ensure clean cuts at both ends.",
        },
      },
    ],
  },
];

function namedObjectHint(name: string, ctx: HintContext): Hint | null {
  const lower = name.toLowerCase();
  for (const pattern of namedPatterns) {
    if (pattern.keywords.some((kw) => lower.includes(kw))) {
      for (const { check, hint } of pattern.hints) {
        if (check(ctx)) return hint;
      }
    }
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────

/** Analyze code and collect all applicable hints. */
export function collectHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const seen = new Set<string>();

  for (const detect of detectors) {
    const hint = detect(ctx);
    if (hint && !seen.has(hint.id)) {
      seen.add(hint.id);
      hints.push(hint);
    }
  }

  return hints;
}

/** Build a HintContext by analyzing user code (static analysis). */
export function analyzeCode(code: string): Partial<HintContext> {
  // Count .union( calls
  const unionCount = (code.match(/\.union\s*\(/g) || []).length;

  // Detect .color() after .union() on the same chain
  const colorAfterUnion = /\.union\s*\([^)]*\)[^;]*\.color\s*\(/.test(code);

  // Sketch.extrude followed by .rotate
  const sketchExtrudeRotate = /\.extrude\s*\([^)]*\)\s*\n?\s*\.rotate\s*\(/.test(code);

  // cylinder().rotate() patterns
  const horizontalCylinders = (code.match(/cylinder\s*\([^)]*\)\s*\n?\s*\.rotate\s*\(/g) || []).length;

  // .named() calls — extract names
  const nameMatches = code.matchAll(/\.named\s*\(\s*["']([^"']+)["']\s*\)/g);
  const names = [...nameMatches].map((m) => m[1]);

  // Count .subtract( calls
  const subtractCount = (code.match(/\.subtract\s*\(/g) || []).length;

  // Sphere shell pattern: sphere().subtract(sphere()) near box subtract
  const sphereShellPattern =
    /sphere\s*\([^)]*\)\s*[\s\S]*?\.subtract\s*\(\s*sphere/.test(code) &&
    /\.subtract\s*\(\s*box/.test(code);

  // Helper function definitions
  const hasHelperFunctions = /function\s+\w+\s*\(/.test(code);

  return {
    code,
    names,
    unionCount,
    subtractCount,
    colorAfterUnion,
    sketchExtrudeRotate,
    horizontalCylinders,
    sphereShellPattern,
    hasHelperFunctions,
  };
}
