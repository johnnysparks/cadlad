import type { PatchEvent } from "./types/live-session.js";

interface PatchHistoryCallbacks {
  onSelectPatch?: (patchId: string) => void;
  onRevertPatch?: (patchId: string) => void;
}

export class PatchHistoryPanel {
  private root: HTMLElement;
  private listEl: HTMLElement;
  private statusEl: HTMLElement;
  private selectedPatchId: string | undefined;
  private callbacks: PatchHistoryCallbacks;

  constructor(parent: HTMLElement, callbacks: PatchHistoryCallbacks = {}) {
    this.callbacks = callbacks;

    this.root = document.createElement("section");
    this.root.id = "patch-history";

    const header = document.createElement("div");
    header.className = "patch-history-header";
    header.innerHTML = "<h2>Patch History</h2>";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.id = "btn-toggle-patch-history";
    toggleBtn.textContent = "Patches";
    toggleBtn.addEventListener("click", () => {
      this.root.classList.toggle("open");
    });
    header.appendChild(toggleBtn);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "patch-status";

    this.listEl = document.createElement("div");
    this.listEl.className = "patch-history-list";

    this.root.appendChild(header);
    this.root.appendChild(this.statusEl);
    this.root.appendChild(this.listEl);

    parent.appendChild(this.root);
  }

  setPatches(patches: PatchEvent[], selectedPatchId?: string): void {
    this.selectedPatchId = selectedPatchId;
    this.listEl.innerHTML = "";

    if (patches.length === 0) {
      this.listEl.innerHTML = '<p class="patch-empty">No assistant patches yet.</p>';
      this.statusEl.textContent = "Awaiting live edits.";
      return;
    }

    const lastPatch = patches[patches.length - 1];
    const lastSuccess = [...patches].reverse().find((p) => p.runResult?.state === "success");
    const failingPatch = [...patches].reverse().find((p) => p.runResult?.state === "failed");

    this.statusEl.textContent = [
      `Last patch: ${lastPatch.summary.title}`,
      lastSuccess ? `Last success: r${lastSuccess.revision}` : "Last success: none",
      failingPatch ? `Current failing: r${failingPatch.revision}` : "Current failing: none",
    ].join(" • ");

    for (const patch of [...patches].reverse()) {
      const row = document.createElement("article");
      row.className = "patch-entry";
      if (patch.patchId === selectedPatchId) {
        row.classList.add("selected");
      }

      const runState = patch.runResult?.state ?? "running";
      const date = new Date(patch.timestamp);
      row.innerHTML = `
        <div class="patch-entry-main">
          <div class="patch-title">${escapeHtml(patch.summary.title)}</div>
          <div class="patch-meta">${escapeHtml(patch.patchId)} • r${patch.revision} • ${date.toLocaleTimeString()}</div>
          <div class="patch-details">${escapeHtml(patch.summary.details ?? "No details")}</div>
        </div>
        <div class="patch-entry-actions">
          <span class="patch-run-state ${runState}">${runState}</span>
          <button type="button" class="patch-revert-btn">Revert</button>
        </div>
      `;

      row.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains("patch-revert-btn")) return;
        this.selectedPatchId = patch.patchId;
        this.callbacks.onSelectPatch?.(patch.patchId);
      });

      const revertBtn = row.querySelector<HTMLButtonElement>(".patch-revert-btn");
      revertBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.onRevertPatch?.(patch.patchId);
      });

      this.listEl.appendChild(row);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
