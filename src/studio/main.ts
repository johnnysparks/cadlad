/**
 * CadLad Studio — browser entry point.
 *
 * Wires up the Monaco editor, Three.js viewport, and parameter panel.
 */

import { createEditor } from "./editor.js";
import { Viewport } from "./viewport.js";
import { ParamPanel } from "./param-panel.js";
import { evaluateModel } from "../api/runtime.js";

async function boot() {
  const editorPane = document.getElementById("editor-pane")!;
  const viewportEl = document.getElementById("viewport")!;
  const paramEl = document.getElementById("param-panel")!;
  const runBtn = document.getElementById("btn-run")!;
  const exportBtn = document.getElementById("btn-export-stl")!;
  const toggleParamsBtn = document.getElementById("btn-toggle-params") as HTMLButtonElement;

  // Error bar
  const errorBar = document.createElement("div");
  errorBar.id = "error-bar";
  viewportEl.appendChild(errorBar);

  // Init components
  const editor = createEditor(editorPane);

  // Load code from URL if provided (?code=base64)
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get("code");
  if (codeParam) {
    try {
      editor.setValue(decodeURIComponent(escape(atob(codeParam))));
      // Clean the URL so refreshing doesn't re-load
      window.history.replaceState({}, "", window.location.pathname);
    } catch { /* ignore bad base64 */ }
  }

  const viewport = new Viewport(viewportEl);
  let lastResult: Awaited<ReturnType<typeof evaluateModel>> | null = null;

  const paramPanel = new ParamPanel(paramEl, (_name, _value) => {
    // Re-run on param change
    runModel();
  });

  const mobilePortraitQuery = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
  let isParamsOpen = false;

  const setParamsOpen = (open: boolean) => {
    isParamsOpen = open;
    document.body.classList.toggle("params-open", open);
    toggleParamsBtn?.setAttribute("aria-expanded", String(open));
  };

  const syncResponsiveLayout = () => {
    const isMobilePortrait = mobilePortraitQuery.matches;
    document.body.classList.toggle("mobile-portrait", isMobilePortrait);
    if (!isMobilePortrait) {
      setParamsOpen(true);
    } else {
      setParamsOpen(false);
    }
  };

  toggleParamsBtn?.addEventListener("click", () => {
    if (!document.body.classList.contains("mobile-portrait")) return;
    setParamsOpen(!isParamsOpen);
  });

  mobilePortraitQuery.addEventListener("change", syncResponsiveLayout);
  syncResponsiveLayout();

  async function runModel() {
    const code = editor.getValue();
    errorBar.classList.remove("visible");

    try {
      const result = await evaluateModel(code, paramPanel.getValues());
      lastResult = result;

      if (result.errors.length > 0) {
        errorBar.textContent = result.errors.join("\n");
        errorBar.classList.add("visible");
      }

      if (result.bodies.length > 0) {
        viewport.setBodies(result.bodies);
      }

      // Show hints in console (non-intrusive)
      if (result.hints && result.hints.length > 0) {
        for (const hint of result.hints) {
          const prefix = hint.severity === "warning" ? "⚠️" : "💡";
          console.log(`${prefix} ${hint.message}`);
        }
      }

      paramPanel.setParams(result.params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errorBar.textContent = msg;
      errorBar.classList.add("visible");
    }
  }

  // Run button
  runBtn.addEventListener("click", runModel);

  // Ctrl+Enter to run
  editor.addCommand(
    // Monaco KeyMod.CtrlCmd | Monaco KeyCode.Enter
    2048 | 3, // CtrlCmd | Enter
    runModel,
  );

  // Export STL
  exportBtn.addEventListener("click", () => {
    if (!lastResult || lastResult.bodies.length === 0) return;

    // Re-evaluate to get a Solid for STL export
    // For now, use the mesh data directly
    const body = lastResult.bodies[0];
    const stlBuffer = meshToSTLBuffer(body.mesh);

    const blob = new Blob([stlBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cadlad-export.stl";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Expose for test automation (Puppeteer snapshot tests)
  (window as any).__cadlad = {
    setCode(code: string) { editor.setValue(code); },
    run: runModel,
    getErrors() { return errorBar.textContent || ""; },
    hasError() { return errorBar.classList.contains("visible"); },
    setView(view: string) { viewport.setView(view as any); },
  };

  // Run the default model on load
  await runModel();
}

/** Convert a mesh to binary STL ArrayBuffer. */
function meshToSTLBuffer(mesh: { positions: Float32Array; indices: Uint32Array }): ArrayBuffer {
  const numTris = mesh.indices.length / 3;
  const buf = new ArrayBuffer(80 + 4 + numTris * 50);
  const view = new DataView(buf);
  let offset = 80;

  view.setUint32(offset, numTris, true);
  offset += 4;

  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;

    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    for (const vi of [a, b, c]) {
      view.setFloat32(offset, pos[vi], true); offset += 4;
      view.setFloat32(offset, pos[vi + 1], true); offset += 4;
      view.setFloat32(offset, pos[vi + 2], true); offset += 4;
    }

    view.setUint16(offset, 0, true); offset += 2;
  }

  return buf;
}

boot().catch((err) => {
  console.error("CadLad boot failed:", err);
  document.body.innerHTML = `<pre style="color:red;padding:20px">${err.message}\n\n${err.stack}</pre>`;
});
