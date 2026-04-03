# P4 — Agent Hardening Workflow

## Purpose

Make it easier for agents to encode recurring assumptions into local strict features, validators, and in-source tests instead of re-explaining patterns in chat.

## In scope

- Workflow to promote repeated edit patterns into project-local wrappers.
- Co-located validators and tests for hardened wrappers.
- Clear diagnostics that map local feature rule violations to primitive-level causes.

## Out of scope

- Replacing base primitives with one-off wrappers.
- Implicit hardening without explicit local contracts.

## Interfaces this enables

- Repeatable, safer agent behavior over long sessions.
- Portable design intent that survives prompt/context changes.
- Faster onboarding via explicit local feature contracts.

## First milestone

- Define a documented pattern/template for project-local strict feature wrappers.
- Require at least one validator + one inline test per new wrapper.
- Add a small "harden this pattern" checklist to modeling workflow docs.

## Strict wrapper template (v1)

Use this shape whenever promoting a repeated modeling pattern into a local hardening contract.

1. **Create a project-local wrapper** (single exported helper) that encodes the repeated pattern and names the intent.
2. **Attach one or more local validators** that report:
   - `feature`: wrapper name
   - `rule`: violated contract rule
   - `cause`: primitive-level failure reason (dimensions, overlap, winding, etc.)
   - `fix`: concrete correction guidance
3. **Add at least one inline test** near the wrapper usage showing:
   - a passing example that proves normal behavior
   - a failing example that proves validator diagnostics
4. **Document the contract in source comments** (inputs, invariants, expected output).

### Skeleton

```ts
// strict local wrapper: named intent + explicit invariants
export function strictHandleMount(input: HandleMountInput) {
  const validation = validateStrictHandleMount(input);
  if (!validation.ok) {
    throw new Error(formatStrictFeatureError(validation.issues));
  }

  return buildHandleMount(input);
}

export function validateStrictHandleMount(input: HandleMountInput) {
  const issues: ValidationIssue[] = [];

  if (input.wall < 2) {
    issues.push({
      feature: "strictHandleMount",
      rule: "minimum-wall-thickness",
      cause: "wall thickness below printable threshold",
      fix: "Increase wall to >= 2mm"
    });
  }

  return { ok: issues.length === 0, issues };
}

// inline hardening tests (local contract examples)
inlineTest("strictHandleMount accepts nominal dimensions", () => {
  expect(() => strictHandleMount({ wall: 3, clearance: 0.4 })).not.toThrow();
});

inlineTest("strictHandleMount rejects thin wall", () => {
  expect(() => strictHandleMount({ wall: 1, clearance: 0.4 }))
    .toThrow(/minimum-wall-thickness/);
});
```

## PR checklist (agent hardening)

When a PR promotes a recurring pattern, require all boxes checked:

- [ ] Wrapper exists as a named strict local feature (not an ad-hoc inline snippet).
- [ ] Wrapper has explicit contract comments (inputs + invariants + output intent).
- [ ] At least one validator is co-located with the wrapper.
- [ ] Validator diagnostics include `feature`, `rule`, `cause`, and `fix`.
- [ ] At least one inline passing test and one inline failing test added.
- [ ] Modeling workflow docs updated if this introduces a reusable hardening step.

## Done signal

A recurring modeling pattern can be promoted into a strict local feature in one PR, with tests proving the hardened behavior.
