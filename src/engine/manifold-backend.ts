/**
 * Manifold geometry backend.
 *
 * Wraps the manifold-3d WASM module behind an async init gate.
 * All public helpers return Manifold solids or mesh data.
 */

import type Module from "manifold-3d";

let _wasm: typeof Module | null = null;
let _initPromise: Promise<typeof Module> | null = null;

/** Initialise (or return cached) the Manifold WASM module. */
export async function initManifold(): Promise<typeof Module> {
  if (_wasm) return _wasm;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const mod = await import("manifold-3d");
    // manifold-3d exports a default init function in newer versions
    const init = mod.default ?? mod;
    const wasm = typeof init === "function" ? await init() : init;
    _wasm = wasm;
    return wasm;
  })();

  return _initPromise;
}

/** Get the already-initialised module (throws if not ready). */
export function getManifold(): typeof Module {
  if (!_wasm) throw new Error("Manifold not initialised – call initManifold() first");
  return _wasm;
}
