/**
 * Live parameter system.
 *
 * param() registers a named parameter that the UI can bind sliders to.
 * During evaluation, the runtime injects current values; the modeler
 * just calls param() and gets a number back.
 */

import type { ParamDef } from "../engine/types.js";

/** Current parameter values injected by the runtime before evaluation. */
let _paramValues: Map<string, number> = new Map();

/** Collected param definitions from the current evaluation. */
let _paramDefs: ParamDef[] = [];

/**
 * Declare a live parameter.
 *
 * ```ts
 * const width = param("Width", 120, { min: 60, max: 220, unit: "mm" });
 * ```
 */
export function param(
  name: string,
  defaultValue: number,
  opts?: { min?: number; max?: number; step?: number; unit?: string },
): number {
  const def: ParamDef = {
    name,
    value: _paramValues.get(name) ?? defaultValue,
    min: opts?.min,
    max: opts?.max,
    step: opts?.step,
    unit: opts?.unit,
  };
  _paramDefs.push(def);
  return def.value;
}

/** @internal Set param values before running a model. */
export function _setParamValues(values: Map<string, number>): void {
  _paramValues = values;
}

/** @internal Reset and collect param defs during evaluation. */
export function _resetParams(): void {
  _paramDefs = [];
}

/** @internal Get collected param defs after evaluation. */
export function _getParamDefs(): ParamDef[] {
  return [..._paramDefs];
}
