/**
 * Client-side wrapper for the evaluation worker.
 *
 * Provides a Promise-based run() that resolves with a ModelResult-shaped object
 * once the worker finishes. Each call gets a unique id so stale responses from
 * a superseded run() are silently ignored (cancel-on-supersede).
 */

import EvalWorker from "./eval.worker.ts?worker";
import type { ModelResult, Body, ParamDef, Hint } from "../engine/types.js";
import type { EvaluationBundle } from "../engine/types.js";
import type { Vec3 } from "../studio/automation-types.js";

interface WorkerResult {
  bodies: Body[];
  toolBodies: Body[];
  errors: string[];
  params: ParamDef[];
  evaluation: EvaluationBundle;
  hints: Hint[];
  camera?: Vec3;
}

type Resolve = (value: WorkerResult) => void;
type Reject = (reason: unknown) => void;

export class EvalWorkerClient {
  private worker: Worker;
  private pending = new Map<number, { resolve: Resolve; reject: Reject }>();
  private nextId = 0;
  private readyPromise: Promise<void>;

  constructor() {
    this.worker = new EvalWorker();
    this.readyPromise = new Promise((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (e.data?.type === "ready") {
          this.worker.removeEventListener("message", onReady);
          resolve();
        }
      };
      this.worker.addEventListener("message", onReady);
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, ok, bodies, toolBodies, errors, params, evaluation, hints, camera } = e.data;
      const entry = this.pending.get(id);
      if (!entry) return; // superseded run — ignore

      this.pending.delete(id);

      if (!ok) {
        entry.resolve({ bodies: [], toolBodies: [], errors, params: [], evaluation: emptyEvalBundle(), hints: [], camera: undefined });
        return;
      }

      entry.resolve({
        bodies: deserializeBodies(bodies),
        toolBodies: deserializeBodies(toolBodies),
        errors,
        params,
        evaluation,
        hints,
        camera,
      });
    };

    this.worker.onerror = (e) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(e.message));
      }
      this.pending.clear();
    };
  }

  /** Wait until Manifold WASM is initialized in the worker. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Evaluate model code in the worker.
   * If called again before the previous run resolves, the previous run's
   * response is discarded (cancel-on-supersede).
   */
  async run(code: string, paramValues?: Map<string, number>): Promise<WorkerResult> {
    await this.readyPromise;

    const id = this.nextId++;

    // Cancel any in-flight runs — their responses will be ignored via id check
    this.pending.clear();

    return new Promise<WorkerResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({
        id,
        code,
        paramValues: paramValues ? [...paramValues.entries()] : undefined,
      });
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

function deserializeBodies(
  serialized: Array<{
    kind?: Body["kind"];
    name?: string;
    color?: Body["color"];
    positions: ArrayBuffer;
    normals: ArrayBuffer;
    indices: ArrayBuffer;
  }>,
): Body[] {
  return serialized.map((b) => ({
    kind: b.kind,
    name: b.name,
    color: b.color,
    mesh: {
      positions: new Float32Array(b.positions),
      normals: new Float32Array(b.normals),
      indices: new Uint32Array(b.indices),
    },
  }));
}

function emptyEvalBundle(): EvaluationBundle {
  const empty = { status: "skipped" as const, errorCount: 0, warningCount: 0, diagnostics: [] };
  return {
    summary: { errorCount: 0, warningCount: 0 },
    typecheck: empty,
    semanticValidation: empty,
    geometryValidation: empty,
    relationValidation: empty,
    stats: { available: false },
    tests: { status: "skipped", total: 0, failures: 0, results: [] },
    render: { requested: false },
  };
}
