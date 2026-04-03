/**
 * CadLad Studio — browser entry point.
 *
 * Wires up the Monaco editor, Three.js viewport, and parameter panel.
 */

import { createEditor } from "./editor.js";
import { Viewport } from "./viewport.js";
import { ParamPanel } from "./param-panel.js";
import {
  LiveSessionClient,
  type LiveSessionEvent,
  type LiveSessionState,
  type SessionPatchPayload,
} from "./live-session-client.js";
import { evaluateModel } from "../api/runtime.js";
import { computeModelStats } from "./model-stats.js";
import { EditorDecorations } from "./editor-decorations.js";
import { PatchHistoryPanel } from "./patch-history.js";
import type { PatchEvent } from "./types/live-session.js";
import type { CadladAutomationApi } from "./automation-types.js";
import { formatValidationDiagnostic } from "../validation/layered-validation.js";

const REMOTE_RUN_DEBOUNCE_MS = 150;

type LiveUiState = "idle" | "connecting" | "connected" | "patching" | "rerunning" | "failed";

function toPatchEvent(serverPatch: SessionPatchPayload): PatchEvent {
  const compactTitle = serverPatch.summary.trim().replace(/\s+/g, " ");
  return {
    patchId: serverPatch.id,
    revision: serverPatch.revision,
    timestamp: new Date(serverPatch.createdAt ?? Date.now()).toISOString(),
    author: "assistant",
    summary: {
      title: compactTitle,
    },
    runResult: serverPatch.runResult
      ? {
          state: serverPatch.runResult.success ? "success" : "failed",
          revision: serverPatch.revision,
          timestamp: new Date(serverPatch.runResult.timestamp).toISOString(),
          message: serverPatch.runResult.errors?.join("\n"),
        }
      : undefined,
  };
}

/**
 * Build a connect prompt for Claude Desktop / Claude Code (stdio MCP).
 * These clients configure the session via CADLAD_SESSION_URL env var, not OAuth.
 */
function buildClaudePrompt(sessionId: string, token: string): string {
  return `CadLad session ready. CADLAD_SESSION_URL="?session=${sessionId}&token=${token}". Call get_session_state to start.`;
}

/**
 * Build an MCP server URL snippet for ChatGPT / OpenAI Apps SDK.
 * No credentials in the URL — auth goes through the OAuth flow.
 */
function buildChatGptPrompt(mcpBase: string): string {
  return `Add this as an MCP server in ChatGPT:
  ${mcpBase}/mcp

Then click "Connect ChatGPT" in the studio to generate a link code for authorization.`;
}

async function boot() {
  const editorPane = document.getElementById("editor-pane")!;
  const viewportEl = document.getElementById("viewport")!;
  const workspaceEl = document.getElementById("workspace")!;
  const mobileSplitter = document.getElementById("mobile-splitter") as HTMLButtonElement;
  const paramEl = document.getElementById("param-panel")!;
  const runBtn = document.getElementById("btn-run")!;
  const exportBtn = document.getElementById("btn-export-stl")!;
  const toggleParamsBtn = document.getElementById("btn-toggle-params") as HTMLButtonElement;
  const toolbarActions = document.getElementById("toolbar-actions")!;
  const liveBtn = document.getElementById("btn-live-session") as HTMLButtonElement;
  const liveStatus = document.getElementById("live-session-status") as HTMLElement;
  const liveFeedback = document.getElementById("live-session-feedback") as HTMLElement;
  const copyClaudePromptBtn = document.getElementById("btn-copy-claude-prompt") as HTMLButtonElement;
  const connectChatGptBtn = document.getElementById("btn-connect-chatgpt") as HTMLButtonElement;
  const copyLiveErrorBtn = document.getElementById("btn-copy-live-error") as HTMLButtonElement;

  // ── Toolbar ⋯ menu ────────────────────────────────────────────────────────
  const menuBtn = document.getElementById("btn-menu") as HTMLButtonElement;
  const toolbarMenuEl = document.getElementById("toolbar-menu")!;
  const toggleMenu = (open?: boolean) => {
    const next = open ?? !toolbarMenuEl.classList.contains("open");
    toolbarMenuEl.classList.toggle("open", next);
    menuBtn.setAttribute("aria-expanded", String(next));
  };
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", () => toggleMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleMenu(false); });

  copyClaudePromptBtn.addEventListener("click", async () => {
    if (!liveSessionId || !liveToken) return;
    // For Claude Desktop / Claude Code (stdio MCP), copy the session URL with credentials.
    // For ChatGPT, use the "Connect ChatGPT" button instead.
    const prompt = buildClaudePrompt(liveSessionId, liveToken);
    try {
      await navigator.clipboard.writeText(prompt);
      const prev = copyClaudePromptBtn.textContent;
      copyClaudePromptBtn.textContent = "✓ Copied!";
      setTimeout(() => { copyClaudePromptBtn.textContent = prev; }, 1500);
    } catch {
      /* clipboard denied */
    }
  });

  // Connect ChatGPT via OAuth: generate a link code and show the MCP server URL.
  // The user adds the MCP URL to ChatGPT, then enters the link code in the consent form.
  connectChatGptBtn.addEventListener("click", async () => {
    if (!liveSessionId || !liveToken) return;
    connectChatGptBtn.disabled = true;
    const prev = connectChatGptBtn.textContent;
    connectChatGptBtn.textContent = "…";
    try {
      const { linkCode, expiresIn } = await liveClient.createLinkCode(liveSessionId, liveToken);
      const mcpUrl = `${liveClient.apiBase}/mcp`;
      const instructions = [
        buildChatGptPrompt(liveClient.apiBase),
        `Link code: ${linkCode}  (expires in ${expiresIn}s — enter this in the ChatGPT authorization form)`,
      ].join("\n\n");
      await copyText(instructions);
      setLiveUi("connected", `Link code: ${linkCode} (${expiresIn}s) — MCP: ${mcpUrl}`);
      connectChatGptBtn.textContent = "✓ Copied";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLiveUi("failed", `Link code failed: ${msg}`);
      connectChatGptBtn.textContent = prev;
    } finally {
      setTimeout(() => {
        connectChatGptBtn.disabled = false;
        connectChatGptBtn.textContent = prev;
      }, 12000);
    }
  });

  copyLiveErrorBtn.addEventListener("click", async () => {
    const text = [liveStatus.textContent, liveFeedback.textContent].filter(Boolean).join(" — ");
    try {
      await navigator.clipboard.writeText(text);
      const prev = copyLiveErrorBtn.textContent;
      copyLiveErrorBtn.textContent = "✓";
      setTimeout(() => { copyLiveErrorBtn.textContent = prev; }, 1500);
    } catch {
      /* clipboard denied — do nothing */
    }
  });

  // Error bar
  const errorBar = document.createElement("div");
  errorBar.id = "error-bar";
  const errorBarText = document.createElement("span");
  errorBarText.id = "error-bar-text";
  const errorBarCopy = document.createElement("button");
  errorBarCopy.id = "error-bar-copy";
  errorBarCopy.textContent = "copy";
  errorBarCopy.title = "Copy full error to clipboard";
  errorBar.appendChild(errorBarText);
  errorBar.appendChild(errorBarCopy);
  viewportEl.appendChild(errorBar);

  let errorCopyTimer: number | null = null;
  const copyErrorText = () => {
    const text = errorBarText.textContent ?? "";
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      errorBarCopy.textContent = "copied!";
      errorBar.classList.add("copied");
      if (errorCopyTimer !== null) window.clearTimeout(errorCopyTimer);
      errorCopyTimer = window.setTimeout(() => {
        errorBarCopy.textContent = "copy";
        errorBar.classList.remove("copied");
        errorCopyTimer = null;
      }, 1500);
    }).catch(() => { /* clipboard unavailable */ });
  };
  errorBar.addEventListener("click", copyErrorText);
  errorBarCopy.addEventListener("click", (e) => { e.stopPropagation(); copyErrorText(); });

  // Init components
  const editor = createEditor(editorPane);

  const liveClient = new LiveSessionClient();
  let liveSessionId: string | null = null;
  let liveToken: string | null = null;
  let liveRevision = 0;
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
  const tokenParam = urlParams.get("token");
  if (tokenParam) {
    liveToken = tokenParam;
  }
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
  let viewerHeightPercent = 45;
  let splitterPointerId: number | null = null;
  let isParamsOpen = false;

  const setParamsOpen = (open: boolean) => {
    isParamsOpen = open;
    document.body.classList.toggle("params-open", open);
    toggleParamsBtn?.setAttribute("aria-expanded", String(open));
  };

  const syncResponsiveLayout = () => {
    const isMobilePortrait = mobilePortraitQuery.matches;
    document.body.classList.toggle("mobile-portrait", isMobilePortrait);
    workspaceEl.style.setProperty("--viewer-height", String(viewerHeightPercent));
    if (!isMobilePortrait) {
      setParamsOpen(true);
    } else {
      setParamsOpen(false);
    }
  };

  const setViewerSplit = (nextPercent: number) => {
    viewerHeightPercent = Math.max(20, Math.min(80, nextPercent));
    workspaceEl.style.setProperty("--viewer-height", viewerHeightPercent.toFixed(2));
  };

  const onSplitterPointerMove = (event: PointerEvent) => {
    if (splitterPointerId !== event.pointerId || !mobilePortraitQuery.matches) return;
    const rect = workspaceEl.getBoundingClientRect();
    if (rect.height <= 0) return;
    const nextPercent = ((event.clientY - rect.top) / rect.height) * 100;
    setViewerSplit(nextPercent);
    event.preventDefault();
  };

  const stopSplitterDrag = (event: PointerEvent) => {
    if (splitterPointerId !== event.pointerId) return;
    mobileSplitter.releasePointerCapture(event.pointerId);
    splitterPointerId = null;
    window.removeEventListener("pointermove", onSplitterPointerMove);
    window.removeEventListener("pointerup", stopSplitterDrag);
    window.removeEventListener("pointercancel", stopSplitterDrag);
  };

  mobileSplitter.addEventListener("pointerdown", (event) => {
    if (!mobilePortraitQuery.matches) return;
    splitterPointerId = event.pointerId;
    mobileSplitter.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", onSplitterPointerMove);
    window.addEventListener("pointerup", stopSplitterDrag);
    window.addEventListener("pointercancel", stopSplitterDrag);
    event.preventDefault();
  });

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
        const errorLines = result.diagnostics && result.diagnostics.length > 0
          ? result.diagnostics
            .filter((diag) => diag.severity === "error")
            .map((diag) => formatValidationDiagnostic(diag))
          : result.errors;
        errorBarText.textContent = errorLines.join("\n");
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

      // Post run result (screenshot + stats) to worker so MCP get_latest_screenshot works
      if (liveSessionId) {
        try {
          const screenshot = viewport.captureFrame();
          const stats = computeModelStats(result.bodies);
          void liveClient.postRunResult(liveSessionId, liveRevision, {
            success: result.errors.length === 0,
            errors: result.errors,
            warnings: (result.diagnostics ?? [])
              .filter((diag) => diag.severity === "warning")
              .map((diag) => formatValidationDiagnostic(diag)),
            timestamp: Date.now(),
            screenshot,
            stats,
          });
        } catch {
          // Best-effort — don't break the run on screenshot/post failure
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errorBarText.textContent = msg;
      errorBar.classList.add("visible");
      if (liveSessionId) {
        setLiveUi("failed", msg);
        void liveClient.postRunResult(liveSessionId, liveRevision, {
          success: false,
          errors: [msg],
          warnings: [],
          timestamp: Date.now(),
        });
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

    if (typeof session.revision === "number") {
      liveRevision = session.revision;
    }

    if (session.patches) {
      applyPatchHistory(session.patches.map((patch) => toPatchEvent({
        id: patch.id,
        revision: patch.revision,
        summary: patch.summary,
        createdAt: patch.createdAt,
        runResult: patch.runResult,
      })));
    }

    scheduleRemoteRun();
  };

  const handleLiveEvent = (event: LiveSessionEvent) => {
    switch (event.type) {
      case "session_snapshot":
        setLiveUi("connected", "snapshot synced");
        applyRemoteSession(event.session);
        break;
      case "patch_applied":
      case "patch_reverted": {
        setLiveUi("patching", event.patch.summary ?? "assistant update");
        const nextHistory = [...patchHistory, toPatchEvent(event.patch)];
        applyPatchHistory(nextHistory);
        const patchPayload = {
          source: event.patch.sourceAfter,
          params: event.patch.paramsAfter,
          revision: event.patch.revision,
          ...event.session,
        };
        applyRemoteSession(patchPayload);
        break;
      }
      case "run_status":
        setLiveUi("connected", "run status received");
        {
          const result = event.result;
          const nextHistory = patchHistory.map((patch) =>
            patch.revision === event.revision
              ? {
                  ...patch,
                  runResult: {
                    state: result.success ? ("success" as const) : ("failed" as const),
                    revision: patch.revision,
                    timestamp: new Date(result.timestamp).toISOString(),
                    message: result.errors?.join("\n"),
                  },
                }
              : patch,
          );
          applyPatchHistory(nextHistory);
        }
        break;
      case "error":
        setLiveUi("failed", event.message);
        break;
      default:
        break;
    }
  };

  const attachLiveSession = async (sessionId: string) => {
    liveSessionId = sessionId;
    liveSource?.close();
    setLiveUi("connecting", `session ${sessionId.slice(0, 8)}`);

    const session = await liveClient.fetchSession(sessionId);
    applyRemoteSession(session);

    liveSource = liveClient.subscribe(
      sessionId,
      handleLiveEvent,
      () => setLiveUi("failed", "connection lost; retrying"),
    );

    setLiveUi("connected", "listening for patches");
    // Show the ChatGPT connect button once a live session is active
    connectChatGptBtn.style.display = "";
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
    setLiveUi("connecting", liveClient.apiBase);

    try {
      const created = await liveClient.createSession({
        source: editor.getValue(),
        params: paramPanel.getValueObject(),
      });

      setLiveUi("connected", "session ready");

      // Keep session + token in URL for page reload resilience (local to user's browser)
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("session", created.sessionId);
      nextUrl.searchParams.set("token", created.writeToken);
      window.history.replaceState({}, "", nextUrl.toString());
      liveToken = created.writeToken;

      await attachLiveSession(created.sessionId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Auto-probe worker health to surface deployment vs. routing issues
      const ping = await liveClient.ping();
      const healthNote = ping.ok
        ? `worker reachable (${ping.status})`
        : ping.status === 0
          ? `worker unreachable — ${ping.url}`
          : `worker responded ${ping.status} — ${ping.url}`;
      setLiveUi("failed", `${msg} | health: ${healthNote}`);
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

  // Expose for test automation (Puppeteer snapshot tests) and live-session bridge
  const cadladAutomation: CadladAutomationApi = {
    // ── Core ────────────────────────────────────────────────────────────────
    setCode(code: string) { editor.setValue(code); },
    /** Run the current editor source. Returns the ModelResult on completion. */
    async run() {
      await runModel();
      return lastResult;
    },
    /** Return the result of the most recent successful run. */
    getResult() { return lastResult; },
    getErrors() { return errorBarText.textContent || ""; },
    hasError() { return errorBar.classList.contains("visible"); },

    // ── Params ──────────────────────────────────────────────────────────────
    /** Get a snapshot of current param name→value map. */
    getParams(): Record<string, number> { return paramPanel.getValueObject(); },
    /** Update a single param by name and rerun. No-op if name not found. */
    async setParam(name: string, value: number): Promise<void> {
      paramPanel.setValue(name, value);
      await runModel();
    },

    // ── Camera ──────────────────────────────────────────────────────────────
    setView(view) { viewport.setView(view); },
    /** Set camera to an arbitrary [x,y,z] position in Y-up Three.js space. */
    setCameraPosition(pos, target) {
      viewport.setCameraPosition(pos, target);
    },
    getCameraPosition() { return viewport.getCameraPosition(); },

    // ── Screenshot ──────────────────────────────────────────────────────────
    /**
     * Capture the current viewport as a base64 PNG data URL.
     * If a named view is provided, temporarily switches to that view for the capture.
     */
    captureFrame(view) {
      if (view) return viewport.captureView(view);
      return viewport.captureFrame();
    },

    // ── Cross-section ────────────────────────────────────────────────────────
    /**
     * Apply a cross-section cut along an axis at the given offset.
     * @example __cadlad.setCrossSection('z', 10)  // horizontal cut 10mm up
     */
    setCrossSection(axis, offset) {
      viewport.setCrossSection(axis, offset);
    },
    clearCrossSection() { viewport.clearCrossSection(); },
  };
  window.__cadlad = cadladAutomation;

  const sessionFromUrl = urlParams.get("session");
  if (sessionFromUrl) {
    try {
      await attachLiveSession(sessionFromUrl);
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
