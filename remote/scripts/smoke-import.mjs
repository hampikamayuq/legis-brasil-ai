#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkExport } from './check-export.mjs';
import { COLUMNS } from './export-d1.mjs';

// Reproduz a importação em SQLite local descartável, sem acesso ao D1 remoto.
export function smokeImport({ directory, migration, maxBatches = 1 }) {
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1) throw new Error('Invalid maxBatches');
  const location = resolve(directory);
  checkExport(location);
  const manifest = JSON.parse(readFileSync(join(location, 'manifest.json'), 'utf8'));
  const batches = manifest.batches.slice(0, maxBatches);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(resolve(migration), 'utf8'));
    for (const batch of batches) {
      db.exec('BEGIN');
      try { db.exec(readFileSync(join(location, batch.file), 'utf8')); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw new Error(`${batch.file}: ${error.message}`); }
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM laws').get().n;
    const expected = batches.reduce((total, batch) => total + batch.rows, 0);
    if (count !== expected) throw new Error(`Count mismatch: ${count} vs ${expected}`);
    const digest = createHash('sha256');
    for (const row of db.prepare(`SELECT ${COLUMNS.join(',')} FROM laws ORDER BY id`).iterate()) {
      const canonical = JSON.stringify(COLUMNS.map(column => row[column] ?? null));
      digest.update(`${Buffer.byteLength(canonical)}:${canonical}\n`);
    }
    const contentSha256 = digest.digest('hex');
    if (batches.length === manifest.batches.length && contentSha256 !== manifest.contentSha256) throw new Error('Full import digest mismatch');
    return { imported: count, batches: batches.length, contentSha256, fullDatasetVerified: batches.length === manifest.batches.length };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [directory, migration, maxBatches] = process.argv.slice(2);
    if (!directory || !migration) throw new Error('Usage: node scripts/smoke-import.mjs EXPORT_DIR migrations/0001_laws.sql [MAX_BATCHES]');
    console.log(JSON.stringify(smokeImport({ directory, migration, maxBatches: maxBatches ? Number(maxBatches) : 1 }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
