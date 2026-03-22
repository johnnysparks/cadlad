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
import { collectHints } from "./hints.js";
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
  let camera: [number, number, number] | undefined;

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
    // Supports: Solid, Assembly, Array, or { model, camera } metadata object
    let model = result;
    if (result && typeof result === "object" && !(result instanceof Solid) && !(result instanceof Assembly) && !Array.isArray(result)) {
      // Metadata object: { model: Solid|Assembly, camera: [x,y,z] }
      if (result.model) model = result.model;
      if (Array.isArray(result.camera) && result.camera.length === 3) {
        camera = result.camera as [number, number, number];
      }
    }

    if (model instanceof Solid) {
      bodies.push(model.toBody());
    } else if (model instanceof Assembly) {
      bodies.push(...model.toBodies());
    } else if (Array.isArray(model)) {
      for (const item of model) {
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

  // Warn about real geometry problems (not style opinions)
  hints = collectHints({
    emptyBodies: bodies.filter((b) => b.mesh.positions.length === 0).length,
  });

  return { bodies, params: collectedParams, errors, hints, camera };
}
