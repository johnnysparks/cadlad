import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolve from the repository, not the caller's cwd or a global installation.
export function runCheck(name, binary, args) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tool = fileURLToPath(new URL(`../node_modules/${binary}`, import.meta.url));
  if (!existsSync(tool)) {
    console.error(`[${name}] Missing local tool: ${binary}. Run npm ci in ${root}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [tool, ...args, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) console.error(`[${name}] Could not start tool: ${result.error.message}`);
  if (result.signal) console.error(`[${name}] Tool terminated by ${result.signal}`);
  process.exit(result.status ?? 1);
}
