#!/usr/bin/env node
import { runCheck } from "./run-check.mjs";

runCheck("test", "vitest/vitest.mjs", ["run"]);
