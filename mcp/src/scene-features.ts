export interface SceneFeatureInfo {
  id: string;
  kind: string;
  label?: string;
  refs: string[];
}

export interface SceneFeatureParseResult {
  features: SceneFeatureInfo[];
  warnings: string[];
}

export function extractSceneFeatures(source: string): SceneFeatureParseResult {
  const warnings: string[] = [];
  const marker = /features\s*:\s*\[/m.exec(source);
  if (!marker || marker.index === undefined) {
    return { features: [], warnings: ["No defineScene features array found in source."] };
  }

  const arrayStart = source.indexOf("[", marker.index);
  if (arrayStart < 0) {
    return { features: [], warnings: ["features property found, but opening '[' was missing."] };
  }

  const arrayEnd = findMatchingBracket(source, arrayStart, "[", "]");
  if (arrayEnd < 0) {
    return { features: [], warnings: ["features array appears malformed (missing closing ']')."] };
  }

  const arrayBody = source.slice(arrayStart + 1, arrayEnd);
  const objects = splitTopLevelObjects(arrayBody);
  const features: SceneFeatureInfo[] = [];

  for (const entry of objects) {
    const id = readStringProp(entry, "id");
    const kind = readStringProp(entry, "kind");
    if (!id || !kind) {
      warnings.push("Skipped a feature entry without string id/kind.");
      continue;
    }
    features.push({
      id,
      kind,
      label: readStringProp(entry, "label"),
      refs: readStringArrayProp(entry, "refs"),
    });
  }

  return { features, warnings };
}

function splitTopLevelObjects(input: string): string[] {
  const out: string[] = [];
  let objectStart = -1;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        out.push(input.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }

  return out;
}

function readStringProp(objectLiteral: string, prop: string): string | undefined {
  const re = new RegExp(`\\b${escapeRegExp(prop)}\\b\\s*:\\s*(["'])([^"']*?)\\1`, "m");
  const match = re.exec(objectLiteral);
  return match?.[2]?.trim() || undefined;
}

function readStringArrayProp(objectLiteral: string, prop: string): string[] {
  const propIdx = objectLiteral.search(new RegExp(`\\b${escapeRegExp(prop)}\\b\\s*:\\s*\\[`));
  if (propIdx < 0) return [];
  const arrayStart = objectLiteral.indexOf("[", propIdx);
  if (arrayStart < 0) return [];
  const arrayEnd = findMatchingBracket(objectLiteral, arrayStart, "[", "]");
  if (arrayEnd < 0) return [];
  const body = objectLiteral.slice(arrayStart + 1, arrayEnd);
  const values: string[] = [];
  const re = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function findMatchingBracket(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
