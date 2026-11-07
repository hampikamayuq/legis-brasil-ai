#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COLUMNS = ['id', 'path', 'title', 'sphere', 'uf', 'type', 'number', 'date', 'year', 'summary', 'status', 'revoked', 'text_version', 'source', 'downloaded_at', 'body'];
const DEFAULT_MAX_BYTES = 500_000;
const DEFAULT_MAX_ROWS = 100;

function hash(data) { return createHash('sha256').update(data).digest('hex'); }
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Unsupported numeric value');
    return String(value);
  }
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Unsupported SQL value (binary/NUL)');
  return `'${value.replaceAll("'", "''")}'`;
}

export function sqlForRow(row) {
  const values = COLUMNS.map(key => literal(row[key])).join(',');
  const updates = COLUMNS.filter(key => key !== 'id').map(key => `${key}=excluded.${key}`).join(',');
  return `INSERT INTO laws (${COLUMNS.join(',')}) VALUES (${values}) ON CONFLICT(id) DO UPDATE SET ${updates};\n`;
}

export function exportD1({ dbPath, outDir, maxBytes = DEFAULT_MAX_BYTES, maxRows = DEFAULT_MAX_ROWS }) {
  if (!dbPath || !outDir) throw new Error('Required --db and --out');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_000 || !Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error('Invalid batch limits');
  const source = resolve(dbPath);
  const destination = resolve(outDir);
  if (source === destination) throw new Error('Source and output paths must differ');
  if (!statSync(source).isFile()) throw new Error('Source must be a SQLite file');
  mkdirSync(destination, { recursive: true });
  if (readdirSync(destination).length !== 0) throw new Error('Output directory must be empty (will not overwrite files)');

  const db = new DatabaseSync(source, { readOnly: true });
  try {
    const columns = db.prepare('PRAGMA table_info(laws)').all().map(col => col.name);
    if (COLUMNS.some(col => !columns.includes(col))) throw new Error('Incompatible laws schema');
    const manifest = { schema: 1, source: source.split('/').at(-1), batchLimits: { maxBytes, maxRows }, rows: 0, batches: [], contentSha256: '' };
    const digest = createHash('sha256');
    let pending = '', pendingRows = 0;
    function flush() {
      if (!pendingRows) return;
      const name = `batch-${String(manifest.batches.length + 1).padStart(5, '0')}.sql`;
      const data = pending;
      writeFileSync(join(destination, name), data, { flag: 'wx' });
      manifest.batches.push({ file: name, rows: pendingRows, bytes: Buffer.byteLength(data), sha256: hash(data) });
      pending = ''; pendingRows = 0;
    }
    const statement = db.prepare(`SELECT ${COLUMNS.join(',')} FROM laws ORDER BY id`);
    for (const row of statement.iterate()) {
      const canonical = JSON.stringify(COLUMNS.map(col => row[col] ?? null));
      digest.update(`${Buffer.byteLength(canonical)}:${canonical}\n`);
      const sql = sqlForRow(row);
      const bytes = Buffer.byteLength(sql);
      if (bytes > maxBytes) throw new Error(`Row ${row.id} exceeds --max-bytes (${bytes} > ${maxBytes}); no complete export generated`);
      if (pendingRows && (pendingRows >= maxRows || Buffer.byteLength(pending) + bytes > maxBytes)) flush();
      pending += sql;
      pendingRows++;
      manifest.rows++;
    }
    flush();
    manifest.contentSha256 = digest.digest('hex');
    writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return manifest;
  } finally { db.close(); }
}

function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--db', '--out', '--max-bytes', '--max-rows'].includes(argv[i]) || !argv[i + 1]) throw new Error('Usage: node scripts/export-d1.mjs --db path/to/legis.db --out path/to/empty-dir [--max-bytes 500000] [--max-rows 100]');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return { dbPath: result.db, outDir: result.out, maxBytes: result['max-bytes'] === undefined ? DEFAULT_MAX_BYTES : Number(result['max-bytes']), maxRows: result['max-rows'] === undefined ? DEFAULT_MAX_ROWS : Number(result['max-rows']) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = exportD1(options(process.argv.slice(2))); console.log(JSON.stringify({ rows: result.rows, batches: result.batches.length, contentSha256: result.contentSha256 }, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
