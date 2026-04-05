/**
 * CadLad Viewer — minimal headless-friendly renderer.
 *
 * Implements the full CadladAutomationApi. Geometry evaluation runs in a
 * dedicated Web Worker (eval.worker.ts) so the Three.js animation loop on the
 * main thread is never blocked by WASM computation.
 *
 * Used by:
 *   - RenderSession (eval loop screenshots via Playwright)
 *   - render-node.mjs (CLI snapshot tool)
 *
 * Served at /viewer.html. The viewport fills 100% of the window.
 *
 * Query params (all optional):
 *   ?style=high-contrast   Use high-contrast render style
 */

import { EvalWorkerClient } from "./eval-worker-client.js";
import { Viewport } from "./viewport.js";
import type { CadladAutomationApi, CameraView } from "./automation-types.js";
import type { ModelResult } from "@cadlad/kernel/types.js";

const urlParams = new URLSearchParams(location.search);
const style = urlParams.get("style") === "high-contrast" ? "high-contrast" : "default";

const container = document.getElementById("viewport") as HTMLElement;
const viewport = new Viewport(container, style);

const evalWorker = new EvalWorkerClient();

let currentCode = "";
let currentParams = new Map<string, number>();
let lastResult: ModelResult | null = null;

// Synthesize a ModelResult from the worker's response so callers get the full type
function toModelResult(r: Awaited<ReturnType<EvalWorkerClient["run"]>>): ModelResult {
  return {
    bodies: r.bodies,
    toolBodies: r.toolBodies,
    errors: r.errors,
    params: r.params,
    evaluation: r.evaluation,
    hints: r.hints,
    camera: r.camera,
  };
}

const api: CadladAutomationApi = {
  setCode(code: string) {
    currentCode = code;
    currentParams = new Map();
  },

  async run(): Promise<ModelResult | null> {
    if (!currentCode.trim()) return null;
    const r = await evalWorker.run(currentCode, currentParams);
    lastResult = toModelResult(r);
    if (lastResult.errors.length === 0) {
      viewport.setBodies([...lastResult.bodies, ...(lastResult.toolBodies ?? [])]);
    }
    return lastResult;
  },

  getResult(): ModelResult | null {
    return lastResult;
  },

  getErrors(): string {
    return lastResult?.errors.join("\n") ?? "";
  },

  hasError(): boolean {
    return (lastResult?.errors.length ?? 0) > 0;
  },

  getParams(): Record<string, number> {
    return Object.fromEntries(
      (lastResult?.params ?? []).map((p) => [p.name, p.value]),
    );
  },

  async setParam(name: string, value: number): Promise<void> {
    if (!currentCode.trim()) return;
    currentParams = new Map([
      ...(lastResult?.params ?? []).map((p) => [p.name, p.value] as [string, number]),
      ...currentParams,
      [name, value],
    ]);
    const r = await evalWorker.run(currentCode, currentParams);
    lastResult = toModelResult(r);
    if (lastResult.errors.length === 0) {
      viewport.setBodies([...lastResult.bodies, ...(lastResult.toolBodies ?? [])]);
    }
  },

  setView(view: CameraView): void {
    viewport.setView(view);
  },

  setCameraPosition(pos, target) {
    viewport.setCameraPosition(pos, target);
  },

  getCameraPosition() {
    return viewport.getCameraPosition();
  },

  captureFrame(view?: CameraView): string {
    if (view) return viewport.captureView(view);
    return viewport.captureFrame();
  },

  setCrossSection(axis, offset) {
    viewport.setCrossSection(axis, offset);
  },

  clearCrossSection() {
    viewport.clearCrossSection();
  },
};

window.__cadlad = api;

// Signal to automation that the viewer is ready
// (window.__cadlad is already set; this is just belt-and-suspenders for slow workers)
await evalWorker.ready();
