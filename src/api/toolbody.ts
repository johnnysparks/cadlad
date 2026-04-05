import { Solid } from "../engine/solid.js";

export type ToolBody = {
  name: string;
  solid: Solid;
};

/**
 * Mark a solid as construction-only geometry intended for boolean operations.
 */
export function toolBody(name: string, solid: Solid): ToolBody {
  return { name, solid };
}

export function isToolBody(value: unknown): value is ToolBody {
  return Boolean(
    value &&
    typeof value === "object" &&
    "name" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    "solid" in value &&
    (value as { solid: unknown }).solid instanceof Solid,
  );
}
