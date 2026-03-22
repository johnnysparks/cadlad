/**
 * Manifold geometry backend.
 *
 * Wraps the manifold-3d WASM module behind an async init gate.
 * All public helpers return Manifold solids or mesh data.
 */

import type { ManifoldToplevel } from "manifold-3d";

let _wasm: ManifoldToplevel | null = null;
let _initPromise: Promise<ManifoldToplevel> | null = null;

/** Initialise (or return cached) the Manifold WASM module. */
export async function initManifold(): Promise<ManifoldToplevel> {
  if (_wasm) return _wasm;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const mod = await import("manifold-3d");
    // manifold-3d default export is an init function: (config?) => Promise<ManifoldToplevel>
    const init = mod.default;
    const wasm: ManifoldToplevel = await init();
    _wasm = wasm;
    return _wasm;
  })();

  return _initPromise;
}

/** Get the already-initialised module (throws if not ready). */
export function getManifold(): ManifoldToplevel {
  if (!_wasm) throw new Error("Manifold not initialised – call initManifold() first");
  return _wasm;
}
