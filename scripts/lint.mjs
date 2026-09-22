#!/usr/bin/env node
import { runCheck } from "./run-check.mjs";

runCheck("lint", "eslint/bin/eslint.js", ["apps/", "packages/", "infra/", "scripts/"]);
