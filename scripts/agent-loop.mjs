import { readFileSync, writeFileSync, watch, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const taskFile = process.argv[2];
if (!taskFile) {
  console.error("Usage: node scripts/agent-loop.mjs <task.yaml>");
  process.exit(1);
}

const SCRATCH_DIR = resolve("eval-scratch");
if (!existsSync(SCRATCH_DIR)) {
  mkdirSync(SCRATCH_DIR);
}

const PROMPT_FILE = resolve("eval-scratch/agent_prompt.txt");
const CODE_FILE = resolve("eval-scratch/agent_code.txt");

// Reset files
writeFileSync(PROMPT_FILE, "");
writeFileSync(CODE_FILE, "");

console.log(`[agent-loop] Starting eval for ${taskFile}`);
console.log(`[agent-loop] I will write prompts to ${PROMPT_FILE}`);
console.log(`[agent-loop] I will wait for code in ${CODE_FILE}`);

const evalProcess = spawn("npx", ["tsx", "src/cli/index.ts", "eval", taskFile], {
  stdio: ["pipe", "pipe", "inherit"],
});

let currentPrompt = "";
let collectingPrompt = false;

evalProcess.stdout.on("data", (data) => {
  const chunk = data.toString();
  process.stdout.write(chunk);

  if (chunk.includes("--- [AGENTS: GENERATE CADLAD CODE] ---")) {
    collectingPrompt = true;
    currentPrompt = "";
  }

  if (collectingPrompt) {
    currentPrompt += chunk;
  }

  if (chunk.includes("Type 'DONE' on a new line when finished.")) {
    collectingPrompt = false;
    writeFileSync(PROMPT_FILE, currentPrompt);
    console.log(`\n[agent-loop] Prompt written to ${PROMPT_FILE}. Please write code to ${CODE_FILE}.`);
  }
});

const watcher = watch(SCRATCH_DIR, (event, filename) => {
  if (filename === "agent_code.txt") {
    try {
      const code = readFileSync(CODE_FILE, "utf-8");
      if (code.trim()) {
        console.log(`[agent-loop] Code detected in ${CODE_FILE}. Sending to eval...`);
        evalProcess.stdin.write(code + "\nDONE\n");
        // We don't clear it immediately to avoid race with fs.watch, but we can clear after a delay or after next prompt
      }
    } catch (e) {
      // ignore
    }
  }
});

evalProcess.on("exit", (code) => {
  console.log(`[agent-loop] Eval process exited with code ${code}.`);
  watcher.close();
  process.exit(code || 0);
});
