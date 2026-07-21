#!/usr/bin/env node
import { main } from '../src/cli.mjs';

try {
  process.stdout.write(await main(process.argv.slice(2)));
} catch (error) {
  const stream = error.outputStream === 'stdout' ? process.stdout : process.stderr;
  if (typeof error.output === 'string') stream.write(error.output);
  else stream.write(`VibeTether: ${error.message}\n`);
  process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
}
