-- Lightweight metadata index; legal text stays in the upstream GitHub repo.
CREATE TABLE IF NOT EXISTS law_catalog (
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
  source TEXT,
  github_ref TEXT NOT NULL DEFAULT 'main',
  indexed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_catalog_uf_type_year ON law_catalog(uf,type,year);
CREATE INDEX IF NOT EXISTS idx_catalog_title ON law_catalog(title);
