/**
 * Evaluation worker — runs evaluateModel() off the main thread.
 *
 * Keeps the Three.js animation loop unblocked during WASM geometry computation.
 * Manifold WASM is initialized once when the worker starts, then reused.
 *
 * Protocol:
 *   main → worker:  { id, code, paramValues?: [string, number][] }
 *   worker → main:  { id, ok: true, bodies, toolBodies, errors, params,
 *                      evaluation, hints, camera }
 *                 | { id, ok: false, errors }
 *
 * Mesh ArrayBuffers are transferred (zero-copy) rather than copied.
 */

import { initManifold } from "@cadlad/kernel/manifold-backend.js";
import { evaluateModel } from "@cadlad/api/runtime.js";
import type { Color } from "@cadlad/kernel/types.js";

console.log("[worker] Starting worker script...");
await initManifold();
console.log("[worker] Manifold initialized.");

// Signal ready (main thread can start sending work)
self.postMessage({ type: "ready" });
console.log("[worker] Sent READY message.");

self.onmessage = async (e: MessageEvent) => {
  const { id, code, paramValues } = e.data as {
    id: number;
    code: string;
    paramValues?: [string, number][];
  };
  console.log("[worker] Received work request:", id);

  try {
    const result = await evaluateModel(
      code,
      paramValues ? new Map(paramValues) : undefined,
    );

    // Serialize bodies for transfer — extract underlying ArrayBuffers so
    // postMessage can transfer ownership (zero-copy) rather than clone.
    const transferList: ArrayBuffer[] = [];

    function serializeBodies(bodies: typeof result.bodies) {
      return bodies.map((body) => {
        // Clone buffers — .buffer may be a SharedArrayBuffer (WASM heap) or a
        // sub-view; slice() always returns a plain ArrayBuffer, safe to transfer.
        const positions = body.mesh.positions.buffer.slice(
          body.mesh.positions.byteOffset,
          body.mesh.positions.byteOffset + body.mesh.positions.byteLength,
        ) as ArrayBuffer;
        const normals = body.mesh.normals.buffer.slice(
          body.mesh.normals.byteOffset,
          body.mesh.normals.byteOffset + body.mesh.normals.byteLength,
        ) as ArrayBuffer;
        const indices = body.mesh.indices.buffer.slice(
          body.mesh.indices.byteOffset,
          body.mesh.indices.byteOffset + body.mesh.indices.byteLength,
        ) as ArrayBuffer;
        transferList.push(positions, normals, indices);
        return {
          kind: body.kind,
          name: body.name,
          color: body.color as Color | undefined,
          positions,
          normals,
          indices,
        };
      });
    }

    const bodies = serializeBodies(result.bodies);
    const toolBodies = serializeBodies(result.toolBodies ?? []);

(self as any).postMessage(
      {
        id,
        ok: true,
        bodies,
        toolBodies,
        errors: result.errors,
        params: result.params,
        evaluation: result.evaluation,
        hints: result.hints,
        camera: result.camera,
      },
      transferList,
    );
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    });
  }
};
