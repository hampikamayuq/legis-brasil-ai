import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCatalog, recordFromPath } from '../scripts/catalog-from-tree.mjs';

test('derive searchable catalog fields from actual ctresb path convention', () => {
  const x = recordFromPath('federal/leis-ordinarias/2024/lei-14792-2024-01-05.md','main');
  assert.equal(x.number, '14792');
  assert.equal(x.year, '2024');
  assert.equal(x.date, '2024-01-05');
  assert.equal(x.type, 'lei ordinária');
  assert.equal(x.path,'federal/leis-ordinarias/2024/lei-14792-2024-01-05.md');
  assert.equal(recordFromPath('scripts/README.md','main'),null);
});

test('reject truncated trees by default and import a complete synthetic tree', () => {
  const dir=mkdtempSync(join(tmpdir(),'legis-catalog-'));
  try {
    const source=join(dir,'tree.json');
    const tree={sha:'a'.repeat(40),truncated:true,tree:[
      {type:'blob',path:'federal/leis-ordinarias/2024/lei-14792-2024-01-05.md'},
      {type:'blob',path:'constituicao.md'},
      {type:'blob',path:'scripts/normalizar.py'}
    ]};
    writeFileSync(source,JSON.stringify(tree));
    assert.throws(()=>buildCatalog({treeFile:source,outDir:join(dir,'blocked')}),/truncated/);
    tree.truncated=false;
    writeFileSync(source,JSON.stringify(tree));
    const out=join(dir,'out');
    const manifest=buildCatalog({treeFile:source,outDir:out,maxRows:1});
    assert.equal(manifest.records,2);
    assert.equal(manifest.batches.length,2);
    const db=new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../migrations/0002_catalog.sql',import.meta.url),'utf8'));
    for(const batch of manifest.batches) db.exec(readFileSync(join(out,batch.file),'utf8'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM law_catalog').get().n,2);
    assert.equal(db.prepare("SELECT number FROM law_catalog WHERE type='lei ordinária'").get().number,'14792');
    db.close();
    assert.throws(()=>buildCatalog({treeFile:source,outDir:out}),/empty/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
