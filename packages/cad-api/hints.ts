/**
 * Runtime hints — advisory design-intent nudges.
 *
 * Philosophy: keep these non-blocking and practical. Hints should guide
 * stronger CAD patterns without preventing valid geometry from evaluating.
 */

import type { GeometryStats, Hint, ParamDef } from "@cadlad/kernel/types.js";

export interface HintContext {
  /** Number of bodies with zero vertices after evaluation */
  emptyBodies: number;
  /** Raw model source for source-level pattern checks */
  source?: string;
  /** Optional feature list for future feature-level analysis */
  features?: unknown[];
  /** Optional geometry stats for geometry-level checks */
  stats?: GeometryStats;
  /** Parameter definitions collected during evaluation */
  params?: ParamDef[];
}

/** Check for geometry/runtime issues and design-intent opportunities. */
export function collectHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];

  if (ctx.emptyBodies > 0) {
    hints.push({
      id: "empty-body",
      severity: "warning",
      message:
        "Some geometry produced zero-volume bodies. Common causes: subtract removed everything, walls too thin, or clockwise polygon winding (auto-corrected in extrude but not in manual CrossSection calls). Check with .volume() to debug.",
    });
  }

  const source = ctx.source ?? "";
  const params = ctx.params ?? [];

  if (hasDeepBooleanChain(source)) {
    hints.push({
      id: "deep-boolean-chain",
      severity: "tip",
      message:
        "Detected 5+ sequential .subtract() calls. Consider collect-and-cut patterns like subtractAll() with toolBody() helpers for cleaner, more maintainable boolean logic.",
    });
  }

  if (hasMagicNumbers(source, params.length > 0)) {
    hints.push({
      id: "magic-numbers",
      severity: "tip",
      message:
        "Found repeated literal dimensions in placement/coordinates. Consider param() and datum/plane references so updates propagate cleanly.",
    });
  }

  if (hasUnparameterizedSketchDimensions(source, params.length > 0)) {
    hints.push({
      id: "unparameterized-dimensions",
      severity: "tip",
      message:
        "Sketch operations appear to use many literal numeric dimensions. Consider driving critical dimensions with param() values.",
    });
  }

  const repeatedGeometryCount = countRepeatedGeometryGroups(ctx.stats);
  if (repeatedGeometryCount > 0) {
    hints.push({
      id: "repeated-geometry",
      severity: "tip",
      message:
        "Detected repeated bodies with matching size/shape signatures. Consider linearPattern()/circularPattern() or assembly patterns to model one master and derive the rest.",
    });
  }

  if (hasMissedSymmetryOpportunity(ctx.stats, source)) {
    hints.push({
      id: "missed-symmetry",
      severity: "tip",
      message:
        "Model bbox is symmetric about a principal axis but source does not appear to use mirrorUnion()/quarterUnion(). Consider modeling half/quarter and mirroring.",
    });
  }

  return hints;
}

function hasDeepBooleanChain(source: string): boolean {
  if (!source) return false;
  return /(?:\.subtract\([\s\S]*?\)\s*){5,}/.test(source);
}

function hasMagicNumbers(source: string, hasParams: boolean): boolean {
  if (!source) return false;

  const hasDatumRef = /\b(datum|plane|axis)\./.test(source);
  if (hasParams && hasDatumRef) return false;

  const translateNumericMatches = source.match(/\.translate\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)/g) ?? [];
  const sketchCoordinateMatches = source.match(/\[(?:\s*-?\d*\.?\d+\s*,\s*){1,2}-?\d*\.?\d+\s*\]/g) ?? [];

  return translateNumericMatches.length + sketchCoordinateMatches.length >= 3;
}

function hasUnparameterizedSketchDimensions(source: string, hasParams: boolean): boolean {
  if (!source) return false;

  const sketchBlockPattern = /Sketch\.begin\([\s\S]*?(?:\.extrude\(|\.revolve\(|\.sweep\(|\.toSketch\()/g;
  const sketchBlocks = source.match(sketchBlockPattern) ?? [];
  if (sketchBlocks.length === 0) return false;

  const numericLiteralPattern = /(?<![\w$.])-?\d*\.?\d+(?:e[+-]?\d+)?(?![\w$])/gi;
  const numericCount = sketchBlocks
    .map((block) => block.match(numericLiteralPattern)?.length ?? 0)
    .reduce((sum, count) => sum + count, 0);

  if (hasParams) {
    return numericCount >= 8;
  }

  return numericCount >= 4;
}

function countRepeatedGeometryGroups(stats?: GeometryStats): number {
  if (!stats || stats.parts.length < 3) return 0;

  const groups = new Map<string, number>();
  for (const part of stats.parts) {
    const key = [
      round(part.extents.x, 3),
      round(part.extents.y, 3),
      round(part.extents.z, 3),
      round(part.volume, 2),
      round(part.surfaceArea, 2),
      part.triangles,
    ].join("|");
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return Array.from(groups.values()).filter((count) => count >= 3).length;
}

function hasMissedSymmetryOpportunity(stats: GeometryStats | undefined, source: string): boolean {
  if (!stats || !source) return false;

  const usesSymmetryOps = /\b(mirrorUnion|quarterUnion|\.mirror\()/g.test(source);
  if (usesSymmetryOps) return false;

  const [minX, minY] = stats.boundingBox.min;
  const [maxX, maxY] = stats.boundingBox.max;
  const symmetricX = Math.abs(minX + maxX) <= 1e-3;
  const symmetricY = Math.abs(minY + maxY) <= 1e-3;

  return symmetricX || symmetricY;
}

function round(value: number, places: number): number {
  const m = 10 ** places;
  return Math.round(value * m) / m;
}
