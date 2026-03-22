/**
 * Model runtime — evaluates user scripts in a controlled scope.
 *
 * Injects the CadLad API into the script scope, runs it,
 * and collects the returned Solid(s) + param definitions.
 */

import { initManifold } from "../engine/manifold-backend.js";
import { Solid } from "../engine/solid.js";
import { Assembly } from "./assembly.js";
import { _setParamValues, _resetParams, _getParamDefs } from "./params.js";
import { analyzeCode, collectHints } from "./hints.js";
import type { ModelResult, Body, ParamDef, Hint } from "../engine/types.js";

// All API symbols that get injected into model scope
import { param } from "./params.js";
import { Sketch, rect, circle } from "./sketch.js";
import { box, cylinder, sphere, roundedRect } from "../engine/primitives.js";
import { assembly } from "./assembly.js";

/**
 * Evaluate a model script string and return the result.
 */
export async function evaluateModel(
  code: string,
  paramValues?: Map<string, number>,
): Promise<ModelResult> {
  await initManifold();

  _resetParams();
  if (paramValues) {
    _setParamValues(paramValues);
  } else {
    _setParamValues(new Map());
  }

  const errors: string[] = [];
  const bodies: Body[] = [];
  const collectedParams: ParamDef[] = [];
  let hints: Hint[] = [];

  try {
    // Build a function that receives the API as arguments
    const apiNames = [
      "param", "Sketch", "rect", "circle",
      "box", "cylinder", "sphere", "roundedRect",
      "assembly", "Solid", "Assembly",
    ];
    const apiValues = [
      param, Sketch, rect, circle,
      box, cylinder, sphere, roundedRect,
      assembly, Solid, Assembly,
    ];

    // Wrap user code so it can use top-level return
    const wrappedCode = `"use strict";\n${code}`;

    const fn = new Function(...apiNames, wrappedCode);
    const result = fn(...apiValues);

    // Collect params
    collectedParams.push(..._getParamDefs());

    // Process return value
    if (result instanceof Solid) {
      bodies.push(result.toBody());
    } else if (result instanceof Assembly) {
      bodies.push(...result.toBodies());
    } else if (Array.isArray(result)) {
      for (const item of result) {
        if (item instanceof Solid) {
          bodies.push(item.toBody());
        } else if (item instanceof Assembly) {
          bodies.push(...item.toBodies());
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
  }

  // Collect contextual hints based on code patterns and results
  const codeAnalysis = analyzeCode(code);
  const hintCtx = {
    ...codeAnalysis,
    code,
    names: codeAnalysis.names || [],
    unionCount: codeAnalysis.unionCount || 0,
    colorAfterUnion: codeAnalysis.colorAfterUnion || false,
    sketchExtrudeRotate: codeAnalysis.sketchExtrudeRotate || false,
    horizontalCylinders: codeAnalysis.horizontalCylinders || 0,
    thinSubtracts: 0,
    emptyBodies: bodies.filter((b) => b.mesh.positions.length === 0).length,
  };
  hints = collectHints(hintCtx);

  return { bodies, params: collectedParams, errors, hints };
}
