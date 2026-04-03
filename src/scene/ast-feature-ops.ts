import ts from "typescript";
import { FeatureRegistry } from "./feature-registry.js";

export interface FeatureRecord {
  id: string;
  kind: string;
  params: Record<string, unknown>;
}

function createPrinter(): ts.Printer {
  return ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });
}

function stableObjectEntries(params: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(params).sort(([left], [right]) => left.localeCompare(right));
}

function valueToExpression(value: unknown): ts.Expression {
  if (typeof value === "string") return ts.factory.createStringLiteral(value);
  if (typeof value === "number") return ts.factory.createNumericLiteral(value);
  if (typeof value === "boolean") return value ? ts.factory.createTrue() : ts.factory.createFalse();

  if (Array.isArray(value)) {
    return ts.factory.createArrayLiteralExpression(value.map((entry) => valueToExpression(entry)));
  }

  if (value && typeof value === "object") {
    const entries = stableObjectEntries(value as Record<string, unknown>);
    return ts.factory.createObjectLiteralExpression(
      entries.map(([key, entryValue]) =>
        ts.factory.createPropertyAssignment(ts.factory.createIdentifier(key), valueToExpression(entryValue)),
      ),
      true,
    );
  }

  throw new Error(`Unsupported feature value type: ${typeof value}`);
}

function buildFeatureCall(feature: FeatureRecord): ts.CallExpression {
  return ts.factory.createCallExpression(
    ts.factory.createIdentifier("feature"),
    undefined,
    [
      ts.factory.createStringLiteral(feature.kind),
      valueToExpression(feature.params),
    ],
  );
}

function resolveSceneFeaturesArray(sourceFile: ts.SourceFile): ts.ArrayLiteralExpression {
  let result: ts.ArrayLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "defineScene"
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const sceneObject = node.arguments[0];
      for (const property of sceneObject.properties) {
        if (
          ts.isPropertyAssignment(property)
          && ts.isIdentifier(property.name)
          && property.name.text === "features"
          && ts.isArrayLiteralExpression(property.initializer)
        ) {
          result = property.initializer;
        }
      }
    }

    if (!result) {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);

  if (!result) {
    throw new Error("Could not find defineScene({ features: [...] }) in source.");
  }

  return result;
}

function findFeatureById(featuresNode: ts.ArrayLiteralExpression, id: string): ts.CallExpression | undefined {
  for (const element of featuresNode.elements) {
    if (!ts.isCallExpression(element)) continue;
    if (!ts.isIdentifier(element.expression) || element.expression.text !== "feature") continue;
    if (element.arguments.length < 2) continue;
    const args = element.arguments[1];
    if (!ts.isObjectLiteralExpression(args)) continue;

    const idProp = args.properties.find((property) =>
      ts.isPropertyAssignment(property)
      && ts.isIdentifier(property.name)
      && property.name.text === "id"
      && ts.isStringLiteral(property.initializer),
    );

    if (idProp && ts.isPropertyAssignment(idProp) && ts.isStringLiteral(idProp.initializer) && idProp.initializer.text === id) {
      return element;
    }
  }

  return undefined;
}

function replaceFeaturesArray(
  sourceText: string,
  sourceFile: ts.SourceFile,
  nextElements: readonly ts.Expression[],
): string {
  const printer = createPrinter();
  const currentFeatures = resolveSceneFeaturesArray(sourceFile);
  const replacement = printer.printNode(
    ts.EmitHint.Expression,
    ts.factory.createArrayLiteralExpression(nextElements, true),
    sourceFile,
  );

  return `${sourceText.slice(0, currentFeatures.getStart(sourceFile))}${replacement}${sourceText.slice(currentFeatures.getEnd())}`;
}

export function insertFeature(sourceText: string, feature: FeatureRecord, registry: FeatureRegistry): string {
  const validation = registry.validate(feature.kind, feature.params);
  if (!validation.ok) {
    throw new Error(`Schema validation failed: ${validation.errors.join(" ")}`);
  }

  const sourceFile = ts.createSourceFile("scene.forge.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const featuresArray = resolveSceneFeaturesArray(sourceFile);
  const nextElements = [...featuresArray.elements, buildFeatureCall(feature)];

  return replaceFeaturesArray(sourceText, sourceFile, nextElements);
}

export function updateFeature(
  sourceText: string,
  featureId: string,
  nextParams: Record<string, unknown>,
  registry: FeatureRegistry,
): string {
  const sourceFile = ts.createSourceFile("scene.forge.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const featuresArray = resolveSceneFeaturesArray(sourceFile);
  const targetFeature = findFeatureById(featuresArray, featureId);

  if (!targetFeature) {
    throw new Error(`Feature with id "${featureId}" was not found.`);
  }

  const kindArg = targetFeature.arguments[0];
  if (!kindArg || !ts.isStringLiteral(kindArg)) {
    throw new Error(`Feature with id "${featureId}" has a non-literal kind argument.`);
  }

  const validation = registry.validate(kindArg.text, nextParams);
  if (!validation.ok) {
    throw new Error(`Schema validation failed: ${validation.errors.join(" ")}`);
  }

  const nextFeatureCall = buildFeatureCall({
    id: featureId,
    kind: kindArg.text,
    params: nextParams,
  });

  const nextElements = featuresArray.elements.map((element) =>
    element === targetFeature ? nextFeatureCall : element,
  );

  return replaceFeaturesArray(sourceText, sourceFile, nextElements);
}
