/**
 * Runtime warnings — catches real geometry problems, not style opinions.
 *
 * Philosophy: if the problem can be FIXED in the API (like winding order),
 * fix it there. If it can only be DETECTED after evaluation (like empty
 * geometry), warn here. Don't nag about code style.
 */

import type { Hint } from "../engine/types.js";

export interface HintContext {
  /** Number of bodies with zero vertices after evaluation */
  emptyBodies: number;
}

/** Check for real problems after model evaluation. */
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

  return hints;
}
