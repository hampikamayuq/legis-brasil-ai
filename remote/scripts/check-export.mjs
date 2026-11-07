#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
export function checkExport(directory) {
  const location = resolve(directory);
  const manifest = JSON.parse(readFileSync(join(location, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.batches) || !Number.isSafeInteger(manifest.rows)) throw new Error('Invalid manifest');
  const expected = new Set(['manifest.json', ...manifest.batches.map(batch => batch.file)]);
  if (expected.size !== manifest.batches.length + 1 || readdirSync(location).some(file => !expected.has(file))) throw new Error('Unexpected or duplicate files');
  let rows = 0;
  for (const batch of manifest.batches) {
    if (!/^batch-\d{5}\.sql$/.test(batch.file)) throw new Error('Invalid batch filename');
    const data = readFileSync(join(location, batch.file));
    if (data.byteLength !== batch.bytes || sha256(data) !== batch.sha256) throw new Error(`Integrity mismatch: ${batch.file}`);
    if (!Number.isSafeInteger(batch.rows) || batch.rows < 1) throw new Error(`Invalid row count: ${batch.file}`);
    rows += batch.rows;
  }
  if (rows !== manifest.rows) throw new Error('Manifest total row count mismatch');
  return { rows, batches: manifest.batches.length, contentSha256: manifest.contentSha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-export.mjs OUTPUT_DIR'); console.log(JSON.stringify(checkExport(process.argv[2]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
