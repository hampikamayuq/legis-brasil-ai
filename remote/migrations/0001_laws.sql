CREATE TABLE IF NOT EXISTS laws (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sphere TEXT NOT NULL,
  uf TEXT,
  type TEXT,
  number TEXT,
  date TEXT,
  year TEXT,
  summary TEXT,
  status TEXT,
  revoked INTEGER,
  text_version TEXT,
  source TEXT,
  downloaded_at TEXT,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_laws_uf_type_year ON laws(uf,type,year);
CREATE INDEX IF NOT EXISTS idx_laws_title ON laws(title);
