# Eval Loop — Implementation Prompts

> Drop each prompt into a fresh Claude Code session on branch `claude/agent-evaluation-loop-GXddC`.
> Steps 1-2 can run in parallel. Everything else is sequential.

---

## Parallelism Map

```
Step 1 (types + YAML) ──┐
                         ├──▶ Step 3 (scorer) ──▶ Step 4 (runner + CLI) ──▶ Step 5 (benchmarks)
Step 2 (model adapter) ──┘
```

---

## Step 1: Types + Task Spec YAML Schema

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Read these files first to understand existing types:
- docs/agent-eval-loop.md (full design doc — read sections 1-3)
- src/engine/types.ts (EvaluationBundle, GeometryStats, ModelResult, ValidationDiagnostic)
- src/cli/run-output.ts (RunJsonOutput — what `cadlad run --json` returns)

TASK: Create `src/eval/types.ts` (~80 LOC) with these types:

1. TaskSpec — parsed from YAML benchmark files:
   - id: string
   - difficulty: number (1-5)
   - description: string
   - acceptance: AcceptanceCriteria
   - api_surface: string[] (e.g. ["box", "cylinder", "subtract"])
   - reference_images?: string[] (relative paths)
   - max_iterations: number (default 3)
   - pass_threshold?: number (default 70)

2. AcceptanceCriteria:
   - body_count?: number
   - body_count_min?: number
   - volume_min?: number
   - volume_max?: number
   - bbox_max?: [number, number, number]
   - validation_errors?: number (expected count, usually 0)
   - has_params?: string[]
   - assembly?: boolean
   - printability?: { max_overhang_ratio?: number }
   - constraint_clearance?: { min_mm?: number; max_mm?: number }

3. ScoreBreakdown:
   - geometry: number (0-100)
   - constraints: number (0-100)
   - api_surface: number (0-100)
   - judge: number (0-100, 0 if skipped)
   - total: number (weighted: 0.4 * geometry + 0.3 * constraints + 0.2 * api + 0.1 * judge)

4. EvalResult:
   - run_id: string
   - task_id: string
   - model: string
   - pass: boolean
   - score: ScoreBreakdown
   - iterations: number
   - total_tokens: number
   - duration_ms: number
   - final_source?: string (the .forge.ts code)
   - eval_bundle?: EvaluationBundle (from engine/types.ts)
   - failure_reason?: string

5. EvalEvent — NDJSON log line:
   - ts: number (Unix ms)
   - run_id: string
   - task_id: string
   - event: string (one of: "run.started", "build.code_generated", "eval.completed",
     "score.computed", "decide.action", "build.retry", "run.completed", "error")
   - data: Record<string, unknown>

6. ModelConfig:
   - url: string (e.g. "ollama://llama3.2", "anthropic://claude-sonnet-4-6")
   - temperature?: number (default 0.3)
   - max_tokens?: number (default 4096)

7. A parseTaskSpec(yamlString: string): TaskSpec function.
   Use a simple YAML parser — just split on ":" for flat fields. BUT: if you
   find that js-yaml is already in package.json use it. If not, the acceptance
   criteria nesting makes hand-parsing ugly, so add js-yaml as a dependency
   (it's 0 transitive deps, ~30KB). Validate required fields, throw on missing id/description.

Also create the first benchmark file: tasks/benchmark/box-with-hole.yaml
(mkdir -p tasks/benchmark/ first). Use the exact spec from docs/agent-eval-loop.md section 2.

Run `npm run typecheck` to verify. Commit to the branch. Push.
```

---

## Step 2: Model Adapter (Ollama + Anthropic + OpenAI)

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Read these files first:
- docs/agent-eval-loop.md (Appendix C for the interface)
- src/eval/types.ts (ModelConfig — if it exists from a prior step; if not, define
  ModelConfig inline as { url: string; temperature?: number; max_tokens?: number })

TASK: Create `src/eval/model-adapter.ts` (~150 LOC).

Interface:
```typescript
interface GenerateRequest {
  prompt: string;
  images?: Buffer[];       // base64-encoded for vision models
  temperature?: number;    // default 0.3
  max_tokens?: number;     // default 4096
}

interface GenerateResponse {
  text: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
}

interface ModelAdapter {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}
```

Export a factory: `createModelAdapter(config: ModelConfig): ModelAdapter`

URL scheme determines backend:
- `ollama://model-name` → POST to http://localhost:11434/api/generate
  Body: { model, prompt, images (base64 array), stream: false, options: { temperature, num_predict } }
  Response: { response, prompt_eval_count, eval_count, total_duration }

- `anthropic://model-name` → POST to https://api.anthropic.com/v1/messages
  Headers: x-api-key from ANTHROPIC_API_KEY env, anthropic-version: "2023-06-01"
  Body: { model, max_tokens, messages: [{ role: "user", content: [...] }] }
  For images: content array with { type: "image", source: { type: "base64", media_type, data } }
  Response: { content[0].text, usage: { input_tokens, output_tokens } }

- `openai://model-name` → POST to https://api.openai.com/v1/chat/completions
  Headers: Authorization: Bearer from OPENAI_API_KEY env
  Body: { model, temperature, max_tokens, messages: [{ role: "user", content: [...] }] }
  For images: content array with { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
  Response: { choices[0].message.content, usage: { prompt_tokens, completion_tokens } }

- `http://` or `https://` (no scheme prefix) → treat as OpenAI-compatible endpoint
  (same format as openai://, but use the URL directly instead of api.openai.com)

Use native fetch() — no SDK dependencies. Throw descriptive errors on missing API keys,
non-200 responses, or network failures. Include the HTTP status and response body in errors.

Also export a helper: `extractCode(response: string): string` that pulls the first
```typescript or ``` fenced code block from an LLM response. If no fence found, return
the full response trimmed (the model might have returned raw code).

Run `npm run typecheck` to verify. Commit to the branch. Push.
```

---

## Step 3: Scorer + Prompt Builder

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Pull latest from origin first — Steps 1-2 may have landed.

Read these files:
- src/eval/types.ts (TaskSpec, AcceptanceCriteria, ScoreBreakdown)
- src/engine/types.ts (EvaluationBundle, GeometryStats)
- src/cli/run-output.ts (RunJsonOutput schema)
- src/api/runtime.ts lines 1-30 (see what API symbols exist)
- CLAUDE.md "3D Tools API Contract" section and "Model files (.forge.ts)" section
- projects/box-with-hole/box-with-hole.forge.ts (example of real .forge.ts code)

TASK A: Create `src/eval/scorer.ts` (~100 LOC)

Export: `scoreEval(task: TaskSpec, bundle: EvaluationBundle, source: string): ScoreBreakdown`

Geometry score (0-100, weight 0.4):
- body count matches task.acceptance.body_count (or >= body_count_min): 20 pts
- volume within [volume_min, volume_max] (if specified): 40 pts
- bbox within bbox_max (if specified): 20 pts
- no degenerate geometry (checks.hasZeroVolume=false, hasDegenerateBoundingBox=false): 20 pts
- If a check is not specified in acceptance, award full points for that check.

Constraint score (0-100, weight 0.3):
- bundle.summary.errorCount === (task.acceptance.validation_errors ?? 0): 60 pts
- bundle.summary.warningCount === 0: 20 pts (partial: max(0, 20 - warningCount * 5))
- If task.acceptance.has_params specified, check source contains each param name: 20 pts

API surface score (0-100, weight 0.2):
- For each method in task.api_surface, check if the string appears in source.
- Score = (matches / total) * 100

Judge score: always 0 for now (placeholder). When judge=0, redistribute its 0.1 weight
proportionally to the other three (so effective weights become ~0.44, ~0.33, ~0.22).

TASK B: Create `src/eval/prompts.ts` (~80 LOC)

Export: `buildSystemPrompt(task: TaskSpec): string`

The prompt should be ~300 tokens and include:
1. Role: "You are a 3D CAD modeling assistant. Generate CadLad .forge.ts code."
2. Coordinate system: Z-up, ground plane Z=0, build upward.
3. Return contract: must return a Solid, Assembly, or { model, camera }.
4. API reference subset — map task.api_surface entries to one-line descriptions:
   - box: `box(width, depth, height)` → centered box
   - cylinder: `cylinder(height, radius)` → Z-aligned cylinder
   - sphere: `sphere(radius, segments?)` → centered sphere
   - roundedBox: `roundedBox(w, d, h, radius, segments?)` → all edges rounded
   - subtract: `.subtract(other)` → boolean cut (oversize cutters by 1-2mm)
   - union: `.union(other)` → boolean merge
   - translate: `.translate(x, y, z)` → move
   - rotate: `.rotate([x, y, z])` → rotate degrees
   - color: `.color("#hex")` → set color
   - param: `param("name", default, min, max)` → slider parameter
   - sketch: `Sketch.begin().moveTo(x,y)...close()` → 2D profile
   - extrude: `sketch.extrude(height)` → push along Z
   - extrudeAlong: `sketch.extrudeAlong([x,y,z], height)` → push along direction
   - lShape/slot/channel/tShape: sketch helpers
   - assembly: `assembly("name").add("part", solid, [x,y,z])`
   - shell: `.shell(thickness)` → hollow out
   - draft: `.draft(angleDeg)` → taper walls
   - fillet: `.fillet(subdivisions)` → round edges
   - constraint: `constraint("type", config)`
   - (add more as needed — just keep each to one line)
5. Task description (from task.description)
6. Acceptance criteria as bullet points
7. Rules: use param() for dimensions, oversize cutters, use assembly for multi-color, return the model
8. "Output ONLY the .forge.ts code in a ```typescript fence."

Also export: `buildRetryPrompt(task: TaskSpec, prevSource: string, errors: string[], score: ScoreBreakdown): string`
This sends: the previous code, what went wrong (errors + score breakdown), and asks for a corrected version.

Run `npm run typecheck`. Commit. Push.
```

---

## Step 4: Runner + CLI Wiring

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Pull latest from origin first.

Read these files:
- src/eval/types.ts (TaskSpec, EvalResult, EvalEvent, ModelConfig)
- src/eval/model-adapter.ts (createModelAdapter, extractCode)
- src/eval/scorer.ts (scoreEval)
- src/eval/prompts.ts (buildSystemPrompt, buildRetryPrompt)
- src/cli/index.ts (existing CLI — you'll add "eval" command here)
- src/cli/source-loader.ts (how models are loaded)
- src/api/runtime.ts (evaluateModel function)
- src/engine/manifold-backend.ts (initManifold)
- scripts/vibe-snap.mjs (screenshot tool — called via child_process)

TASK A: Create `src/eval/runner.ts` (~200 LOC)

Export: `runEval(task: TaskSpec, config: ModelConfig): Promise<EvalResult>`

The loop:
1. Create run_id (crypto.randomUUID()), start timer, init NDJSON log file
2. Log "run.started" event
3. Build prompt via buildSystemPrompt(task)
4. Call model adapter with prompt (+ reference images if task has them and model supports vision)
5. Extract code via extractCode(response)
6. Log "build.code_generated" event
7. Write code to eval-scratch/{task.id}/{run_id}.forge.ts (mkdir -p)
8. Init Manifold, then call evaluateModel(code) from src/api/runtime.ts
9. Log "eval.completed" with success/error/warning counts
10. Score via scoreEval(task, result.evaluation, code)
11. Log "score.computed"
12. If score.total >= task.pass_threshold and no errors → pass. Log "decide.action" { action: "pass" }
13. If score.total < threshold AND iteration < task.max_iterations:
    - Build retry prompt with errors + score
    - Log "build.retry"
    - Go to step 4
14. If max iterations reached → fail. Log "decide.action" { action: "fail" }
15. Log "run.completed" with final summary
16. Return EvalResult

For screenshots: after successful eval (step 9, no errors), try to run:
  `node scripts/vibe-snap.mjs <forge-file> --angles 4 --quiet`
via child_process.execSync. Wrap in try/catch — screenshots are optional (dev server
might not be running). Log "eval.screenshots" with paths if successful.

NDJSON logging: write to eval-logs/{task.id}/{timestamp}.ndjson
Use appendFileSync — one JSON line per event. Create dirs with mkdirSync recursive.

Export also: `loadTaskFile(path: string): TaskSpec` that reads a .yaml file and calls parseTaskSpec.

TASK B: Add `eval` command to `src/cli/index.ts`

Add a new case in the switch:
```
case "eval":
  await cmdEval(args);
  break;
```

The cmdEval function:
- Parse args: first positional is task file or directory, --model <url> flag (default "ollama://llama3.2")
- If path is a directory, glob for *.yaml files in it
- For each task file: loadTaskFile, runEval, print result summary
- Summary format:
  ```
  [eval] box-with-hole  PASS  score=82  iterations=2  tokens=1,847  time=4.2s
  [eval] dice           FAIL  score=45  iterations=3  tokens=3,201  time=8.1s  reason: volume out of range
  ```
- Exit code 0 if all pass, 1 if any fail

Update printUsage() to include the eval command.

Run `npm run typecheck`. Commit. Push.
```

---

## Step 5: All 5 Benchmark YAML Files

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Pull latest from origin first.

Read these files:
- docs/agent-eval-loop.md section 2 (benchmark task specs)
- src/eval/types.ts (TaskSpec, AcceptanceCriteria — to verify YAML matches the types)
- tasks/benchmark/box-with-hole.yaml (if it exists from Step 1 — use as template)
- projects/parametric-bracket/parametric-bracket.forge.ts (reference for bracket task)
- projects/dice/dice.forge.ts (reference for dice task)
- projects/phone-stand/phone-stand.forge.ts (reference for phone-stand task)
- projects/battery-cover/battery-cover.forge.ts (reference for battery-cover task)

TASK: Create (or verify) all 5 benchmark YAML files in tasks/benchmark/.

For each task, look at the corresponding project's .forge.ts to calibrate the
acceptance criteria (volume ranges, body counts, etc.). Run `cadlad run --json`
on each project to get actual stats if possible. The acceptance ranges should be
loose enough that a different valid design would pass, but tight enough to catch
garbage output.

1. tasks/benchmark/box-with-hole.yaml (may exist — verify or fix)
2. tasks/benchmark/parametric-bracket.yaml
3. tasks/benchmark/dice.yaml
4. tasks/benchmark/phone-stand.yaml
5. tasks/benchmark/battery-cover.yaml

Each YAML file should have this structure:
```yaml
id: <kebab-case>
difficulty: <1-5>
description: |
  <2-4 sentences describing what to build, with specific dimensions>
acceptance:
  body_count: <number>          # or body_count_min for assemblies
  volume_min: <number>          # mm³ — set ~20% below reference model
  volume_max: <number>          # mm³ — set ~50% above reference model
  validation_errors: 0
  # ... task-specific criteria
api_surface:
  - <method1>
  - <method2>
max_iterations: <3-10, higher for harder tasks>
pass_threshold: 70
```

Make the descriptions self-contained — an LLM reading only the description should be
able to build the model without seeing any reference code. Include specific dimensions
(mm), angles (degrees), and spatial relationships.

Do NOT include reference_images yet (we'll capture those later).

Run `npm run typecheck` (just to make sure nothing's broken). Commit. Push.
```

---

## Step 6: Eval Report Aggregation

```
You are working on the CadLad project (code-first parametric 3D CAD in TypeScript).
Branch: claude/agent-evaluation-loop-GXddC

Pull latest from origin first.

Read these files:
- src/eval/types.ts (EvalResult, EvalEvent, ScoreBreakdown, TaskSpec)
- src/eval/runner.ts (understand NDJSON log format — where files are written,
  the event types logged, and the "run.completed" / "run.started" event shapes)
- src/cli/index.ts (existing CLI switch — you'll add "eval-report" command)
- docs/agent-eval-loop.md section 3 "Aggregation Reports" (summary/issues/deadweight specs)

TASK A: Create `src/eval/report.ts` (~180 LOC)

This module reads NDJSON log files from eval-logs/ and produces three report types.

1. Export `aggregateLogs(logDir: string): AggregatedReport`

   AggregatedReport type (define in this file or add to types.ts):
   ```typescript
   interface TaskSummary {
     task_id: string;
     runs: number;
     pass_rate: number;          // 0.0 - 1.0
     avg_score: number;
     avg_iterations: number;
     avg_tokens: number;
     avg_duration_ms: number;
     by_model: Record<string, {  // keyed by model URL
       runs: number;
       pass_rate: number;
       avg_score: number;
       avg_iterations: number;
       avg_tokens: number;
     }>;
   }

   interface AggregatedReport {
     generated_at: string;       // ISO timestamp
     total_runs: number;
     overall_pass_rate: number;
     tasks: TaskSummary[];
     models: string[];           // unique model URLs seen
   }
   ```

   Implementation:
   - Recursively glob eval-logs/**/*.ndjson
   - For each file, read lines, parse JSON, find the "run.completed" event
   - The "run.completed" event data has: { model, pass, final_score, iterations,
     total_tokens, duration_ms, task_id }
   - Also read "run.started" for the model field if run.completed doesn't have it
   - Group by task_id, then by model within each task
   - Compute averages and pass rates

2. Export `generateIssuesReport(report: AggregatedReport): IssueReport`

   ```typescript
   interface EvalIssue {
     task_id: string;
     severity: "critical" | "warning";
     issue: string;
     detail: string;
   }
   interface IssueReport {
     issues: EvalIssue[];
   }
   ```

   Flag these patterns:
   - "critical": task pass_rate === 0 across all models (task may be impossible or prompt is bad)
   - "critical": task pass_rate === 0 for a specific model that passes other tasks (model-specific gap)
   - "warning": task avg_iterations === max_iterations (tasks are timing out, prompt may need work)
   - "warning": task avg_score < 50 even when passing (barely passing — fragile)

3. Export `generateDeadweightReport(logDir: string, tasksDir: string): DeadweightReport`

   ```typescript
   interface DeadweightEntry {
     api_method: string;
     referenced_in_tasks: string[];   // task IDs that list it in api_surface
     success_rate: number;            // how often code using this method passes
     issue: string;
   }
   interface DeadweightReport {
     entries: DeadweightEntry[];
   }
   ```

   Implementation:
   - Load all task YAML files from tasksDir to get api_surface lists
   - For each NDJSON log, find "build.code_generated" events (which have source_hash
     and the code is in eval-scratch/) and "run.completed" events
   - For each api_surface method, check if it appears in the generated code (read
     from eval-scratch if available, or just check "score.computed" events which
     should include the api_surface score breakdown)
   - Flag methods with < 30% success rate as deadweight
   - Flag methods that appear in api_surface but are never found in generated code

TASK B: Add `eval-report` command to `src/cli/index.ts`

Add a new case in the switch:
```
case "eval-report":
  await cmdEvalReport(args);
  break;
```

The cmdEvalReport function parses these flags:
- No flags: print summary table to stdout
- `--task <task-id>`: filter to one task's history
- `--compare`: print model-vs-model comparison table
- `--issues`: print issues report
- `--deadweight`: print deadweight report
- `--json`: output as JSON instead of formatted text

Default summary output format (markdown table to stdout):
```
## Eval Summary (42 runs, 2025-04-05)

| Task              | Runs | Pass Rate | Avg Score | Avg Iters | Avg Tokens |
|-------------------|------|-----------|-----------|-----------|------------|
| box-with-hole     |   12 |    83%    |    78.2   |    1.8    |    1,204   |
| parametric-bracket|    8 |    62%    |    65.1   |    3.2    |    2,847   |
| dice              |   10 |    40%    |    52.3   |    4.1    |    3,102   |
| phone-stand       |    6 |    17%    |    38.7   |    6.8    |    5,420   |
| battery-cover     |    6 |     0%    |    22.1   |   10.0    |    8,905   |
```

--compare format:
```
## Model Comparison

| Task              | ollama://llama3.2 | ollama://qwen3:8b | anthropic://claude-sonnet-4-6 |
|-------------------|----|----|----|
| box-with-hole     | 75% (1.9 iter)    | 83% (1.5 iter)    | 100% (1.0 iter)               |
| parametric-bracket| 50% (3.5 iter)    | 62% (2.8 iter)    | 88% (1.2 iter)                |
```

--issues format: bullet list with severity emoji (X for critical, ! for warning)
--deadweight format: simple table of method | tasks | success rate | issue

Update printUsage() to include eval-report and its flags.

Run `npm run typecheck`. Commit. Push.
```

---

## Next Steps (not written yet)

- Step 7: LLM-as-Judge (`src/eval/judge.ts`)
- Step 8: Multi-model batch + parallel runs
- Step 9: Ad-hoc tasks (`cadlad eval --task "..."`)
- Step 10: CI integration (`scripts/ci-eval.sh`)
