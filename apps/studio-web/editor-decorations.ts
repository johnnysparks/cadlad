import * as monaco from "monaco-editor";
import type { PatchEvent } from "./types/live-session.js";

const AGE_BUCKETS_MS = [
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
];

const AGE_CLASSNAMES = [
  "patch-age-0",
  "patch-age-1",
  "patch-age-2",
  "patch-age-3",
  "patch-age-4",
];

export class EditorDecorations {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorationIds: string[] = [];

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
  }

  clear(): void {
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
  }

  highlightPatchHistory(patches: PatchEvent[], selectedPatchId?: string): void {
    const model = this.editor.getModel();
    if (!model) return;

    const lineMap = new Map<number, { ageBucket: number; isLatest: boolean; isFailure: boolean }>();
    const now = Date.now();

    for (let i = patches.length - 1; i >= 0; i -= 1) {
      const patch = patches[i];
      const ranges = patch.summary.touchedLineRanges ?? [];
      const ageMs = Math.max(0, now - Date.parse(patch.timestamp));
      const ageBucket = resolveAgeBucket(ageMs);
      const isLatest = i === patches.length - 1;
      const isFailure = patch.runResult?.state === "failed";

      for (const range of ranges) {
        const start = clampLine(model, range.startLine);
        const end = clampLine(model, range.endLine);

        for (let line = start; line <= end; line += 1) {
          if (!lineMap.has(line) || isLatest) {
            lineMap.set(line, { ageBucket, isLatest, isFailure });
          }
        }
      }
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    for (const [line, info] of lineMap.entries()) {
      const baseClass = AGE_CLASSNAMES[info.ageBucket] ?? AGE_CLASSNAMES[AGE_CLASSNAMES.length - 1];
      const latestClass = info.isLatest ? " patch-latest" : "";
      const failedClass = info.isFailure ? " patch-failed" : "";

      decorations.push({
        range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: `${baseClass}${latestClass}${failedClass}`,
          marginClassName: `${baseClass}${latestClass}${failedClass}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    if (selectedPatchId) {
      const selected = patches.find((p) => p.patchId === selectedPatchId);
      for (const range of selected?.summary.touchedLineRanges ?? []) {
        const start = clampLine(model, range.startLine);
        const end = clampLine(model, range.endLine);
        decorations.push({
          range: new monaco.Range(start, 1, end, model.getLineMaxColumn(end)),
          options: {
            isWholeLine: true,
            className: "patch-selected",
            marginClassName: "patch-selected",
          },
        });
      }
    }

    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
  }
}

function resolveAgeBucket(ageMs: number): number {
  for (let i = 0; i < AGE_BUCKETS_MS.length; i += 1) {
    if (ageMs <= AGE_BUCKETS_MS[i]) return i;
  }
  return AGE_BUCKETS_MS.length;
}

function clampLine(model: monaco.editor.ITextModel, line: number): number {
  const lineCount = model.getLineCount();
  return Math.max(1, Math.min(lineCount, line));
}
