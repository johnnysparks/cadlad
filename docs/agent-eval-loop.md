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

## 2. First 5 Benchmark Tasks

These are ordered by difficulty and exercise different API surfaces.

### Task 1: "Simple Box with Hole"
```yaml
id: box-with-hole
difficulty: 1
description: |
  A 40×30×20mm box with a 10mm diameter through-hole centered on the top face.
acceptance:
  - body_count: 1
  - volume_min: 20000    # mm³ (box minus hole)
  - volume_max: 24000
  - validation_errors: 0
  - has_subtraction: true
api_surface: [box, cylinder, subtract, translate]
reference_images: [box-with-hole-iso.png]
max_iterations: 3
```

### Task 2: "Parametric Bracket"
```yaml
id: parametric-bracket
difficulty: 2
description: |
  An L-shaped mounting bracket. 60mm tall arm, 40mm base arm, 5mm wall
  thickness, 8mm mounting holes in each arm. Use param() for wall thickness.
acceptance:
  - body_count: 1
  - has_params: [wall_thickness]
  - volume_min: 15000
  - volume_max: 25000
  - validation_errors: 0
api_surface: [sketch, lShape, extrude, cylinder, subtract, param]
reference_images: [bracket-iso.png, bracket-front.png]
max_iterations: 5
```

### Task 3: "Dice"
```yaml
id: dice
difficulty: 2
description: |
  A 16mm rounded cube with standard pip positions (opposite faces sum to 7).
  Each pip is a 2.5mm hemisphere subtracted from the face.
acceptance:
  - body_count: 1
  - validation_errors: 0
  - bbox_max: [18, 18, 18]  # rounding adds a bit
  - volume_min: 3500
api_surface: [roundedBox, sphere, subtract, translate]
reference_images: [dice-iso.png, dice-top.png, dice-front.png]
max_iterations: 5
```

### Task 4: "Phone Stand"
```yaml
id: phone-stand
difficulty: 3
description: |
  A desk phone stand. ~10° viewing angle, holds phone upright with a lip
  at the bottom. Cable routing slot in the back. Base should be stable
  (wide footprint relative to height).
acceptance:
  - body_count: 1
  - validation_errors: 0
  - printability: {max_overhang_ratio: 0.4}
  - volume_min: 20000
  - has_slot_or_channel: true
api_surface: [sketch, extrude, subtract, draft, fillet]
reference_images: [phone-stand-iso.png, phone-stand-side.png]
max_iterations: 8
```

### Task 5: "Multi-Part Assembly"
```yaml
id: battery-cover
difficulty: 4
description: |
  A battery compartment with snap-fit cover. Main body is a hollow box
  (shell), cover has flex tabs that snap into slots on the body.
  Two parts, clearance between them.
acceptance:
  - body_count_min: 2
  - assembly: true
  - constraint_clearance: {min_mm: 0.3, max_mm: 0.8}
  - validation_errors: 0
api_surface: [assembly, shell, sketch, extrude, subtract, constraint]
reference_images: [battery-iso.png, battery-exploded.png]
max_iterations: 10
```

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

**Day 10: Ad-hoc tasks + CI integration**
- [ ] `cadlad eval --task "description"` generates a TaskSpec on the fly
- [ ] `scripts/ci-eval.sh` — run benchmarks in CI, fail on regression
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
// http://host:port/model  → custom OpenAI-compatible endpoint
```
