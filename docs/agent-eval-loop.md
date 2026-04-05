# Agent Evaluation Loop — Design Doc

> Minimum viable architecture for a local-first, model-agnostic agent evaluation loop.
> Target: M4 Max (64 GB), any LLM via HTTP or local inference.

---

## 1. Minimum Viable Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        cadlad eval                              │
│                     (single CLI command)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  PLAN    │───▶│  BUILD   │───▶│  EVAL    │───▶│ DECIDE   │  │
│  │          │    │          │    │          │    │          │  │
│  │ task +   │    │ generate │    │ run +    │    │ pass?    │  │
│  │ ref imgs │    │ .forge.ts│    │ validate │    │ retry?   │  │
│  │ → prompt │    │ code     │    │ + snap   │    │ report   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │               │        │
│       └───────────────┴───────────────┴───────────────┘        │
│                    event log (NDJSON)                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Model Backend (swappable)                                      │
│  ┌─────────────┬───────────────┬─────────────────────────┐     │
│  │ ollama://   │ openai://     │ anthropic://             │     │
│  │ llama3.2    │ gpt-4o-mini   │ claude-sonnet-4-6       │     │
│  │ qwen3       │ o4-mini       │ claude-opus-4-6         │     │
│  └─────────────┴───────────────┴─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Core Principle: Thin Orchestrator, Fat Existing Tools

The eval loop is **not** a framework. It's ~400 lines of orchestration that calls:

| Step | Existing Tool | What's New |
|------|---------------|------------|
| Parse task | — | Task spec YAML (10 fields) |
| Generate code | LLM API | Model adapter (~50 LOC per backend) |
| Evaluate | `cadlad run --json` | Nothing — already returns structured bundle |
| Screenshot | `scripts/vibe-snap.mjs` | Nothing — already captures multi-angle PNGs |
| Score | validation pipeline | Scoring rubric (geometry + visual + constraint checks) |
| Decide | LLM API (optional) | Judge prompt (~20 lines) OR deterministic pass/fail |
| Log | event store | NDJSON append (one file per run) |

**What we DON'T build**: prompt routers, agent memory systems, RAG, tool-use frameworks, custom inference servers. The LLM is a function: `(prompt: string, images?: Buffer[]) => string`.

### Components

```
src/eval/
  types.ts          # TaskSpec, EvalResult, RunLog, ScoringRubric (~80 LOC)
  runner.ts         # Main loop: plan → build → eval → decide (~200 LOC)
  model-adapter.ts  # LLM interface + ollama/openai/anthropic backends (~150 LOC)
  scorer.ts         # Deterministic scoring from EvaluationBundle (~100 LOC)
  judge.ts          # Optional LLM-as-judge for visual/subjective eval (~60 LOC)
tasks/
  benchmark/        # YAML task specs + reference images
```

**Total new code: ~600 LOC.** Everything else already exists.

---

## 2. Benchmark Tasks (Current, Executable Set)

The biggest testability offender in the old version of this doc was a fully stubbed task list:
- It referenced screenshot assets that are not committed anywhere (`reference_images: [...]`).
- It used acceptance fields that don't match the current parser/scorer behavior.
- It described benchmark geometry that diverged from the actual YAML files the CLI runs.

This section now points to the real task specs in `tasks/benchmark/*.yaml`, which are the source of truth used by `cadlad eval`.

### Canonical benchmark task files

1. `tasks/benchmark/box-with-hole.yaml`
2. `tasks/benchmark/parametric-bracket.yaml`
3. `tasks/benchmark/dice.yaml`
4. `tasks/benchmark/phone-stand.yaml`
5. `tasks/benchmark/battery-cover.yaml`

### Why this matters for testability

- You can run these tasks directly with no doc-to-code translation.
- Each task has concrete, parser-compatible acceptance criteria.
- No hidden/stubbed image dependencies are required for baseline deterministic scoring.

If/when reference images are added later, they should be checked into the repo with relative paths stored in each task YAML, and validated in CI.

---

## 3. Event/Log Schema

One NDJSON file per eval run: `eval-logs/{task-id}/{timestamp}.ndjson`

```typescript
// Every line in the NDJSON file is one of these:
interface EvalEvent {
  ts: number;              // Unix ms
  run_id: string;          // UUID for this eval run
  task_id: string;         // e.g. "box-with-hole"
  event: EventType;
  data: Record<string, unknown>;
}

type EventType =
  | "run.started"          // { model, task_id, config }
  | "plan.prompt_sent"     // { prompt_tokens, has_reference_images }
  | "plan.response"        // { response_tokens, duration_ms }
  | "build.code_generated" // { source_hash, line_count, iteration }
  | "eval.completed"       // { success, errors, warnings, stats }
  | "eval.screenshots"     // { paths: string[], angles: string[] }
  | "score.computed"       // { total, geometry, constraints, visual }
  | "judge.prompt_sent"    // { prompt_tokens, image_count } (optional)
  | "judge.verdict"        // { pass, feedback, score } (optional)
  | "decide.action"        // { action: "pass"|"retry"|"fail", reason }
  | "build.retry"          // { iteration, feedback_summary }
  | "run.completed"        // { final_score, iterations, total_tokens, duration_ms, pass }
  | "error"                // { stage, message, stack? }

// Aggregated per-run summary (written as last line):
interface RunSummary {
  ts: number;
  run_id: string;
  task_id: string;
  event: "run.summary";
  data: {
    model: string;
    pass: boolean;
    score: number;           // 0-100
    iterations: number;
    total_tokens: number;
    total_duration_ms: number;
    eval_bundle: object;     // Final EvaluationBundle from cadlad run
    failure_reason?: string;
  };
}
```

### Aggregation Reports (auto-generated after batch runs)

```
eval-logs/
  {task-id}/
    {timestamp}.ndjson        # Individual run log
  reports/
    {batch-id}.summary.json   # Cross-task summary
    {batch-id}.issues.json    # Auto-detected issues
    {batch-id}.deadweight.json # API surface never used / always failing
```

**summary.json**: Pass rates per task, per model. Token costs. Avg iterations.
**issues.json**: Tasks that always fail → likely missing API or bad prompt. Tasks that regress → likely code change broke something.
**deadweight.json**: API methods referenced in tasks but never successfully used. Prompt patterns that consistently produce bad code.

---

## 4. One-Command CLI Flow

```bash
# Run one task with default model (ollama://llama3.2)
cadlad eval tasks/benchmark/box-with-hole.yaml

# Run one task with a specific model
cadlad eval tasks/benchmark/box-with-hole.yaml --model ollama://qwen3:8b

# Run all benchmarks
cadlad eval tasks/benchmark/ --model anthropic://claude-sonnet-4-6

# Run all benchmarks across multiple models (comparison)
cadlad eval tasks/benchmark/ \
  --model ollama://llama3.2 \
  --model ollama://qwen3:8b \
  --model openai://gpt-4o-mini

# Custom task from a description (no YAML needed)
cadlad eval --task "A coffee mug with handle" --model ollama://llama3.2

# Show last results
cadlad eval-report                           # latest batch
cadlad eval-report --task box-with-hole      # one task history
cadlad eval-report --compare                 # model-vs-model table

# Generate issue/roadmap from failures
cadlad eval-report --issues     # what's broken in CadLad's API
cadlad eval-report --deadweight # what's unused or always-failing
```

### Under the Hood

```bash
cadlad eval tasks/benchmark/box-with-hole.yaml --model ollama://qwen3:8b
```

Does exactly this:

1. **Parse** `box-with-hole.yaml` → TaskSpec
2. **Prompt** the model with: system prompt (API reference, coordinate system, constraints) + task description + reference images (if vision model)
3. **Receive** `.forge.ts` code from model response (extract from markdown fence)
4. **Write** to `eval-scratch/{task-id}/{run-id}.forge.ts`
5. **Run** `cadlad run --json eval-scratch/{task-id}/{run-id}.forge.ts`
6. **Screenshot** `node scripts/vibe-snap.mjs eval-scratch/...forge.ts --angles 4 --quiet`
7. **Score** deterministically from the EvaluationBundle vs acceptance criteria
8. **If score < threshold and iterations < max**: feed errors + screenshots back to model → goto 3
9. **Log** every step to `eval-logs/{task-id}/{timestamp}.ndjson`
10. **Print** pass/fail + score + iteration count + token usage

### Environment Requirements

```bash
# Required (already in project)
node >= 18
npm run dev  # dev server must be running for screenshots

# Model backends (pick one+)
ollama serve                          # local models
OPENAI_API_KEY=...                    # OpenAI models
ANTHROPIC_API_KEY=...                 # Anthropic models
```

No other dependencies. The model adapter uses `fetch()` directly — no SDK imports.

### CI + OpenAI Codex Cloud Validation Path (practical target)

To make this loop actually usable in CI and in OpenAI Codex cloud code-generation sessions, we should treat execution profiles as a first-class part of `cadlad eval`:

- **local-interactive**: current behavior (`npm run dev` running, full screenshot path).
- **ci-headless**: deterministic checks only, no requirement for a long-lived local dev server.
- **codex-cloud**: same as `ci-headless`, with model selection wired to OpenAI env defaults.

#### Proposed flags

```bash
cadlad eval tasks/benchmark/ --profile local-interactive
cadlad eval tasks/benchmark/ --profile ci-headless
cadlad eval tasks/benchmark/ --profile codex-cloud
```

Profile behavior:

- `local-interactive`
  - Runs deterministic scoring + screenshot capture.
  - Uses existing `scripts/vibe-snap.mjs`.
- `ci-headless`
  - Runs deterministic scoring only by default.
  - Optional screenshots behind explicit opt-in (`--with-screenshots`) so CI failures are not dominated by browser/runtime setup.
- `codex-cloud`
  - Mirrors `ci-headless` defaults.
  - Resolves model from OpenAI-centric env with zero local setup.
  - Designed for "generate code in Codex session, then immediately evaluate" workflows.

#### Baseline acceptance for cloud/CI

For `ci-headless` and `codex-cloud`, a run is valid when:

1. Task YAML parses.
2. Model returns extractable `.forge.ts`.
3. `cadlad run --json` succeeds.
4. Deterministic scorer emits a numeric score and pass/fail.
5. NDJSON log + batch report files are written.

This gives us a stable, non-visual gate that can run in GitHub Actions and ephemeral cloud coding environments.

#### Example CI command

```bash
# Deterministic benchmark gate (no browser dependency)
cadlad eval tasks/benchmark/ \
  --profile ci-headless \
  --model openai://gpt-4o-mini \
  --max-iterations 2 \
  --no-judge
```

#### Example Codex cloud command

```bash
# Use OpenAI context-loop resolution + deterministic scoring
cadlad eval tasks/benchmark/ \
  --profile codex-cloud \
  --model openai://context-loop \
  --max-iterations 2 \
  --no-judge
```

This is the fastest path to "works in local dev, CI, and OpenAI-hosted codegen sessions" without adding new infra.

---

## 5. Two-Week Implementation Plan

### Week 1: Core Loop (ship a working `cadlad eval` by Friday)

**Day 1-2: Types + Model Adapter**
- [ ] `src/eval/types.ts` — TaskSpec, EvalResult, RunLog, ScoringRubric, ModelConfig
- [ ] `src/eval/model-adapter.ts` — `generate(prompt, images?) → string`
  - Ollama backend (localhost:11434, `/api/generate`)
  - Anthropic backend (`/v1/messages`, vision support)
  - OpenAI backend (`/v1/chat/completions`, vision support)
- [ ] Test: can call ollama://llama3.2 and get a `.forge.ts` back

**Day 3: Scorer + Prompt**
- [ ] `src/eval/scorer.ts` — score an EvaluationBundle against acceptance criteria
  - Geometry score (volume in range, body count, bbox bounds)
  - Constraint score (validation errors = 0, warnings low)
  - API surface score (did it actually use the required primitives?)
- [ ] `src/eval/prompts.ts` — system prompt builder (API ref subset, coord system, constraints)
- [ ] First benchmark YAML: `tasks/benchmark/box-with-hole.yaml`

**Day 4: Runner (the loop)**
- [ ] `src/eval/runner.ts` — orchestrate: prompt → generate → write → run → snap → score → retry
- [ ] Wire into CLI: `cadlad eval <task.yaml> --model <url>`
- [ ] NDJSON logging to `eval-logs/`

**Day 5: Second benchmark + polish**
- [ ] Add remaining 4 benchmark YAMLs with reference images
- [ ] `cadlad eval tasks/benchmark/` runs all 5
- [ ] Fix whatever broke on real models

### Week 2: Reports + Judge + Batch

**Day 6-7: Eval Report**
- [ ] `src/eval/report.ts` — aggregate NDJSON logs into summary/issues/deadweight
- [ ] `cadlad eval-report` CLI command
- [ ] `cadlad eval-report --compare` — model-vs-model markdown table

**Day 8: LLM-as-Judge (optional visual eval)**
- [ ] `src/eval/judge.ts` — send screenshots + task description to a vision model
  - "Does this look like {description}? Score 1-5. What's wrong?"
- [ ] Integrate judge score into overall scoring (weighted: 60% deterministic, 40% judge)
- [ ] Can be skipped (`--no-judge`) for non-vision models or speed

**Day 9: Multi-model batch + parallelism**
- [ ] `--model` flag accepts multiple values
- [ ] Run tasks in parallel per model (respect ollama's single-inference limit)
- [ ] Auto-generate comparison report after batch completes

**Day 10: Ad-hoc tasks + CI/Codex integration**
- [ ] `cadlad eval --task "description"` generates a TaskSpec on the fly
- [ ] `scripts/ci-eval.sh` — run `--profile ci-headless`, fail on regression
- [ ] `scripts/codex-eval.sh` — run `--profile codex-cloud` with `openai://context-loop`
- [ ] Write reference images for all 5 benchmarks

---

## 6. What NOT to Build Yet

| Temptation | Why Not | When |
|---|---|---|
| **Prompt optimization / DSPy-style tuning** | Get baseline numbers first. You can't optimize what you haven't measured. | After 50+ eval runs show consistent patterns |
| **Agent memory / RAG** | The eval loop is stateless on purpose — each run is independent and comparable. Memory makes runs non-reproducible. | After the loop proves which tasks need multi-turn |
| **Custom inference server** | Ollama + API keys cover every model you'd run on M4 Max. No value in wrapping them. | Never (unless you need batching at scale) |
| **Visual diff / perceptual hashing** | Screenshots are for human review and LLM-as-judge. Pixel diff is noisy for 3D renders (lighting, anti-aliasing). | After you have a real regression signal |
| **Tool-use / function-calling** | The model writes code, not tool calls. CadLad's API IS the tool interface. Adding MCP/function-calling to the eval loop adds complexity with no benefit for code generation tasks. | If you add interactive modeling tasks |
| **Web dashboard** | NDJSON + `cadlad eval-report` is enough. A dashboard is a separate project. | After you have 100+ runs and need filtering |
| **Multi-turn conversations** | Single-turn with retry is simpler, more reproducible, and easier to score. Multi-turn adds state management and makes comparison across models harder. | After single-turn ceiling is established |
| **Fine-tuning pipeline** | You need eval data before you can fine-tune. The eval loop generates that data. | After 200+ passing examples |
| **Prompt caching / KV cache management** | Premature optimization. Token costs are dominated by screenshots anyway. | After you see actual cost numbers |

### The One Rule

> If it doesn't directly help answer "did the model produce a valid .forge.ts for this task?", don't build it yet.

---

## Appendix A: System Prompt Template (for generated models)

```
You are a 3D CAD modeling assistant. Generate CadLad .forge.ts code.

COORDINATE SYSTEM: Z-up. Ground plane is Z=0. Build upward.
RETURN: A single .forge.ts file that returns a Solid, Assembly, or { model, camera }.

API REFERENCE (subset):
{auto-generated from task's api_surface field}

TASK:
{task.description}

ACCEPTANCE CRITERIA:
{task.acceptance as bullet points}

RULES:
- Use param() for dimensions that should be adjustable
- Always oversize boolean cutters by 1-2mm
- Use assembly() when parts need different colors
- Return the model — don't just define it

Output ONLY the .forge.ts code in a ```typescript fence.
```

~300 tokens. Fits in any context window.

## Appendix B: Scoring Formula

```
total = geometry_score * 0.4 + constraint_score * 0.3 + api_score * 0.2 + judge_score * 0.1

geometry_score (0-100):
  - volume in range: 40 pts
  - body count correct: 20 pts
  - bbox within bounds: 20 pts
  - no degenerate geometry: 20 pts

constraint_score (0-100):
  - 0 validation errors: 60 pts
  - 0 validation warnings: 20 pts
  - declared constraints pass: 20 pts

api_score (0-100):
  - each required API method present in source: 100/N pts each

judge_score (0-100):  [optional, 0 if skipped → weight redistributed]
  - LLM vision rating 1-5 mapped to 0-100
```

Pass threshold: **70/100** (configurable per task).

## Appendix C: Model Adapter Interface

```typescript
interface ModelAdapter {
  generate(request: {
    prompt: string;
    images?: Buffer[];       // reference images (vision models)
    temperature?: number;    // default 0.3
    max_tokens?: number;     // default 4096
  }): Promise<{
    text: string;
    prompt_tokens: number;
    completion_tokens: number;
    duration_ms: number;
  }>;
}

// URL scheme determines backend:
// ollama://model-name     → localhost:11434
// openai://model-name     → api.openai.com (needs OPENAI_API_KEY)
// anthropic://model-name  → api.anthropic.com (needs ANTHROPIC_API_KEY)
// context-loop            → infer active OpenAI/Anthropic "current model" from env (Codex/Claude CLI-friendly)
// openai://context-loop   → force OpenAI context loop resolution from env
// anthropic://context-loop → force Anthropic context loop resolution from env
// http://host:port/model  → custom OpenAI-compatible endpoint
// lmstudio://model-name   → localhost:1234 (OpenAI-compatible, no API key)
```
