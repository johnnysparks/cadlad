# Workflow: CI and Infrastructure Hygiene

You're making sure tests pass, types are clean, lint is happy, and snapshots are current.

## The commands

```bash
npm ci                  # install pinned workspace dependencies
npm run typecheck:full  # root, worker, and MCP gateway
npm run lint            # apps, packages, infra, and scripts
npm test                # root tests, check-runner regressions, and model corpus
npm run build           # production bundle (also checked in CI)
```

Checks require local tools and exit nonzero when tools are missing, crash, or report errors. Typecheck does not suppress missing dependencies or other diagnostics. Root Vitest excludes the standalone worker and MCP gateway; worker tests use its own configuration.

The gallery and snapshot runner discover `content/projects/*/*.forge.ts`. No `.forge.js` or flat-directory compatibility. Every retained model must pass the gallery/CLI corpus test; obsolete fixtures can be removed deliberately.

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

References: `content/snapshots/<model>/reference.png`
Current captures: `/tmp/cadlad-snapshots/`

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
- Runtime sandbox in `packages/cad-api/runtime.ts` must match what .forge.ts code expects

### Lint errors
- Auto-fix: `npx eslint packages/ --fix`
- Common: unused imports, missing semicolons, prefer-const

### Test failures
- Tests are in `packages/__tests__/` or co-located
- Vitest config in `vitest.config.ts`
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
