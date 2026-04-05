import { Assembly } from "./assembly.js";
import type { Body, ValidationDiagnostic } from "../engine/types.js";
import type { GeometryValidationConfig } from "../engine/types.js";
import { Solid } from "../engine/solid.js";
import { isToolBody } from "./toolbody.js";
import type { SceneConstraint } from "./constraints.js";
import { runLayeredValidation } from "../validation/layered-validation.js";

export type SceneSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SceneValidationStage = "type-level" | "semantic" | "geometry" | "tests";
export type SceneValidationSeverity = "error" | "warning";

export type SceneDiagnostic = {
  code:
    | "scene.invalid-envelope"
    | "scene.geometry.empty"
    | "scene.geometry.disconnected-parts"
    | "scene.validator.failed"
    | "scene.test.failed";
  stage: SceneValidationStage;
  severity: SceneValidationSeverity;
  message: string;
  featureId?: string;
  validatorId?: string;
  testId?: string;
  range?: SceneSourceRange;
};

export type UnitBrand<TUnit extends string> = number & { readonly __unit: TUnit };
export type Millimeters = UnitBrand<"mm">;

export function mm(value: number): Millimeters {
  return value as Millimeters;
}

export type SceneParamDefinition<TValue extends number | string | boolean = number | string | boolean> = {
  value: TValue;
  label?: string;
  description?: string;
  min?: TValue extends number ? number : never;
  max?: TValue extends number ? number : never;
  step?: TValue extends number ? number : never;
  unit?: string;
};

export type SceneParamsShape = Record<string, SceneParamDefinition>;

export type InferSceneParams<TParams extends SceneParamsShape | undefined> =
  TParams extends SceneParamsShape
    ? { [K in keyof TParams]: TParams[K]["value"] }
    : Record<string, never>;

export type SceneMeta = {
  id?: string;
  name: string;
  version?: string;
  description?: string;
  tags?: readonly string[];
};

export type SceneValidatorContext<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  params: InferSceneParams<TParams>;
  bodies: readonly Body[];
  model?: unknown;
  evaluateAtParams?: (
    overrides: Partial<Record<string, number | string | boolean>>,
  ) => {
    params: Record<string, number | string | boolean>;
    bodies: readonly Body[];
    diagnostics: ValidationDiagnostic[];
    sceneDiagnostics: SceneDiagnostic[];
  };
};

export type SceneValidatorRun<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = (
  context: SceneValidatorContext<TParams>,
) => string | void;

export type SceneValidatorSpec<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  id: string;
  stage?: "semantic" | "geometry";
  run: SceneValidatorRun<TParams>;
};

export type SceneValidator<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> =
  SceneValidatorRun<TParams>
  | SceneValidatorSpec<TParams>;

export type SceneTest<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  id: string;
  description?: string;
  run: SceneValidatorRun<TParams>;
};

export type SceneEnvelope<TModel = unknown, TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  meta?: SceneMeta;
  model: TModel | ((context: Pick<SceneValidatorContext<TParams>, "params">) => TModel);
  params?: TParams;
  validators?: readonly SceneValidator<TParams>[];
  tests?: readonly SceneTest<TParams>[];
  geometry?: GeometryValidationConfig;
  constraints?: readonly SceneConstraint[];
};

export function paramSweepTest(paramName: string, values: readonly number[]): SceneTest {
  return {
    id: `param-sweep.${paramName}`,
    description: `Sweep ${paramName} across ${values.length} value(s) and report fragile parameter points.`,
    run: ({ params, evaluateAtParams }) => {
      if (values.length === 0) {
        return `paramSweepTest("${paramName}") requires at least one value.`;
      }

      if (!evaluateAtParams) {
        return `paramSweepTest("${paramName}") requires defineScene({ model: ({ params }) => ... }) so alternate parameter values can be evaluated.`;
      }

      if (typeof params[paramName] !== "number") {
        return `paramSweepTest("${paramName}") only supports numeric params.`;
      }

      const failures: string[] = [];

      for (const value of values) {
        const sweep = evaluateAtParams({ [paramName]: value });
        const emptyGeometry = sweep.bodies.length === 0
          || sweep.bodies.some((body) => body.mesh.positions.length === 0 || body.mesh.indices.length === 0);
        const selfIntersection = sweep.diagnostics.some((diag) =>
          diag.stage === "stats/relations" && diag.message.includes("intersects")
        );
        const validationErrors = [
          ...sweep.diagnostics.filter((diag) => diag.severity === "error").map((diag) => diag.message),
          ...sweep.sceneDiagnostics.filter((diag) => diag.severity === "error").map((diag) => diag.message),
        ];

        if (emptyGeometry || selfIntersection || validationErrors.length > 0) {
          const reasons: string[] = [];
          if (emptyGeometry) reasons.push("empty geometry");
          if (selfIntersection) reasons.push("self-intersection");
          if (validationErrors.length > 0) reasons.push(...validationErrors.slice(0, 2));
          failures.push(`${paramName}=${value}: ${reasons.join("; ")}`);
        }
      }

      if (failures.length === 0) return undefined;
      return `paramSweepTest("${paramName}") failed at ${failures.length}/${values.length} value(s): ${failures.join(" | ")}`;
    },
  };
}

export type SceneRuleResult = {
  id: string;
  stage: "semantic" | "geometry" | "tests";
  status: "pass" | "fail";
  message?: string;
};

export type SceneValidationReport = {
  diagnostics: SceneDiagnostic[];
  validators: SceneRuleResult[];
  tests: SceneRuleResult[];
  summary: {
    errorCount: number;
    warningCount: number;
    validatorFailures: number;
    testFailures: number;
  };
};

export type NormalizedScene<TModel = unknown> = {
  meta?: SceneMeta;
  model: TModel;
  params: Record<string, number | string | boolean>;
  geometryValidation?: GeometryValidationConfig;
  validation: SceneValidationReport;
};

const SCENE_MARKER = Symbol.for("cadlad.scene-envelope");

type SceneEnvelopeInternal<TModel = unknown> = SceneEnvelope<TModel> & {
  [SCENE_MARKER]: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveSceneParams(
  sceneParams: SceneParamsShape | undefined,
  paramOverrides: Map<string, number> | undefined,
): { resolved: Record<string, number | string | boolean>; diagnostics: SceneDiagnostic[] } {
  if (!sceneParams) {
    return { resolved: {}, diagnostics: [] };
  }

  const resolved: Record<string, number | string | boolean> = {};
  const diagnostics: SceneDiagnostic[] = [];

  for (const [name, definition] of Object.entries(sceneParams)) {
    if (!isRecord(definition) || !("value" in definition)) {
      diagnostics.push({
        code: "scene.invalid-envelope",
        stage: "type-level",
        severity: "error",
        message: `Scene param "${name}" must be declared as { value: ... }.`,
      });
      continue;
    }

    const baseValue = definition.value;
    if (typeof baseValue === "number" && paramOverrides?.has(name)) {
      resolved[name] = paramOverrides.get(name) as number;
    } else if (typeof baseValue === "number" || typeof baseValue === "string" || typeof baseValue === "boolean") {
      resolved[name] = baseValue;
    } else {
      diagnostics.push({
        code: "scene.invalid-envelope",
        stage: "type-level",
        severity: "error",
        message: `Scene param "${name}" only supports number/string/boolean values.`,
      });
    }
  }

  return { resolved, diagnostics };
}

function toValidatorSpec(validator: SceneValidator, index: number): SceneValidatorSpec {
  if (typeof validator === "function") {
    return {
      id: `validator.${index + 1}`,
      stage: "semantic",
      run: validator,
    };
  }

  return {
    id: validator.id,
    stage: validator.stage ?? "semantic",
    run: validator.run,
  };
}

function summarizeDiagnostics(diagnostics: SceneDiagnostic[]): SceneValidationReport["summary"] {
  const errorCount = diagnostics.filter((diag) => diag.severity === "error").length;
  const warningCount = diagnostics.filter((diag) => diag.severity === "warning").length;
  return {
    errorCount,
    warningCount,
    validatorFailures: diagnostics.filter((diag) => diag.code === "scene.validator.failed").length,
    testFailures: diagnostics.filter((diag) => diag.code === "scene.test.failed").length,
  };
}

function runSceneSemanticValidators(
  params: Record<string, number | string | boolean>,
  validators: readonly SceneValidator[] | undefined,
): { diagnostics: SceneDiagnostic[]; validatorResults: SceneRuleResult[] } {
  if (!validators || validators.length === 0) {
    return { diagnostics: [], validatorResults: [] };
  }

  const diagnostics: SceneDiagnostic[] = [];
  const validatorResults: SceneRuleResult[] = [];

  validators
    .map(toValidatorSpec)
    .filter((validator) => validator.stage === "semantic")
    .forEach((validator) => {
      const message = validator.run({ params, bodies: [] });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.validator.failed",
          stage: "semantic",
          severity: "error",
          message,
          validatorId: validator.id,
        });
        validatorResults.push({
          id: validator.id,
          stage: "semantic",
          status: "fail",
          message,
        });
      } else {
        validatorResults.push({
          id: validator.id,
          stage: "semantic",
          status: "pass",
        });
      }
    });

  return { diagnostics, validatorResults };
}

function collectBodiesForValidation(model: unknown): { bodies: Body[]; runtimeErrors: string[] } {
  const bodies: Body[] = [];
  const runtimeErrors: string[] = [];

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

  if (model instanceof Solid) {
    collectSolid(model, "Model");
    return { bodies, runtimeErrors };
  }

  if (model instanceof Assembly) {
    bodies.push(...model.toBodies());
    return { bodies, runtimeErrors };
  }

  if (Array.isArray(model)) {
    for (let i = 0; i < model.length; i += 1) {
      const item = model[i];
      if (item instanceof Solid) {
        collectSolid(item, `Model[${i}]`);
        continue;
      }
      if (item instanceof Assembly) {
        bodies.push(...item.toBodies());
        continue;
      }
      if (isToolBody(item)) {
        continue;
      }
      const valueType = item === null ? "null" : typeof item;
      runtimeErrors.push(`Model[${i}] must be a Solid or Assembly, got ${valueType}.`);
    }
    return { bodies, runtimeErrors };
  }

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

  return { bodies, runtimeErrors };
}

export function runScenePostModelValidation(input: {
  scene: NormalizedScene;
  validators?: readonly SceneValidator<any>[];
  tests?: readonly SceneTest<any>[];
  modelFactory?: (context: { params: Record<string, number | string | boolean> }) => unknown;
  geometryValidation?: GeometryValidationConfig;
  constraints?: readonly SceneConstraint[];
  bodies: Body[];
  model?: unknown;
}): SceneValidationReport {
  const diagnostics: SceneDiagnostic[] = [...input.scene.validation.diagnostics];
  const validators: SceneRuleResult[] = [...input.scene.validation.validators];
  const tests: SceneRuleResult[] = [];

  if (input.bodies.length === 0) {
    diagnostics.push({
      code: "scene.geometry.empty",
      stage: "geometry",
      severity: "error",
      message: "Scene model did not produce any geometry.",
    });
  }

  if (input.bodies.length > 1) {
    diagnostics.push({
      code: "scene.geometry.disconnected-parts",
      stage: "geometry",
      severity: "warning",
      message: "Scene produced multiple disconnected bodies. Prefer assembly semantics for multi-part scenes.",
    });
  }

  for (let i = 0; i < input.bodies.length; i += 1) {
    const body = input.bodies[i];
    if (body.mesh.positions.length === 0 || body.mesh.indices.length === 0) {
      diagnostics.push({
        code: "scene.geometry.empty",
        stage: "geometry",
        severity: "error",
        message: `Body ${i + 1} contains empty geometry buffers.`,
        featureId: body.name ? `body:${body.name}` : `body:${i + 1}`,
      });
    }
  }

  if (input.validators) {
    input.validators
      .map(toValidatorSpec)
      .filter((validator) => validator.stage === "geometry")
      .forEach((validator) => {
        const message = validator.run({
          params: input.scene.params,
          bodies: input.bodies,
          model: input.model,
        });
        if (typeof message === "string" && message.trim().length > 0) {
          diagnostics.push({
            code: "scene.validator.failed",
            stage: "geometry",
            severity: "error",
            message,
            validatorId: validator.id,
          });
          validators.push({
            id: validator.id,
            stage: "geometry",
            status: "fail",
            message,
          });
        } else {
          validators.push({
            id: validator.id,
            stage: "geometry",
            status: "pass",
          });
        }
      });
  }

  if (input.tests) {
    const evaluateAtParams = input.modelFactory
      ? (overrides: Partial<Record<string, number | string | boolean>>) => {
        const resolvedParams: Record<string, number | string | boolean> = {
          ...input.scene.params,
        };
        for (const [key, value] of Object.entries(overrides)) {
          if (typeof value !== "undefined") {
            resolvedParams[key] = value;
          }
        }
        let producedModel: unknown;
        const sceneDiagnostics: SceneDiagnostic[] = [];
        try {
          producedModel = input.modelFactory?.({ params: resolvedParams });
        } catch (error) {
          producedModel = undefined;
          sceneDiagnostics.push({
            code: "scene.test.failed",
            stage: "tests",
            severity: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const collected = collectBodiesForValidation(producedModel);
        const params = Object.entries(resolvedParams)
          .filter(([, value]) => typeof value === "number")
          .map(([name, value]) => ({ name, value: value as number }));
        const layered = runLayeredValidation({
          runtimeErrors: collected.runtimeErrors,
          params,
          bodies: collected.bodies,
          geometryValidation: input.geometryValidation ?? input.scene.geometryValidation,
          constraints: input.constraints,
        });

        return {
          params: resolvedParams,
          bodies: collected.bodies,
          diagnostics: layered.diagnostics,
          sceneDiagnostics,
        };
      }
      : undefined;

    input.tests.forEach((test) => {
      const message = test.run({
        params: input.scene.params,
        bodies: input.bodies,
        model: input.model,
        evaluateAtParams,
      });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.test.failed",
          stage: "tests",
          severity: "error",
          message,
          testId: test.id,
        });
        tests.push({
          id: test.id,
          stage: "tests",
          status: "fail",
          message,
        });
      } else {
        tests.push({
          id: test.id,
          stage: "tests",
          status: "pass",
        });
      }
    });
  }

  return {
    diagnostics,
    validators,
    tests,
    summary: summarizeDiagnostics(diagnostics),
  };
}

export function defineScene<TModel, TParams extends SceneParamsShape | undefined = undefined>(
  scene: SceneEnvelope<TModel, TParams>,
): SceneEnvelope<TModel, TParams> {
  return Object.freeze({ ...scene, [SCENE_MARKER]: true }) as SceneEnvelope<TModel, TParams>;
}

export function isSceneEnvelope(value: unknown): value is SceneEnvelopeInternal {
  return isRecord(value) && (value as SceneEnvelopeInternal)[SCENE_MARKER] === true;
}

export function normalizeScene(
  _code: string,
  value: unknown,
  paramOverrides?: Map<string, number>,
): {
  scene?: NormalizedScene;
  diagnostics: SceneDiagnostic[];
  rawHooks?: {
    validators?: readonly SceneValidator[];
    tests?: readonly SceneTest[];
    constraints?: readonly SceneConstraint[];
    modelFactory?: (context: { params: Record<string, number | string | boolean> }) => unknown;
  };
} {
  if (!isSceneEnvelope(value)) {
    return { diagnostics: [] };
  }

  const diagnostics: SceneDiagnostic[] = [];
  const scene = value;

  const { resolved: resolvedParams, diagnostics: paramDiagnostics } = resolveSceneParams(scene.params, paramOverrides);
  diagnostics.push(...paramDiagnostics);

  const semanticHooks = runSceneSemanticValidators(resolvedParams, scene.validators);
  diagnostics.push(...semanticHooks.diagnostics);

  const sceneModel = typeof scene.model === "function"
    ? (scene.model as (context: { params: Record<string, number | string | boolean> }) => unknown)({ params: resolvedParams })
    : scene.model;

  const validation: SceneValidationReport = {
    diagnostics,
    validators: semanticHooks.validatorResults,
    tests: [],
    summary: summarizeDiagnostics(diagnostics),
  };

  return {
    scene: {
      meta: scene.meta,
      model: sceneModel,
      params: resolvedParams,
      geometryValidation: scene.geometry,
      validation,
    },
    diagnostics,
    rawHooks: {
      validators: scene.validators,
      tests: scene.tests,
      constraints: scene.constraints,
      modelFactory: typeof scene.model === "function"
        ? scene.model as (context: { params: Record<string, number | string | boolean> }) => unknown
        : undefined,
    },
  };
}
