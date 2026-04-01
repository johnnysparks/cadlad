/**
 * CadLad Studio — browser entry point.
 *
 * Wires up the Monaco editor, Three.js viewport, and parameter panel.
 */

import { createEditor } from "./editor.js";
import { Viewport } from "./viewport.js";
import { ParamPanel } from "./param-panel.js";
import { LiveSessionClient, type LiveSessionState, type PatchEventPayload } from "./live-session-client.js";
import { evaluateModel } from "../api/runtime.js";
import { EditorDecorations } from "./editor-decorations.js";
import { PatchHistoryPanel } from "./patch-history.js";
import type { PatchEvent } from "./types/live-session.js";

const REMOTE_RUN_DEBOUNCE_MS = 150;

type LiveUiState = "idle" | "connecting" | "connected" | "patching" | "rerunning" | "failed";

async function boot() {
  const editorPane = document.getElementById("editor-pane")!;
  const viewportEl = document.getElementById("viewport")!;
  const paramEl = document.getElementById("param-panel")!;
  const runBtn = document.getElementById("btn-run")!;
  const exportBtn = document.getElementById("btn-export-stl")!;
  const toggleParamsBtn = document.getElementById("btn-toggle-params") as HTMLButtonElement;
  const toolbarActions = document.getElementById("toolbar-actions")!;
  const liveBtn = document.getElementById("btn-live-session") as HTMLButtonElement;
  const liveStatus = document.getElementById("live-session-status") as HTMLElement;
  const liveFeedback = document.getElementById("live-session-feedback") as HTMLElement;

  // Error bar
  const errorBar = document.createElement("div");
  errorBar.id = "error-bar";
  viewportEl.appendChild(errorBar);

  // Init components
  const editor = createEditor(editorPane);

  const liveClient = new LiveSessionClient();
  let liveSessionId: string | null = null;
  let liveToken: string | null = null;
  let liveSource: EventSource | null = null;
  let remoteRunTimer: number | null = null;

  const setLiveUi = (state: LiveUiState, detail = "") => {
    liveStatus.dataset.state = state;
    const labels: Record<LiveUiState, string> = {
      idle: "Live: off",
      connecting: "Live: connecting",
      connected: "Live: connected",
      patching: "Live: patching",
      rerunning: "Live: rerunning",
      failed: "Live: failed",
    };
    liveStatus.textContent = labels[state];
    liveFeedback.textContent = detail;
  };

  setLiveUi("idle");

  // Load code from URL if provided (?code=base64)
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get("code");
  if (codeParam) {
    try {
      editor.setValue(decodeURIComponent(escape(atob(codeParam))));
      // Clean only the code payload so refreshing doesn't re-load.
      urlParams.delete("code");
      const nextSearch = urlParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch {
      /* ignore bad base64 */
    }
  }

  const viewport = new Viewport(viewportEl);
  let lastResult: Awaited<ReturnType<typeof evaluateModel>> | null = null;
  const editorDecorations = new EditorDecorations(editor);
  let patchHistory: PatchEvent[] = [];
  let selectedPatchId: string | undefined;

  const runStatus = document.createElement("div");
  runStatus.id = "patch-run-status";
  runStatus.textContent = "No patch activity";
  toolbarActions.prepend(runStatus);

  const patchHistoryPanel = new PatchHistoryPanel(viewportEl, {
    onSelectPatch: (patchId) => {
      selectedPatchId = patchId;
      editorDecorations.highlightPatchHistory(patchHistory, selectedPatchId);
      patchHistoryPanel.setPatches(patchHistory, selectedPatchId);
    },
    onRevertPatch: (patchId) => {
      console.info(`[live-session] revert requested for patch ${patchId}`);
      runStatus.textContent = `Revert requested: ${patchId}`;
    },
  });

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

  async function runModel(options: { fromRemote?: boolean } = {}) {
    const code = editor.getValue();
    errorBar.classList.remove("visible");

    if (options.fromRemote && liveSessionId) {
      setLiveUi("rerunning", `rev sync: ${liveSessionId.slice(0, 8)}`);
    }

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
      if (liveSessionId) {
        setLiveUi("connected", "ready");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errorBar.textContent = msg;
      errorBar.classList.add("visible");
      if (liveSessionId) {
        setLiveUi("failed", msg);
      }
    }
  }

  function applyPatchHistory(nextPatches: PatchEvent[]): void {
    patchHistory = nextPatches;
    if (selectedPatchId && !patchHistory.some((patch) => patch.patchId === selectedPatchId)) {
      selectedPatchId = undefined;
    }

    patchHistoryPanel.setPatches(patchHistory, selectedPatchId);
    editorDecorations.highlightPatchHistory(patchHistory, selectedPatchId);

    const latestPatch = patchHistory[patchHistory.length - 1];
    if (!latestPatch) {
      runStatus.textContent = "No patch activity";
      return;
    }

    const outcome = latestPatch.runResult?.state ?? "running";
    runStatus.textContent = `r${latestPatch.revision}: ${latestPatch.summary.title} (${outcome})`;
  }
  const scheduleRemoteRun = () => {
    if (remoteRunTimer !== null) {
      window.clearTimeout(remoteRunTimer);
    }
    remoteRunTimer = window.setTimeout(() => {
      remoteRunTimer = null;
      void runModel({ fromRemote: true });
    }, REMOTE_RUN_DEBOUNCE_MS);
  };

  const applyRemoteSession = (session: Partial<LiveSessionState>) => {
    if (typeof session.source === "string" && session.source !== editor.getValue()) {
      editor.setValue(session.source);
    }

    if (session.params) {
      paramPanel.setValues(session.params);
    }

    if (session.id) {
      liveSessionId = session.id;
    }

    scheduleRemoteRun();
  };

  const handleLiveEvent = (event: PatchEventPayload) => {
    switch (event.type) {
      case "session_snapshot":
        setLiveUi("connected", "snapshot synced");
        if (event.session) applyRemoteSession(event.session);
        break;
      case "patch_applied":
      case "patch_reverted": {
        setLiveUi("patching", event.patch?.summary ?? "assistant update");
        const patchPayload = {
          source: event.patch?.sourceAfter,
          params: event.patch?.paramsAfter,
          revision: event.patch?.revision,
          ...event.session,
        };
        applyRemoteSession(patchPayload);
        break;
      }
      case "run_status":
        setLiveUi("connected", "run status received");
        break;
      case "error":
        setLiveUi("failed", event.message ?? "session error");
        break;
      default:
        break;
    }
  };

  const attachLiveSession = async (sessionId: string, token: string | null) => {
    liveSessionId = sessionId;
    liveToken = token;
    liveSource?.close();
    setLiveUi("connecting", `session ${sessionId.slice(0, 8)}`);

    const session = await liveClient.fetchSession(sessionId);
    applyRemoteSession(session);

    liveSource = liveClient.subscribe(
      sessionId,
      token,
      handleLiveEvent,
      () => setLiveUi("failed", "connection lost; retrying"),
    );

    setLiveUi("connected", "listening for patches");
  };

  const copyText = async (text: string): Promise<boolean> => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  liveBtn.addEventListener("click", async () => {
    liveBtn.disabled = true;
    setLiveUi("connecting", "creating session");

    try {
      const created = await liveClient.createSession({
        source: editor.getValue(),
        params: paramPanel.getValueObject(),
      });

      const copied = await copyText(created.liveUrl);
      setLiveUi(
        "connected",
        copied ? "live link copied to clipboard" : "session ready (copy failed)",
      );

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("session", created.sessionId);
      nextUrl.searchParams.set("token", created.writeToken);
      window.history.replaceState({}, "", nextUrl.toString());

      await attachLiveSession(created.sessionId, created.writeToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveUi("failed", msg);
    } finally {
      liveBtn.disabled = false;
    }
  });

  // Run button
  runBtn.addEventListener("click", () => {
    void runModel();
  });

  // Ctrl+Enter to run
  editor.addCommand(
    // Monaco KeyMod.CtrlCmd | Monaco KeyCode.Enter
    2048 | 3, // CtrlCmd | Enter
    () => {
      void runModel();
    },
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
    setCode(code: string) {
      editor.setValue(code);
    },
    run: runModel,
    getErrors() {
      return errorBar.textContent || "";
    },
    hasError() {
      return errorBar.classList.contains("visible");
    },
    setView(view: string) {
      viewport.setView(view as any);
    },
  };

  const sessionFromUrl = urlParams.get("session");
  const tokenFromUrl = urlParams.get("token");
  if (sessionFromUrl) {
    try {
      await attachLiveSession(sessionFromUrl, tokenFromUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveUi("failed", msg);
    }
  }

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
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    view.setFloat32(offset, nx, true);
    offset += 4;
    view.setFloat32(offset, ny, true);
    offset += 4;
    view.setFloat32(offset, nz, true);
    offset += 4;

    for (const vi of [a, b, c]) {
      view.setFloat32(offset, pos[vi], true);
      offset += 4;
      view.setFloat32(offset, pos[vi + 1], true);
      offset += 4;
      view.setFloat32(offset, pos[vi + 2], true);
      offset += 4;
    }

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buf;
}

boot().catch((err) => {
  console.error("CadLad boot failed:", err);
  document.body.innerHTML = `<pre style="color:red;padding:20px">${err.message}\n\n${err.stack}</pre>`;
});
