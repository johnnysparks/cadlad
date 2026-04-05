import { Solid } from "@cadlad/kernel/solid.js";

export class ToolBody {
  readonly _isToolBody = true as const;
  readonly name: string;
  readonly solid: Solid;

  constructor(name: string, solid: Solid) {
    this.name = name;
    this.solid = solid;
  }
}

/**
 * Mark a solid as construction-only geometry intended for boolean operations.
 */
export function toolBody(name: string, solid: Solid): ToolBody {
  return new ToolBody(name, solid);
}

export function isToolBody(value: unknown): value is ToolBody {
  if (value instanceof ToolBody) {
    return true;
  }
  return Boolean(
    value &&
    typeof value === "object" &&
    "_isToolBody" in value &&
    (value as { _isToolBody: unknown })._isToolBody === true &&
    "name" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    "solid" in value &&
    (value as { solid: unknown }).solid instanceof Solid,
  );
}
