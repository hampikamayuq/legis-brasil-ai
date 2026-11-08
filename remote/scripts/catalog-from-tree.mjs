#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 400_000;
const TYPES = new Map([['leis-ordinarias','lei ordinária'],['leis-complementares','lei complementar'],['leis-delegadas','lei delegada'],['decretos-lei','decreto-lei'],['constituicao','constituição']]);
const sql = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sha = str => createHash('sha256').update(str).digest('hex');

export function recordFromPath(path, ref) {
  if (!/^[\p{L}\p{N}_./ -]+\.md$/u.test(path) || path.includes('..') || path.startsWith('/')) return null;
  const parts = path.split('/');
  if (!['federal','estaduais','municipais','reguladores','jurisprudencia','tratados'].includes(parts[0]) && path !== 'constituicao.md') return null;
  const filename = parts.at(-1).slice(0, -3);
  const match = /^(?:lei|lc|decreto|decreto-lei)-?(\d+)(?:-(\d{4})-(\d{2})-(\d{2}))?$/i.exec(filename);
  const sphere = parts[0] === 'estaduais' ? 'estadual' : parts[0] === 'municipais' ? 'municipal' : 'federal';
  const type = TYPES.get(parts[1]) ?? (path === 'constituicao.md' ? 'constituição' : parts[1]?.replaceAll('-', ' ') ?? 'norma');
  const number = match?.[1] ?? null;
  const year = match?.[2] ?? (parts.find(part => /^\d{4}$/.test(part)) ?? null);
  const date = match?.[2] ? `${match[2]}-${match[3]}-${match[4]}` : null;
  const title = path === 'constituicao.md' ? 'Constituição Federal de 1988' : `${type} ${number ?? filename}${year ? ` (${year})` : ''}`;
  return { id: sha(path).slice(0,24), path, title, sphere, uf: ['estaduais','municipais'].includes(parts[0]) ? parts[1] : null, type, number, date, year, summary: null, source: null, github_ref: ref, indexed_at: null };
}

export function buildCatalog({ treeFile, outDir, allowPartial = false, maxRows = 100 }) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1000) throw new Error('Invalid maxRows');
  const tree = JSON.parse(readFileSync(resolve(treeFile), 'utf8'));
  if (!Array.isArray(tree.tree) || typeof tree.sha !== 'string' || !/^[0-9a-f]{40}$/.test(tree.sha)) throw new Error('Invalid GitHub tree response or missing commit/tree SHA');
  if (tree.truncated && !allowPartial) throw new Error('GitHub tree truncated: refuse incomplete index (provide a complete tree or explicit --allow-partial for test only)');
  const ref = tree.commit_sha && /^[0-9a-f]{40}$/.test(tree.commit_sha) ? tree.commit_sha : tree.sha;
  // The tree SHA is NOT a commit SHA. A caller must provide commit_sha for pinning;
  // otherwise use main rather than an invalid raw.githubusercontent.com ref.
  const githubRef = tree.commit_sha ? ref : 'main';
  const records = tree.tree.filter(item => item.type === 'blob' && item.path?.endsWith('.md')).map(item => recordFromPath(item.path, githubRef)).filter(Boolean);
  records.sort((a,b)=>a.path.localeCompare(b.path));
  const dest = resolve(outDir);
  mkdirSync(dest, { recursive: true });
  if (readdirSync(dest).length) throw new Error('Output directory must be empty');
  let chunk = '', rows = 0, files = 0;
  const cols = ['id','path','title','sphere','uf','type','number','date','year','summary','source','github_ref','indexed_at'];
  const batches = [];
  function flush() {
    if (!rows) return;
    const file = `catalog-${String(++files).padStart(5,'0')}.sql`;
    writeFileSync(join(dest,file),chunk,{flag:'wx'});
    batches.push({file, rows, bytes:Buffer.byteLength(chunk), sha256:sha(chunk)});
    chunk = ''; rows = 0;
  }
  for (const record of records) {
    const insert = `INSERT INTO law_catalog (${cols.join(',')}) VALUES (${cols.map(col=>sql(record[col])).join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter(col=>col!=='id').map(col=>`${col}=excluded.${col}`).join(',')};\n`;
    if (Buffer.byteLength(chunk)+Buffer.byteLength(insert)>MAX_BYTES || rows>=maxRows) flush();
    chunk+=insert; rows++;
  }
  flush();
  const manifest = {schema:1, source:'ctresb/leis', treeSha:tree.sha, githubRef, truncated:!!tree.truncated, records:records.length, batches};
  writeFileSync(join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    const params={treeFile:args[args.indexOf('--tree')+1],outDir:args[args.indexOf('--out')+1],allowPartial:args.includes('--allow-partial')};
    if (!args.includes('--tree') || !args.includes('--out') || !params.treeFile || !params.outDir) throw new Error('Usage: node scripts/catalog-from-tree.mjs --tree tree.json --out empty-directory [--allow-partial]');
    console.log(JSON.stringify(buildCatalog(params),null,2));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
