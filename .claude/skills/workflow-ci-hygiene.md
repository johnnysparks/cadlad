# Workflow: CI and Infrastructure Hygiene

You're making sure tests pass, types are clean, lint is happy, and snapshots are current.

## The commands

```bash
npm run typecheck    # tsc --noEmit  ← ALWAYS reliable, use this first
npm run lint         # eslint src/   ← exits 0 if eslint not installed (silent no-op)
npm run test         # vitest run    ← exits 0 if vitest not installed (silent no-op)
npm run build        # production build (catches import/bundling issues)
```

> **Critical:** `npm run test` and `npm run lint` exit 0 without running if their tools aren't installed locally. `npm run typecheck` is the one reliable check. If you need real test/lint execution, install the tools first: `npm install -D vitest` / `npm install -D eslint`.

Run in this order: typecheck → lint → test → build. But verify that lint/test output is actually printed — a silent exit 0 means the tool isn't installed, NOT that checks passed.

## Snapshot testing

Visual regression tests compare rendered screenshots against references.

```bash
# Requires dev server running
npm run dev &

# Compare current renders to references
node scripts/snapshot-test.mjs --url http://localhost:5173

# Update references (after visual verification)
node scripts/snapshot-test.mjs --url http://localhost:5173 --update
```

References: `snapshots/reference/`
Current captures: `snapshots/current/`

For screenshot environment setup, read `.claude/skills/sniff_screenshot.md`.

## Background CI check

A convenience script runs lint + typecheck + test in the background after commits:

```bash
scripts/ci-check-bg.sh
```

## Git hooks

```bash
scripts/install-hooks.sh  # sets up local git hooks
```

Local `core.hooksPath` is set to `.git/hooks` (overrides global hooks).

## Common fixes

### Type errors
- New Solid methods need `_derive()` for color/name preservation — check return types
- Runtime sandbox in `src/api/runtime.ts` must match what .forge.ts code expects

### Lint errors
- Auto-fix: `npx eslint src/ --fix`
- Common: unused imports, missing semicolons, prefer-const

### Test failures
- Tests are in `src/__tests__/` or co-located
- Vitest config in `vite.config.ts`
- If a test fails on geometry, check that Manifold WASM initializes properly in the test environment

### Build failures
- Usually import path issues or missing exports
- Check `vite.config.ts` for multi-page entry configuration

## Done criteria

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm run test` — all pass
- [ ] `npm run build` — succeeds
- [ ] Snapshot tests pass (if applicable)
