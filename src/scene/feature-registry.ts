export type FeatureFieldType = "string" | "number" | "boolean";

export interface FeatureFieldSchema {
  type: FeatureFieldType;
  required?: boolean;
}

export type FeatureSchema = Record<string, FeatureFieldSchema>;

export interface FeatureValidationResult {
  ok: boolean;
  errors: string[];
}

export interface FeatureDefinition<TParams extends Record<string, unknown> = Record<string, unknown>> {
  kind: string;
  schema: FeatureSchema;
  build: (params: TParams) => string;
  validate?: (params: TParams) => string[];
}

export class FeatureRegistry {
  private readonly definitions = new Map<string, FeatureDefinition>();

  register(definition: FeatureDefinition): void {
    if (this.definitions.has(definition.kind)) {
      throw new Error(`Feature kind \"${definition.kind}\" is already registered.`);
    }
    this.definitions.set(definition.kind, definition);
  }

  get(kind: string): FeatureDefinition {
    const definition = this.definitions.get(kind);
    if (!definition) {
      throw new Error(`Unknown feature kind \"${kind}\".`);
    }
    return definition;
  }

  has(kind: string): boolean {
    return this.definitions.has(kind);
  }

  validate(kind: string, params: Record<string, unknown>): FeatureValidationResult {
    const definition = this.get(kind);
    const errors: string[] = [];

    for (const [fieldName, fieldSchema] of Object.entries(definition.schema)) {
      const value = params[fieldName];
      if (value === undefined || value === null) {
        if (fieldSchema.required !== false) {
          errors.push(`Missing required field \"${fieldName}\" for ${kind}.`);
        }
        continue;
      }

      if (typeof value !== fieldSchema.type) {
        errors.push(
          `Invalid type for \"${fieldName}\" in ${kind}: expected ${fieldSchema.type}, got ${typeof value}.`,
        );
      }
    }

    for (const key of Object.keys(params)) {
      if (!(key in definition.schema)) {
        errors.push(`Unknown field \"${key}\" for ${kind}.`);
      }
    }

    if (definition.validate) {
      errors.push(...definition.validate(params));
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }
}

export function createDefaultFeatureRegistry(): FeatureRegistry {
  const registry = new FeatureRegistry();

  registry.register({
    kind: "wall.straight",
    schema: {
      id: { type: "string" },
      length: { type: "number" },
      height: { type: "number" },
      thickness: { type: "number" },
    },
    validate: (params) => {
      const errors: string[] = [];
      for (const key of ["length", "height", "thickness"] as const) {
        const value = params[key];
        if (typeof value === "number" && value <= 0) {
          errors.push(`Field \"${key}\" must be > 0 for wall.straight.`);
        }
      }
      return errors;
    },
    build: (params) =>
      `box(${String(params.length)}, ${String(params.thickness)}, ${String(params.height)})`,
  });

  registry.register({
    kind: "roof.gable",
    schema: {
      id: { type: "string" },
      width: { type: "number" },
      depth: { type: "number" },
      pitchDeg: { type: "number" },
      overhang: { type: "number" },
    },
    validate: (params) => {
      const errors: string[] = [];
      const pitch = params.pitchDeg;
      if (typeof pitch === "number" && (pitch <= 0 || pitch >= 80)) {
        errors.push("Field \"pitchDeg\" must be in (0, 80) for roof.gable.");
      }
      return errors;
    },
    build: (params) =>
      `createGableRoof(${String(params.width)}, ${String(params.depth)}, ${String(params.pitchDeg)}, ${String(params.overhang)})`,
  });

  return registry;
}
