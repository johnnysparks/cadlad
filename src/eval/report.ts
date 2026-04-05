import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface AggregatedLogReport {
  generated_at: string;
  total_logs: number;
  total_events: number;
  by_event: Record<string, number>;
}

export function aggregateLogs(baseDir = "eval-logs"): string {
  const logFiles = collectNdjsonFiles(resolve(baseDir));
  const byEvent: Record<string, number> = {};
  let totalEvents = 0;

  for (const file of logFiles) {
    const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { event?: string };
        if (!parsed.event) continue;
        byEvent[parsed.event] = (byEvent[parsed.event] ?? 0) + 1;
        totalEvents += 1;
      } catch {
        // Ignore malformed lines.
      }
    }
  }

  const report: AggregatedLogReport = {
    generated_at: new Date().toISOString(),
    total_logs: logFiles.length,
    total_events: totalEvents,
    by_event: byEvent,
  };

  const reportsDir = resolve(baseDir, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const reportPath = join(reportsDir, filename);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  return reportPath;
}

function collectNdjsonFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...collectNdjsonFiles(fullPath));
      } else if (entry.endsWith(".ndjson")) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}
