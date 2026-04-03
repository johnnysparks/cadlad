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

export interface FeatureValidationContext {
  features?: ReadonlyArray<{
    id: string;
    kind: string;
  }>;
}

export interface FeaturePlugin<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = string,
> {
  kind: string;
  schema: FeatureSchema;
  compatibleHostKinds?: readonly string[];
  build: (args: TArgs) => TResult;
  validate?: (args: TArgs, context: FeatureValidationContext) => string[];
}

export class FeatureRegistry {
  private readonly plugins = new Map<string, FeaturePlugin>();

  register(plugin: FeaturePlugin): void {
    if (this.plugins.has(plugin.kind)) {
      throw new Error(`Feature kind \"${plugin.kind}\" is already registered.`);
    }
    this.plugins.set(plugin.kind, plugin);
  }

  get(kind: string): FeaturePlugin {
    const plugin = this.plugins.get(kind);
    if (!plugin) {
      throw new Error(`Unknown feature kind \"${kind}\".`);
    }
    return plugin;
  }

  has(kind: string): boolean {
    return this.plugins.has(kind);
  }

  validate(
    kind: string,
    args: Record<string, unknown>,
    context: FeatureValidationContext = {},
  ): FeatureValidationResult {
    const plugin = this.get(kind);
    const errors: string[] = [];

    for (const [fieldName, fieldSchema] of Object.entries(plugin.schema)) {
      const value = args[fieldName];
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

    for (const key of Object.keys(args)) {
      if (!(key in plugin.schema)) {
        errors.push(`Unknown field \"${key}\" for ${kind}.`);
      }
    }

    if (plugin.compatibleHostKinds) {
      const hostId = args.hostId;
      if (typeof hostId !== "string" || hostId.trim().length === 0) {
        errors.push(`Field \"hostId\" must be a non-empty string for ${kind}.`);
      } else {
        const hostFeature = context.features?.find((feature) => feature.id === hostId);
        if (!hostFeature) {
          errors.push(`Feature host \"${hostId}\" was not found for ${kind}.`);
        } else if (!plugin.compatibleHostKinds.includes(hostFeature.kind)) {
          errors.push(
            `Feature host \"${hostId}\" must be one of [${plugin.compatibleHostKinds.join(", ")}] for ${kind}, got \"${hostFeature.kind}\".`,
          );
        }
      }
    }

    if (plugin.validate) {
      errors.push(...plugin.validate(args, context));
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
    validate: (args) => {
      const errors: string[] = [];
      for (const key of ["length", "height", "thickness"] as const) {
        const value = args[key];
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
      hostId: { type: "string" },
      width: { type: "number" },
      depth: { type: "number" },
      pitchDeg: { type: "number" },
      overhang: { type: "number" },
    },
    compatibleHostKinds: ["wall.straight"],
    validate: (args) => {
      const errors: string[] = [];
      const pitch = args.pitchDeg;
      if (typeof pitch === "number" && (pitch <= 0 || pitch >= 80)) {
        errors.push("Field \"pitchDeg\" must be in (0, 80) for roof.gable.");
      }
      const overhang = args.overhang;
      if (typeof overhang === "number" && overhang < 0) {
        errors.push("Field \"overhang\" must be >= 0 for roof.gable.");
      }
      return errors;
    },
    build: (args) =>
      `createGableRoof(${String(args.width)}, ${String(args.depth)}, ${String(args.pitchDeg)}, ${String(args.overhang)})`,
  });

  return registry;
}
