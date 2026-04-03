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
import { normalizeScene, defineScene, mm } from "./scene-contract.js";

// All API symbols that get injected into model scope
import { param } from "./params.js";
import { Sketch, rect, circle } from "./sketch.js";
import { box, cylinder, sphere, roundedRect, roundedBox, taperedBox, sweep, loft } from "../engine/primitives.js";
import { assembly } from "./assembly.js";
import { withLayeredValidation } from "../validation/layered-validation.js";

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

  const runtimeErrors: string[] = [];
  const errors: string[] = [];
  const bodies: Body[] = [];
  const collectedParams: ParamDef[] = [];
  let hints: Hint[] = [];
  let camera: [number, number, number] | undefined;

  const collectSolid = (solid: Solid, context: string): void => {
    const nComp = solid.numComponents();
    if (nComp > 1) {
      runtimeErrors.push(
        `${context} has ${nComp} disconnected parts. ` +
        `Use assembly() to group separate parts, or union overlapping solids so they connect. ` +
        `Disconnected geometry in a single Solid is not allowed.`,
      );
    }
    bodies.push(solid.toBody());
  };

  try {
    // Build a function that receives the API as arguments
    const apiNames = [
      "param", "Sketch", "rect", "circle",
      "box", "cylinder", "sphere", "roundedRect", "roundedBox", "taperedBox",
      "sweep", "loft",
      "assembly", "Solid", "Assembly",
      "defineScene", "mm",
    ];
    const apiValues = [
      param, Sketch, rect, circle,
      box, cylinder, sphere, roundedRect, roundedBox, taperedBox,
      sweep, loft,
      assembly, Solid, Assembly,
      defineScene, mm,
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
    const normalized = normalizeScene(code, result, paramValues);
    if (normalized.scene) {
      model = normalized.scene.model;
      for (const [name, value] of Object.entries(normalized.scene.params)) {
        if (typeof value !== "number") continue;
        const existing = collectedParams.find((paramDef) => paramDef.name === name);
        if (existing) continue;
        collectedParams.push({
          name,
          value,
        });
      }
    }
    if (normalized.diagnostics.length > 0) {
      errors.push(...normalized.diagnostics.map((diag) => {
        const location = diag.range
          ? ` [L${diag.range.startLine}:C${diag.range.startColumn}-L${diag.range.endLine}:C${diag.range.endColumn}]`
          : "";
        const feature = diag.featureId ? ` [feature:${diag.featureId}]` : "";
        return `[${diag.code}]${feature}${location} ${diag.message}`;
      }));
      return { bodies, params: collectedParams, errors, hints, camera };
    }
    if (!normalized.scene
      && result
      && typeof result === "object"
      && !(result instanceof Solid)
      && !(result instanceof Assembly)
      && !Array.isArray(result)
    ) {
      // Metadata object: { model: Solid|Assembly, camera: [x,y,z] }
      if (result.model) model = result.model;
      if (Array.isArray(result.camera) && result.camera.length === 3) {
        camera = result.camera as [number, number, number];
      }
    }

    if (model instanceof Solid) {
      collectSolid(model, "Model");
    } else if (model instanceof Assembly) {
      bodies.push(...model.toBodies());
    } else if (Array.isArray(model)) {
      for (let i = 0; i < model.length; i += 1) {
        const item = model[i];
        if (item instanceof Solid) {
          collectSolid(item, `Model[${i}]`);
        } else if (item instanceof Assembly) {
          bodies.push(...item.toBodies());
        } else {
          const valueType = item === null ? "null" : typeof item;
          runtimeErrors.push(
            `Model[${i}] must be a Solid or Assembly, got ${valueType}.`,
          );
        }
      }
    } else {
      const valueType = model === null ? "null" : typeof model;
      if (valueType === "undefined") {
        runtimeErrors.push(
          "Model script must return geometry: Solid, Assembly, array of Solid/Assembly, or { model, camera }.",
        );
      } else {
        runtimeErrors.push(
          `Model script returned unsupported type: ${valueType}. ` +
          "Expected Solid, Assembly, array of Solid/Assembly, or { model, camera }.",
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    runtimeErrors.push(msg);
  }

  // Warn about real geometry problems (not style opinions)
  hints = collectHints({
    emptyBodies: bodies.filter((b) => b.mesh.positions.length === 0).length,
  });

  return withLayeredValidation({
    bodies,
    params: collectedParams,
    runtimeErrors: [...errors, ...runtimeErrors],
    hints,
    camera,
  });
}
