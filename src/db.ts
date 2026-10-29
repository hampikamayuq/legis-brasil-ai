import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type Law = {
  id: string; path: string; title: string; sphere: string; uf: string | null;
  type: string | null; number: string | null; date: string | null; year: string | null;
  summary: string | null; status: string | null; revoked: number | null;
  textVersion: string | null; source: string | null; downloadedAt: string | null; body: string;
};
export function openDb(file = process.env.LEGIS_DB_PATH || './data/legis.db'): DatabaseSync {
  const abs = resolve(file);
  mkdirSync(dirname(abs), { recursive: true });
  const db = new DatabaseSync(abs);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS laws (
    id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    sphere TEXT NOT NULL, uf TEXT, type TEXT, number TEXT, date TEXT, year TEXT,
    summary TEXT, status TEXT, revoked INTEGER, text_version TEXT,
    source TEXT, downloaded_at TEXT, body TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS laws_fts USING fts5(
    title, summary, body, content='laws', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS laws_ai AFTER INSERT ON laws BEGIN
    INSERT INTO laws_fts(rowid,title,summary,body) VALUES(new.rowid,new.title,new.summary,new.body);
  END;
  CREATE TRIGGER IF NOT EXISTS laws_ad AFTER DELETE ON laws BEGIN
    INSERT INTO laws_fts(laws_fts,rowid,title,summary,body) VALUES('delete',old.rowid,old.title,old.summary,old.body);
  END;
  CREATE TRIGGER IF NOT EXISTS laws_au AFTER UPDATE ON laws BEGIN
    INSERT INTO laws_fts(laws_fts,rowid,title,summary,body) VALUES('delete',old.rowid,old.title,old.summary,old.body);
    INSERT INTO laws_fts(rowid,title,summary,body) VALUES(new.rowid,new.title,new.summary,new.body);
  END;`);
  return db;
}
export function getLaw(db: DatabaseSync, id: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM laws WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}
export function search(db: DatabaseSync, query: string, filters: {uf?:string;type?:string;year?:string;limit?:number} = {}) {
  const terms = query.trim().split(/\s+/u).filter(Boolean).slice(0, 12)
    .map(t => '"' + t.replace(/"/g, '""') + '"');
  if (!terms.length) throw Error('Informe ao menos um termo de pesquisa.');
  const sql = `SELECT l.id,l.title,l.sphere,l.uf,l.type,l.number,l.date,l.summary,l.status,l.revoked,l.text_version,l.source,
    snippet(laws_fts,2,'[',']',' … ',20) AS excerpt
    FROM laws_fts JOIN laws l ON l.rowid=laws_fts.rowid
    WHERE laws_fts MATCH ? AND (? IS NULL OR l.uf = ?) AND (? IS NULL OR l.type = ?)
    AND (? IS NULL OR l.year = ?) ORDER BY bm25(laws_fts) LIMIT ?`;
  return db.prepare(sql).all(terms.join(' AND '),filters.uf??null,filters.uf??null,
    filters.type??null,filters.type??null,filters.year??null,filters.year??null,
    Math.max(1,Math.min(filters.limit??10,50)));
}
