export type RunState = "success" | "failed" | "running";

export interface RunResult {
  state: RunState;
  revision: number;
  timestamp: string;
  message?: string;
}

export interface PatchSummary {
  title: string;
  details?: string;
  touchedLineRanges?: Array<{ startLine: number; endLine: number }>;
}

export interface PatchEvent {
  patchId: string;
  revision: number;
  timestamp: string;
  author?: "assistant" | "system" | "user";
  summary: PatchSummary;
  runResult?: RunResult;
}

export interface SessionStatus {
  connected: boolean;
  patching: boolean;
  rerunning: boolean;
  failed: boolean;
}

export interface PatchHistoryData {
  patches: PatchEvent[];
  selectedPatchId?: string;
}
