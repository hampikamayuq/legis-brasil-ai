import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, getLaw, search } from '../dist/db.js';

test('FTS search indexes and filters law records', () => {
  const dir=mkdtempSync(join(tmpdir(),'legis-test-'));
  try {
    const db=openDb(join(dir,'test.db'));
    db.prepare(`INSERT INTO laws(id,path,title,sphere,uf,type,number,date,year,summary,status,revoked,text_version,source,downloaded_at,body)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'lei1','federal/leis-ordinarias/2020/1.md','Lei de teste','federal',null,
      'Lei Ordinária','1','2020-01-01','2020','Dispõe sobre dermatologia','Em vigor',0,
      'original','https://www.planalto.gov.br/','2026-10-29','Art. 1º Esta lei regula dermatologia.'
    );
    assert.equal(getLaw(db,'lei1')?.number,'1');
    assert.equal(search(db,'dermatologia').length,1);
    assert.equal(search(db,'dermatologia',{year:'2021'}).length,0);
    assert.equal(search(db,'dermatologia',{year:'2020'}).length,1);
    db.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
