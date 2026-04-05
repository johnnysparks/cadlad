# CadLad Vision: A Semantic, Learnable, Code-Native CAD System

_Status: reference doc / design compass_

This document is a filter for future feature work.

When a new capability is proposed, the question is not just:

- Can we make this work?

The better questions are:

- Does this make CadLad more semantic?
- Does this make CadLad more learnable?
- Does this preserve code-native authoring instead of fighting it?
- Does this move domain knowledge into the system instead of leaving it in tribal memory, prompts, or docs?

CadLad already has important pieces of this direction: a code-first `.forge.ts` authoring loop, structured evaluation bundles, sketch constraints, assemblies, validation, agent-facing tooling, revisions/branches in the worker, and an explicit roadmap toward semantic MCP tools, agent memory, agent learning, and design intent / manufacturing. This document tries to turn that momentum into a durable architectural point of view.

---

## The short version

CadLad should become a system where:

- **TypeScript is the authoring surface**
- **semantic feature/state models are the operational truth**
- **geometry, validation, stats, and artifacts are derived projections**
- **learning happens over revisions, failures, approvals, constraints, and reuse**
- **human UX is mostly for review, comparison, and approval**

In plain English:

CadLad should not just generate shapes from code. It should understand what those shapes _mean_, why they were modeled that way, what rules they are supposed to satisfy, and how to help agents and humans make better next moves.

---

## Why this matters

### 1. Raw code is too low-level for robust automation

If every modeling action is "write or rewrite source text," agents have to reason at the wrong level of abstraction.

That causes predictable failure modes:

- accidental breakage of nearby logic
- brittle patches
- inconsistent modeling style
- shallow reuse
- poor explainability
- weak mergeability

A semantic system gives the agent a safer language of action:

- add feature
- modify parameter
- mirror around datum
- create mounting pattern
- apply manufacturing profile
- repair thin wall violation

That is a much better place to operate than raw string editing.

### 2. Geometry without semantics is a dead end for learning

If CadLad only stores source and final solids, it can answer:

- what code was written
- what mesh/solid came out

But it cannot answer richer questions like:

- which faces belong to the mounting interface?
- which hole set is a repeated feature?
- which sketch constraints define intent versus incidental geometry?
- which manufacturing rules were expected to hold?
- what change caused the design to become fragile under a param sweep?

Learnability depends on structured meaning, not just outputs.

### 3. The system should encode domain knowledge

The more manufacturing, assembly, and modeling knowledge lives in prompts, conventions, or long docs, the less reliable the system becomes.

The stronger version is:

- domain rules live in types
- domain checks live in validators
- domain defaults live in profiles
- domain suggestions live in semantic fixers
- domain memory lives in events and approved revisions

That is how CadLad gets smarter without becoming mystical.

### 4. Code-native is a feature, not a compromise

CadLad should not abandon TypeScript in order to become more semantic.

The goal is not to replace code with a hidden graph editor. The goal is to let code remain the authored surface while the system maintains richer internal structure underneath it.

That gives us:

- human-readable source
- git interoperability
- easy escape hatches
- strong testability
- semantic edit tools
- structured learning loops

This is the useful balance.

---

## What we mean by “semantic”

In this context, **semantic** means the system knows more than raw geometry.

It knows things like:

- this sketch line is a centerline, not just a segment
- these four holes are a bolt pattern, not just circles subtracted from a plate
- this face is a mating face
- this body is a printable bracket, not just a boolean result
- this clearance constraint matters because of assembly fit
- this profile is intended for FDM printing with a 0.4 mm nozzle
- this model failed because the rib goes under minimum thickness at one parameter extreme

Semantics are not ornament. They are the structure that makes:

- better validation
- safer editing
- retrieval
- agent reasoning
- manufacturing awareness
- future learning

possible.

---

## What we mean by “learnable”

A learnable CadLad is not just "LLM-friendly."

It is a system that can accumulate useful signal from:

- revisions
- branches
- capability gaps
- workarounds
- approved vs rejected outcomes
- repeated feature usage
- constraint violations
- repair patterns
- parameter sweep failures
- manufacturing check failures

A learnable system makes it possible to build:

- retrieval over prior designs and feature patterns
- next-step suggestions
- robust fix recommendations
- model quality corpora
- domain-specific copilots
- eventually, semantic generation and repair

If the system cannot capture the right intermediate structure, learning will stay shallow.

---

## What we mean by “code-native”

Code-native means:

- `.forge.ts` remains a first-class, authored artifact
- humans and agents can still inspect, diff, review, and patch source
- the runtime can materialize source from semantic operations
- the platform does not trap meaning in opaque internal state only

This is not “source only.”

It is:

- **semantic operations internally**
- **source snapshots externally**
- **revisions and artifacts around them**

The ideal balance is:

- source for authorship and inspection
- semantic models for operations and reasoning
- events/revisions for history and learning
- geometry/artifacts for validation and review

---

## The north star in one sentence

CadLad should be a **revisioned geometric programming system** where semantic operations are primary, source is materialized and inspectable, and geometry/evaluation are fast derived projections.

---

## Design principles

### 1. Semantics over raw text

Prefer APIs and tools that express intent over APIs and tools that force source surgery.

Good:

- `addFeature(...)`
- `setParam(...)`
- `applyProfile(...)`
- `addMate(...)`
- `repairConstraintViolation(...)`

Weak:

- opaque text mutation as the default authoring primitive

### 2. Fast structured feedback over screenshot dependence

The system should answer most modeling questions through:

- type checks
- semantic validation
- geometry validation
- stats/queries
- targeted renders when needed

Renders matter, but they should not be the only truth loop.

### 3. Domain knowledge belongs in the platform

If a repeated rule matters, encode it.

Examples:

- minimum wall thickness
- clearance expectations
- overhang limits
- mold draft rules
- hole spacing norms
- datums and symmetry conventions

### 4. Source is authored truth at checkpoints, not the only truth in motion

The system should support semantic events and materialized source snapshots.

This makes room for:

- richer edit tools
- safer merges later
- better analytics
- better agent self-protection

### 5. Do not over-specify the future too early

We want direction, not premature dogma.

A semantic system should start from useful, boring building blocks and expand when real tools and validators need them.

---

## The semantic layers that matter

The easiest mistake is to talk about “semantics” as one giant blob. It is more useful to separate the kinds of semantics CadLad should care about.

### A. Authoring semantics

What the modeler was trying to express.

Examples:

- this is a bracket
- this is a mounting pattern
- this is a center datum
- this cut creates cable clearance
- this wall is intentionally thin for flex
- this rib exists for stiffness

Why it matters:

- better explanations
- better agent edits
- less accidental breakage
- richer approval/review

Loose TypeScript shape:

```ts
interface IntentTag {
  kind:
    | "mounting"
    | "alignment"
    | "clearance"
    | "stiffness"
    | "printability"
    | "appearance"
    | "service_access";
  note?: string;
  priority?: "hard" | "soft";
}
```

### B. Sketch semantics

Not just curves. Relationships.

Examples:

- construction line
- centerline
- symmetry axis
- driving dimension
- reference geometry vs production geometry
- bolt circle
- slot profile
- keepout profile

Why it matters:

- robust parametric behavior
- auto-constraint
- sketch completion
- better downstream feature reasoning

Loose TypeScript shape:

```ts
interface SketchSemanticNode {
  id: string;
  kind: "point" | "line" | "arc" | "circle" | "profile" | "axis";
  role?: "construction" | "driving" | "reference" | "production";
  tags?: string[];
}

interface SketchSemanticConstraint {
  id: string;
  kind:
    | "coincident"
    | "parallel"
    | "perpendicular"
    | "tangent"
    | "equal"
    | "symmetric"
    | "distance"
    | "angle";
  entities: string[];
  strength?: "hard" | "soft";
}
```

### C. Feature semantics

Features are more than just operations. They are reusable units of intent.

Examples:

- boss
- rib
- shell
- fillet
- mounting tab
- cable pass-through
- heat-set insert hole
- vent slot pattern
- relief cut

Why it matters:

- feature-level editing
- retrieval
- safer diffing
- family modeling
- domain-aware generation

Loose TypeScript shape:

```ts
interface FeatureNode {
  id: string;
  kind:
    | "extrude"
    | "cut"
    | "revolve"
    | "sweep"
    | "fillet"
    | "chamfer"
    | "shell"
    | "pattern"
    | "mounting_hole_set"
    | "rib_set"
    | "vent_pattern";
  sourceRefs?: string[];
  dependsOn?: string[];
  outputs?: string[];
  intent?: IntentTag[];
}
```

### D. Topology / reference semantics

Some faces, edges, loops, and axes matter because other things depend on them.

Examples:

- mating face
- sealing face
- reference edge
- extrusion axis
- pattern anchor
- assembly datum plane
- tool access face

Why it matters:

- durable references
- better feature edits
- assembly reasoning
- DFM checks

Loose TypeScript shape:

```ts
interface ReferenceEntity {
  id: string;
  entityKind: "face" | "edge" | "vertex" | "axis" | "plane" | "point";
  semanticRole?:
    | "mount_face"
    | "mate_face"
    | "seal_face"
    | "tool_access"
    | "pattern_anchor"
    | "symmetry_plane";
  stability?: "derived" | "declared" | "fragile";
}
```

### E. Assembly semantics

An assembly is not just bodies plus transforms.

Examples:

- rigid mate
- slider mate
- revolute joint
- fastener interface
- alignment surface
- clearance budget
- replacement compatibility
- service envelope

Why it matters:

- assembly-aware validation
- automatic mate suggestion
- replacement reasoning
- clash detection
- mechanism support later

Loose TypeScript shape:

```ts
interface MateDefinition {
  id: string;
  kind: "rigid" | "slider" | "revolute" | "planar" | "cylindrical";
  aRef: string;
  bRef: string;
  dof?: string[];
  clearanceTarget?: number;
}
```

### F. Manufacturing semantics

This is where domain knowledge stops being folklore.

Examples:

- printable on FDM
- printable on SLA
- CNC 3-axis machinable
- injection-moldable
- sheet-metal-compatible
- min wall / min fillet / max overhang / required draft
- no trapped powder
- no impossible tool access

Why it matters:

- validators become useful instead of hand-wavy
- suggestions become actionable
- profiles become reusable
- agents can operate without reading giant instruction files

Loose TypeScript shape:

```ts
interface ManufacturingProfile {
  id: string;
  process:
    | "fdm_printing"
    | "sla_printing"
    | "cnc_3axis"
    | "injection_molding"
    | "sheet_metal";
  material?: string;
  rules: {
    minWall?: number;
    minClearance?: number;
    maxOverhangDeg?: number;
    minDraftDeg?: number;
    minToolRadius?: number;
  };
}
```

### G. Evaluation semantics

Validation should say more than pass/fail.

Examples:

- failed minimum wall in rib network
- bolt pattern underconstrained
- shell likely to self-intersect under param sweep
- part count changed in assembly unexpectedly
- thin feature survives at nominal but fails at extreme param value

Why it matters:

- faster debugging
- repair suggestions
- model quality corpora
- approval workflows

Loose TypeScript shape:

```ts
interface SemanticIssue {
  id: string;
  severity: "info" | "warning" | "error";
  domain:
    | "sketch"
    | "feature"
    | "assembly"
    | "manufacturing"
    | "geometry"
    | "performance";
  message: string;
  relatedRefs?: string[];
  suggestedActions?: string[];
}
```

### H. Workflow / learning semantics

A learnable system needs explicit events around struggle and approval.

Examples:

- feature suggestion accepted
- manufacturing fix rejected
- workaround recorded
- capability gap reported
- approved revision
- rejected revision because “too fragile under sweep”

Why it matters:

- ranking and retrieval
- training corpora
- roadmap harvesting
- agent self-improvement

Loose TypeScript shape:

```ts
interface LearningEvent {
  id: string;
  kind:
    | "revision_approved"
    | "revision_rejected"
    | "capability_gap_reported"
    | "workaround_recorded"
    | "fix_suggested"
    | "fix_applied";
  refs?: string[];
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

---

## Domain examples: what semantics matter where

The right semantics depend on the domain. A consumer enclosure and a fixture block should not look identical to the system.

### 1. FDM-printed brackets and fixtures

Important semantics:

- mounting faces
- hole patterns
- overhang-sensitive geometry
- minimum wall thickness
- rib intent
- print orientation hints
- support avoidance intent
- clearance for bolts / inserts

Concrete examples:

- “These holes are for M3 heat-set inserts”
- “This rib set is for stiffness, not appearance”
- “This face should be printable without support in preferred orientation”
- “This gap is a fit clearance, do not collapse it during optimization”

Loose TS ideas:

```ts
const profile = manufacturingProfile("fdm_printing", {
  material: "PETG",
  nozzle: 0.4,
  layerHeight: 0.2,
  minWall: 1.2,
  maxOverhangDeg: 50,
});

const bracket = feature("mounting_bracket", {
  intent: [
    { kind: "mounting", priority: "hard" },
    { kind: "printability", priority: "hard" },
  ],
});
```

### 2. CNC-machined plates and fixtures

Important semantics:

- tool access
- internal corner radius constraints
- setup datums
- stock orientation
- drilled vs milled features
- pocket depth classes
- hole standard / counterbore / countersink role

Concrete examples:

- “This pocket must be reachable with a 6 mm endmill”
- “These internal corners should stay tool-radius compliant”
- “This face is setup datum A”
- “These holes are dowel holes; position matters more than diameter cosmetic changes”

Loose TS ideas:

```ts
const machining = manufacturingProfile("cnc_3axis", {
  material: "6061",
  minToolRadius: 3,
  minWall: 2,
});

addDatum("A", topFace, { role: "setup_primary" });
addDatum("B", sideFace, { role: "setup_secondary" });
```

### 3. Injection-molded consumer parts

Important semantics:

- draft-critical faces
- parting direction
- shutoff surfaces
- snap-fit intent
- wall-thickness uniformity
- rib-to-wall relationships
- cosmetic vs hidden surfaces

Concrete examples:

- “This outer surface is cosmetic; keep sink risk low”
- “These faces require draft in pull direction”
- “This rib set is subordinate to wall thickness limits”
- “This lip is a snap feature and should preserve flexibility”

Loose TS ideas:

```ts
const moldProfile = manufacturingProfile("injection_molding", {
  material: "ABS",
  minDraftDeg: 1.5,
  minWall: 1.2,
});

markFace(shell.outerFace(), { semanticRole: "cosmetic_surface" });
markDirection(mainPullAxis, { semanticRole: "parting_direction" });
```

### 4. Sheet metal parts

Important semantics:

- bend lines
- bend reliefs
- flat pattern constraints
- grain direction preferences
- fastener / tab / slot interfaces
- no-go zones near bends

Concrete examples:

- “This slot is a tab-receiving feature”
- “This flange depends on bend radius rules”
- “Do not place embossed geometry inside this bend exclusion zone”

Loose TS ideas:

```ts
const sheet = manufacturingProfile("sheet_metal", {
  material: "5052",
  thickness: 2,
  bendRadius: 2,
});

markEdge(bendEdge, { semanticRole: "bend_line" });
markRegion(reliefZone, { semanticRole: "bend_exclusion_zone" });
```

### 5. Assemblies and mechanisms

Important semantics:

- mating interfaces
- fastener interfaces
- alignment references
- motion DOF
- service access
- replaceable parts
- clearance budgets between moving components

Concrete examples:

- “This shaft-hole pair is a revolute relationship”
- “These parts are replaceable variants that share an interface”
- “This cover must be removable without disassembling the base”

Loose TS ideas:

```ts
const mate = addMate("revolute", shaft.axis(), housing.boreAxis(), {
  clearanceTarget: 0.15,
});

markPart(cover, { tags: ["service_access", "replaceable"] });
```

---

## How this could live in the TypeScript system

This section is intentionally loose. The point is direction, not locking the repo into one rigid implementation too early.

### Option 1: Semantic metadata attached to existing API objects

This is the smallest step.

Examples:

```ts
const holePattern = pattern(linear, hole, {
  count: 4,
  spacing: 20,
}).withSemantics({
  kind: "mounting_hole_set",
  intent: [{ kind: "mounting", priority: "hard" }],
});
```

Pros:

- incremental
- easy to layer onto current API
- source stays readable

Cons:

- semantics may stay shallow or inconsistent
- harder to reason across the whole model

### Option 2: A first-class semantic scene / feature graph under the hood

The runtime API emits a graph of:

- features
- refs
- constraints
- parts
- mates
- profiles
- issues

`.forge.ts` remains authored source, but the system builds a semantic graph after evaluation and eventually can write through that graph.

Pros:

- best long-term basis for edit tools, retrieval, validation, and learning
- more durable references
- better separation between authored source and operational state

Cons:

- requires careful materialization back into source
- harder initial implementation

### Option 3: Event-first semantic operations + source materialization

Instead of treating source edits as the only authoring primitive, CadLad can treat semantic actions as first-class events.

Examples:

- `scene.feature_added`
- `scene.param_set`
- `scene.profile_applied`
- `scene.mate_added`
- `validation.completed`
- `revision.approved`

Reducers/materializers then produce:

- source snapshots
- semantic scene state
- evaluation bundles
- stats
- artifacts

Pros:

- best match for agent workflows, revisions, branches, and learning
- clear history model
- strong fit with semantic MCP tools

Cons:

- requires discipline in event taxonomy
- easy to overdesign if not grounded in real tool usage

### Likely practical path

The probable near-term path is a hybrid:

1. attach light semantic metadata to current API objects
2. produce a semantic feature graph during evaluation
3. add semantic write tools for a few strict operations
4. materialize those operations back into `.forge.ts`
5. grow event/revision semantics around those operations

That is ambitious enough to matter and boring enough to survive.

---

## What kinds of features should start semantic first

Not everything needs to become deeply semantic at once. Start where the payoff is high and the ambiguity is manageable.

### Strong candidates

- parameters
- datums / planes / axes / points
- sketch constraints
- repeated feature sets (hole patterns, vent patterns, ribs)
- assembly mates
- manufacturing profiles
- declarative constraints
- evaluation issues and fixes

### Medium candidates

- fillets and chamfers with role tags
- face classifications (mounting, cosmetic, sealing)
- service access regions
- print orientation hints

### Later / harder candidates

- semantic merge of complex scene graphs
- full B-Rep-native semantic editing
- automatic inference of intent from arbitrary old source
- fully learned command generation

The rule is simple:

Start where semantics reduce error rate, increase validator quality, or enable retrieval.

---

## Feature-development questions to bounce ideas against

When proposing or reviewing a new feature, ask:

### Semantics

- What meaning does this feature make explicit?
- Is that meaning currently trapped in source style, docs, or prompts?
- Does this create durable references, or only more text?

### Learnability

- What useful events, approvals, failures, or examples would this generate?
- Could this feature improve retrieval, suggestions, or future repair?
- Does it produce structured outcomes or just screenshots and vibes?

### Code-native fit

- Can this still round-trip cleanly through readable `.forge.ts`?
- Can humans inspect and debug it?
- Does this create a clean materialization boundary?

### Domain knowledge

- Is this rule or convention common enough to encode?
- Should it live in types, profiles, validators, hints, or fixers?
- Will agents still need custom prompting to use it correctly?

### Practicality

- Does this help the next 25 real projects?
- Does it speed the feedback loop?
- Does it reduce common modeling breakage?

If a proposal is flashy but weak on these questions, it is probably theater.

---

## Concrete examples of the direction

### Example 1: “Add two mounting holes”

Weak version:

- agent edits source manually
- inserts circles/extrudes/cuts inline
- no explicit relationship to mounting intent

Stronger version:

- tool call: `addFeature("mounting_hole_set", ...)`
- semantic graph records a feature node with mounting intent
- refs are anchored to a datum or face
- source materializer writes readable `.forge.ts`
- validators know how to check hole spacing / edge clearance / profile compatibility
- later retrieval can find other mounting-hole-set patterns

### Example 2: “Make this printable”

Weak version:

- heuristic suggestion text based on bbox
n
Stronger version:

- model has `fdm_printing` profile
- semantic validators check min wall, overhang, support-sensitive faces, orientation hints
- issues are returned with related feature refs
- fix suggestions can target semantic features instead of rewriting arbitrary code

### Example 3: “Replace this part in an assembly”

Weak version:

- compare transforms and hope for the best

Stronger version:

- parts expose mating interfaces and semantic roles
- assembly graph stores mates and clearance targets
- replacement logic can look for compatible interfaces
- evaluation checks for clashes and broken service access

### Example 4: “Why did this model fail at parameter extreme?”

Weak version:

- geometry failed somewhere
- user gets a vague error

Stronger version:

- param sweep issues are attached to semantic features and refs
- system reports: `rib_set_3 violates minWall at width=42` 
- repair suggestion targets the responsible feature

---

## Non-goals

To keep this doc honest, here is what this vision does **not** require right now.

### Not required yet

- full industrial B-Rep kernel semantics everywhere
- perfect automatic intent inference
- semantic merge for all cases
- giant ontology before tool usage exists
- simulation-heavy manufacturing engines as a prerequisite
- replacing source with an opaque internal-only model

The goal is not maximal sophistication on paper.

The goal is a system that gets more structured, more operable, and more learnable without becoming fragile or unreadable.

---

## The smallest real path forward

If this document is used to make decisions, the smallest real path implied by it is:

1. **Introduce a semantic IR / feature graph exporter**
   - parameters
   - datums
   - sketch entities + constraints
   - features
   - assemblies / mates
   - declarative constraints
   - issues

2. **Make one semantic write path real**
   - `add_feature` first
   - source materialization as a separate, testable module

3. **Add one domain profile with meaningful validators**
   - `fdm_printing` or `cnc_3axis`

4. **Add one approval-quality learning loop**
   - approved / rejected revisions
   - reason capture
   - fix suggestion acceptance

5. **Use the existing projects as the proving ground**
   - every semantic feature should help real examples, not just demos

---

## Final test

A future feature is aligned with this vision if it makes CadLad more like:

- a semantic modeling runtime
- a structured validator
- a reusable design memory
- a code-native authoring system
- an approval-centered agent workflow

and less like:

- a code editor that happens to output solids
- a screenshot-driven guessing machine
- a pile of undocumented modeling tricks
- a geometry engine with no memory of intent

That is the direction.
