#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInside } from '../src/files.mjs';
import { inspectProviderTree } from '../src/provider-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'registry', 'providers.json');
const registry = JSON.parse(await readFile(target, 'utf8'));
const drift = [];
for (const card of registry.providers ?? []) {
  const source = resolveInside(root, card.path, `Provider ${card.id} path`);
  const inspection = await inspectProviderTree(source);
  if (card.object_hash !== inspection.digest
      || card.fingerprint !== inspection.digest
      || JSON.stringify(card.resources ?? []) !== JSON.stringify(inspection.resources)
      || JSON.stringify(card.scripts ?? []) !== JSON.stringify(inspection.scripts)
      || card.context_bytes !== inspection.context_bytes) drift.push(card.id);
  card.object_hash = inspection.digest;
  card.fingerprint = inspection.digest;
  card.resources = inspection.resources;
  card.scripts = inspection.scripts;
  card.context_bytes = inspection.context_bytes;
}
if (!process.argv.includes('--write')) {
  if (drift.length) {
    console.error(`Provider registry drift: ${drift.join(', ')}. Re-run with --write after reviewing the source bytes.`);
    process.exitCode = 1;
  } else console.log(`Verified ${registry.providers.length} immutable Provider digests and resource closures.`);
} else {
  await writeFile(target, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  console.log(`Synchronized immutable digests and closures for ${registry.providers.length} Providers.`);
}
