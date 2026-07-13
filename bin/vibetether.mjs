#!/usr/bin/env node
import { main } from '../src/cli.mjs';

try {
  process.stdout.write(await main());
} catch (error) {
  process.stderr.write(`VibeTether: ${error.message}\n`);
  process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
}
