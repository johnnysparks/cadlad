/**
 * Model runtime — evaluates user scripts in a controlled scope.
 *
 * Injects the CadLad API into the script scope, runs it,
 * and collects the returned Solid(s) + param definitions.
 */

import { initManifold } from "@cadlad/kernel/manifold-backend.js";
import { Solid } from "@cadlad/kernel/solid.js";
import { Assembly } from "./assembly.js";
import { _setParamValues, _resetParams, _getParamDefs } from "./params.js";
import { collectHints } from "./hints.js";
import type { ModelResult, Body, ParamDef, Hint, GeometryValidationConfig } from "@cadlad/kernel/types.js";
import { normalizeScene, defineScene, mm, runScenePostModelValidation, paramSweepTest } from "./scene-contract.js";
import { constraint } from "./constraints.js";
import type { SceneConstraint } from "./constraints.js";

// All API symbols that get injected into model scope
import { param } from "./params.js";
import { Sketch, rect, circle } from "./sketch.js";
import { box, cylinder, sphere, roundedRect, roundedBox, taperedBox, sweep, loft } from "@cadlad/kernel/primitives.js";
import { assembly } from "./assembly.js";
import { plane, axis, datum } from "./reference.js";
import { isToolBody, toolBody } from "./toolbody.js";
import { withLayeredValidation } from "@cadlad/validation/layered-validation.js";
import { computeModelStats } from "@cadlad/rendering/model-stats.js";

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
  const toolBodies: Body[] = [];
  const collectedParams: ParamDef[] = [];
  let hints: Hint[] = [];
  let camera: [number, number, number] | undefined;
  let sceneValidation: ModelResult["sceneValidation"];
  let geometryValidationConfig: GeometryValidationConfig | undefined;
  let sceneConstraints: SceneConstraint[] | undefined;

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

  const collectToolBody = (tool: ReturnType<typeof toolBody>): void => {
    const body = tool.solid.toBody();
    body.kind = "tool-body";
    body.name = tool.name;
    toolBodies.push(body);
  };

  try {
    // Build a function that receives the API as arguments
    const apiNames = [
      "param", "Sketch", "rect", "circle",
      "box", "cylinder", "sphere", "roundedRect", "roundedBox", "taperedBox",
      "sweep", "loft",
      "assembly", "Solid", "Assembly",
      "defineScene", "mm", "constraint",
      "paramSweepTest",
      "plane", "axis", "datum",
      "toolBody",
    ];
    const apiValues = [
      param, Sketch, rect, circle,
      box, cylinder, sphere, roundedRect, roundedBox, taperedBox,
      sweep, loft,
      assembly, Solid, Assembly,
      defineScene, mm, constraint,
      paramSweepTest,
      plane, axis, datum,
      toolBody,
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
    const blockingSceneDiagnostics = normalized.diagnostics.filter((diag) => diag.stage === "type-level");
    if (blockingSceneDiagnostics.length > 0) {
      sceneValidation = normalized.scene?.validation;
      errors.push(...blockingSceneDiagnostics.map((diag) => {
        const location = diag.range
          ? ` [L${diag.range.startLine}:C${diag.range.startColumn}-L${diag.range.endLine}:C${diag.range.endColumn}]`
          : "";
        const feature = diag.featureId ? ` [feature:${diag.featureId}]` : "";
        return `[${diag.code}]${feature}${location} ${diag.message}`;
      }));
      return withLayeredValidation({
        bodies,
        toolBodies,
        params: collectedParams,
        runtimeErrors: errors,
        hints,
        camera,
        sceneValidation,
        geometryValidation: geometryValidationConfig,
        constraints: sceneConstraints,
      });
    }
    if (!normalized.scene && result && typeof result === "object" && !(result instanceof Solid) && !(result instanceof Assembly) && !Array.isArray(result)) {
      // Metadata object: { model: Solid|Assembly, camera: [x,y,z] }
      if (result.model) model = result.model;
      if (Array.isArray(result.camera) && result.camera.length === 3) {
        camera = result.camera as [number, number, number];
      }
    }

    if (model instanceof Solid) {
      collectSolid(model, "Model");
    } else if (isToolBody(model)) {
      collectToolBody(model);
    } else if (model instanceof Assembly) {
      bodies.push(...model.toBodies());
    } else if (Array.isArray(model)) {
      for (let i = 0; i < model.length; i += 1) {
        const item = model[i];
        if (item instanceof Solid) {
          collectSolid(item, `Model[${i}]`);
        } else if (item instanceof Assembly) {
          bodies.push(...item.toBodies());
        } else if (isToolBody(item)) {
          // Construction geometry: excluded from final output, retained for debug rendering.
          collectToolBody(item);
          continue;
        } else {
          const valueType = item === null ? "null" : typeof item;
          runtimeErrors.push(
            `Model[${i}] must be a Solid, ToolBody, or Assembly, got ${valueType}.`,
          );
        }
      }
    } else {
      const valueType = model === null ? "null" : typeof model;
      if (valueType === "undefined") {
        runtimeErrors.push(
          "Model script must return geometry: Solid, ToolBody, Assembly, array of those, or { model, camera }.",
        );
      } else {
        runtimeErrors.push(
          `Model script returned unsupported type: ${valueType}. ` +
          "Expected Solid, ToolBody, Assembly, array of those, or { model, camera }.",
        );
      }
    }

    if (normalized.scene) {
      geometryValidationConfig = normalized.scene.geometryValidation;
      sceneConstraints = normalized.rawHooks?.constraints ? [...normalized.rawHooks.constraints] : undefined;
      sceneValidation = runScenePostModelValidation({
        scene: normalized.scene,
        validators: normalized.rawHooks?.validators,
        tests: normalized.rawHooks?.tests,
        modelFactory: normalized.rawHooks?.modelFactory,
        geometryValidation: geometryValidationConfig,
        constraints: sceneConstraints,
        bodies,
        model,
      });
      if (sceneValidation.summary.errorCount > 0) {
        errors.push(...sceneValidation.diagnostics.map((diag) => {
          const feature = diag.featureId ? ` [feature:${diag.featureId}]` : "";
          const hook = diag.validatorId ? ` [validator:${diag.validatorId}]` : diag.testId ? ` [test:${diag.testId}]` : "";
          return `[${diag.code}]${feature}${hook} ${diag.message}`;
        }));
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    runtimeErrors.push(msg);
  }

  // Warn about runtime geometry issues and design-intent opportunities.
  const stats = computeModelStats(bodies);
  hints = collectHints({
    emptyBodies: bodies.filter((b) => b.mesh.positions.length === 0).length,
    source: code,
    stats,
    params: collectedParams,
  });

  return withLayeredValidation({
    bodies,
    toolBodies,
    params: collectedParams,
    runtimeErrors: [...errors, ...runtimeErrors],
    hints,
    camera,
    sceneValidation,
    geometryValidation: geometryValidationConfig,
    constraints: sceneConstraints,
  });
}
