import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportD1 } from '../scripts/export-d1.mjs';
import { checkExport } from '../scripts/check-export.mjs';

test('exports safely with quoting, Unicode, batching and reproducible hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'legis-d1-test-'));
  try {
    const path = join(dir, 'input.sqlite');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE laws (id TEXT PRIMARY KEY, path TEXT, title TEXT, sphere TEXT, uf TEXT, type TEXT, number TEXT, date TEXT, year TEXT, summary TEXT, status TEXT, revoked INTEGER, text_version TEXT, source TEXT, downloaded_at TEXT, body TEXT)');
    const insert = db.prepare('INSERT INTO laws (id,path,title,sphere,body) VALUES (?,?,?,?,?)');
    insert.run('b', 'b.md', "Lei d'água", 'federal', "Art. 1º\nINSERT INTO laws (texto literal)\nÉ válida.");
    insert.run('a', 'a.md', 'Lei α', 'estadual', 'Texto de teste.');
    db.close();
    const out = join(dir, 'export');
    const manifest = exportD1({ dbPath: path, outDir: out, maxRows: 1 });
    assert.equal(manifest.rows, 2);
    assert.equal(manifest.batches.length, 2);
    assert.deepEqual(checkExport(out), { rows: 2, batches: 2, contentSha256: manifest.contentSha256 });
    assert.match(readFileSync(join(out, 'batch-00002.sql'), 'utf8'), /Lei d''água/);
    assert.throws(() => exportD1({ dbPath: path, outDir: out }), /empty/);
    writeFileSync(join(out, 'batch-00001.sql'), 'corrupted');
    assert.throws(() => checkExport(out), /Integrity mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rejects invalid row values and too-large rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'legis-d1-test-'));
  try {
    const path = join(dir, 'input.sqlite');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE laws (id TEXT PRIMARY KEY, path TEXT, title TEXT, sphere TEXT, uf TEXT, type TEXT, number TEXT, date TEXT, year TEXT, summary TEXT, status TEXT, revoked INTEGER, text_version TEXT, source TEXT, downloaded_at TEXT, body TEXT)');
    db.prepare('INSERT INTO laws (id,path,title,sphere,body) VALUES (?,?,?,?,?)').run('a', 'a', 'a', 'federal', 'x'.repeat(2000));
    db.close();
    assert.throws(() => exportD1({ dbPath: path, outDir: join(dir, 'export'), maxBytes: 1000 }), /exceeds/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
