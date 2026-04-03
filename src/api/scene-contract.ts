export type SceneSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SceneDiagnostic = {
  code: "scene.invalid-envelope" | "scene.feature-id.missing" | "scene.feature-id.duplicate";
  message: string;
  featureId?: string;
  range?: SceneSourceRange;
};

export type SceneFeatureDeclaration = {
  id?: string;
  kind: string;
  label?: string;
};

export type SceneEnvelope<TModel = unknown> = {
  model: TModel;
  params?: readonly string[];
  features: readonly SceneFeatureDeclaration[];
  validators?: readonly string[];
  tests?: readonly string[];
};

export type NormalizedSceneFeature = {
  id: string;
  kind: string;
  label?: string;
  range?: SceneSourceRange;
};

export type NormalizedScene<TModel = unknown> = {
  model: TModel;
  features: NormalizedSceneFeature[];
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

export function defineScene<TModel>(scene: SceneEnvelope<TModel>): SceneEnvelope<TModel> {
  return Object.freeze({ ...scene, [SCENE_MARKER]: true }) as SceneEnvelope<TModel>;
}

export function isSceneEnvelope(value: unknown): value is SceneEnvelopeInternal {
  return isRecord(value) && (value as SceneEnvelopeInternal)[SCENE_MARKER] === true;
}

export function normalizeScene(code: string, value: unknown): {
  scene?: NormalizedScene;
  diagnostics: SceneDiagnostic[];
} {
  if (!isSceneEnvelope(value)) {
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
      range: tryFindFeatureRange(code, featureId),
    });
  }

  return {
    scene: {
      model: scene.model,
      features,
    },
    diagnostics,
  };
}
