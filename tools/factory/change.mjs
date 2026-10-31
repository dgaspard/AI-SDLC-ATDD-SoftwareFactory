#!/usr/bin/env node
// Production entry: no qualification dependency injection or bypass flags.
import {runChange} from './change-engine.mjs';
process.exitCode=await runChange(process.argv.slice(2));
