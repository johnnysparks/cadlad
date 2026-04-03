import { createDefaultFeatureRegistry } from "../scene/feature-registry.js";

export type SceneSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SceneDiagnostic = {
  code:
    | "scene.invalid-envelope"
    | "scene.feature-id.missing"
    | "scene.feature-id.duplicate"
    | "scene.feature.invalid"
    | "scene.validator.failed"
    | "scene.test.failed";
  message: string;
  featureId?: string;
  range?: SceneSourceRange;
};

export type SceneFeatureDeclaration = {
  id?: string;
  kind: string;
  label?: string;
  args?: Record<string, unknown>;
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
};

export type SceneValidator<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = (
  context: SceneValidatorContext<TParams>,
) => string | void;

export type SceneTest<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  id: string;
  description?: string;
  run: (context: SceneValidatorContext<TParams>) => string | void;
};

export type SceneEnvelope<TModel = unknown, TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  meta?: SceneMeta;
  model: TModel | ((context: SceneValidatorContext<TParams>) => TModel);
  params?: TParams;
  features: readonly SceneFeatureDeclaration[];
  validators?: readonly SceneValidator<TParams>[];
  tests?: readonly SceneTest<TParams>[];
};

export type NormalizedSceneFeature = {
  id: string;
  kind: string;
  label?: string;
  args?: Record<string, unknown>;
  range?: SceneSourceRange;
};

export type NormalizedScene<TModel = unknown> = {
  meta?: SceneMeta;
  model: TModel;
  params: Record<string, number | string | boolean>;
  features: NormalizedSceneFeature[];
  diagnostics: SceneDiagnostic[];
};

const SCENE_MARKER = Symbol.for("cadlad.scene-envelope");

type SceneEnvelopeInternal<TModel = unknown> = SceneEnvelope<TModel> & {
  [SCENE_MARKER]: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function computeLineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function toLineColumn(lineStarts: number[], index: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1,
  };
}

function tryFindFeatureRange(code: string, featureId: string): SceneSourceRange | undefined {
  const lineStarts = computeLineStarts(code);
  const quotedId = `id: \"${featureId}\"`;
  const singleQuotedId = `id: '${featureId}'`;
  const idIndex = code.indexOf(quotedId) >= 0 ? code.indexOf(quotedId) : code.indexOf(singleQuotedId);
  if (idIndex < 0) return undefined;

  const objectStart = code.lastIndexOf("{", idIndex);
  const objectEnd = code.indexOf("}", idIndex);
  if (objectStart < 0 || objectEnd < 0 || objectEnd < objectStart) return undefined;

  const start = toLineColumn(lineStarts, objectStart);
  const end = toLineColumn(lineStarts, objectEnd + 1);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
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
        message: `Scene param "${name}" only supports number/string/boolean values.`,
      });
    }
  }

  return { resolved, diagnostics };
}

function runSceneHooks(
  resolvedParams: Record<string, number | string | boolean>,
  validators: readonly SceneValidator[] | undefined,
  tests: readonly SceneTest[] | undefined,
): SceneDiagnostic[] {
  const diagnostics: SceneDiagnostic[] = [];

  if (validators) {
    validators.forEach((validator) => {
      const message = validator({ params: resolvedParams });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.validator.failed",
          message,
        });
      }
    });
  }

  if (tests) {
    tests.forEach((test) => {
      const message = test.run({ params: resolvedParams });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.test.failed",
          message: `[${test.id}] ${message}`,
        });
      }
    });
  }

  return diagnostics;
}

export function defineScene<TModel, TParams extends SceneParamsShape | undefined = undefined>(
  scene: SceneEnvelope<TModel, TParams>,
): SceneEnvelope<TModel, TParams> {
  return Object.freeze({ ...scene, [SCENE_MARKER]: true }) as SceneEnvelope<TModel, TParams>;
}

export function isSceneEnvelope(value: unknown): value is SceneEnvelopeInternal {
  return isRecord(value) && (value as SceneEnvelopeInternal)[SCENE_MARKER] === true;
}

function looksLikeSceneEnvelope(value: unknown): value is SceneEnvelope {
  return isRecord(value) && "model" in value && "features" in value;
}

export function normalizeScene(
  code: string,
  value: unknown,
  paramOverrides?: Map<string, number>,
): {
  scene?: NormalizedScene;
  diagnostics: SceneDiagnostic[];
} {
  if (!isSceneEnvelope(value) && !looksLikeSceneEnvelope(value)) {
    return { diagnostics: [] };
  }

  const diagnostics: SceneDiagnostic[] = [];
  const scene = value;

  if (!Array.isArray(scene.features)) {
    diagnostics.push({
      code: "scene.invalid-envelope",
      message: "defineScene() requires a features array.",
    });
    return { diagnostics };
  }

  const { resolved: resolvedParams, diagnostics: paramDiagnostics } = resolveSceneParams(scene.params, paramOverrides);
  diagnostics.push(...paramDiagnostics);

  const features: NormalizedSceneFeature[] = [];
  const seenIds = new Set<string>();
  for (const feature of scene.features) {
    if (!isRecord(feature) || typeof feature.kind !== "string") {
      diagnostics.push({
        code: "scene.invalid-envelope",
        message: "Scene features must be objects with a string kind.",
      });
      continue;
    }

    if (typeof feature.id !== "string" || feature.id.trim().length === 0) {
      diagnostics.push({
        code: "scene.feature-id.missing",
        message: `Feature kind \"${feature.kind}\" is missing a stable string id.`,
      });
      continue;
    }

    const featureId = feature.id.trim();
    if (seenIds.has(featureId)) {
      diagnostics.push({
        code: "scene.feature-id.duplicate",
        featureId,
        message: `Feature id \"${featureId}\" must be unique.`,
        range: tryFindFeatureRange(code, featureId),
      });
      continue;
    }

    seenIds.add(featureId);
    features.push({
      id: featureId,
      kind: feature.kind,
      label: typeof feature.label === "string" ? feature.label : undefined,
      args: isRecord(feature.args) ? { ...feature.args } : undefined,
      range: tryFindFeatureRange(code, featureId),
    });
  }

  const registry = createDefaultFeatureRegistry();
  for (const feature of features) {
    if (!registry.has(feature.kind)) continue;
    const featureArgs: Record<string, unknown> = {
      ...(feature.args ?? {}),
      id: feature.id,
    };
    const validation = registry.validate(feature.kind, featureArgs, { features });
    if (!validation.ok) {
      diagnostics.push({
        code: "scene.feature.invalid",
        featureId: feature.id,
        range: feature.range,
        message: validation.errors.join(" "),
      });
    }
  }

  diagnostics.push(...runSceneHooks(resolvedParams, scene.validators, scene.tests));

  const sceneModel = typeof scene.model === "function"
    ? (scene.model as (context: { params: Record<string, number | string | boolean> }) => unknown)({ params: resolvedParams })
    : scene.model;

  return {
    scene: {
      meta: scene.meta,
      model: sceneModel,
      params: resolvedParams,
      features,
      diagnostics,
    },
    diagnostics,
  };
}
