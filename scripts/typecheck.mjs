#!/usr/bin/env node
import { runCheck } from "./run-check.mjs";

runCheck("typecheck", "typescript/bin/tsc", ["--noEmit"]);
