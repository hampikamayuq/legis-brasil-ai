import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { openDb } from './db.js';

const root=resolve(process.env.LEGIS_DATA_DIR || '');
if (!process.env.LEGIS_DATA_DIR) throw Error('Defina LEGIS_DATA_DIR com o diretório do acervo.');
const db=openDb();
const insert=db.prepare(`INSERT INTO laws
 (id,path,title,sphere,uf,type,number,date,year,summary,status,revoked,text_version,source,downloaded_at,body)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET
 path=excluded.path,title=excluded.title,sphere=excluded.sphere,uf=excluded.uf,
 type=excluded.type,number=excluded.number,date=excluded.date,year=excluded.year,
 summary=excluded.summary,status=excluded.status,revoked=excluded.revoked,
 text_version=excluded.text_version,source=excluded.source,downloaded_at=excluded.downloaded_at,body=excluded.body`);
let indexed=0,failed=0;
function walk(dir:string) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    if (entry.name.startsWith('.') || ['scripts','_fonte','fonte','_indice','node_modules'].includes(entry.name)) continue;
    const full=join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else if(entry.isFile() && entry.name.endsWith('.md')) {
      const path=relative(root,full).split(sep).join('/');
      if (!/^(constituicao\.md|federal\/|estaduais\/|municipais\/|reguladores\/|jurisprudencia\/|tratados\/)/.test(path)) continue;
      try {
        const data=readFileSync(full,'utf8');
        let meta:Record<string,unknown>={},body=data;
        if(data.startsWith('---\n')) {
          const end=data.indexOf('\n---\n',4);
          if(end>0) { meta=YAML.parse(data.slice(4,end))||{};body=data.slice(end+5); }
        }
        const str=(k:string)=>meta[k]==null?null:String(meta[k]);
        const sphere=path.startsWith('federal/')?'federal':path.startsWith('estaduais/')?'estadual':
          path.startsWith('municipais/')?'municipal':path.split('/')[0];
        const id=createHash('sha256').update(path).digest('hex').slice(0,24);
        insert.run(id,path,str('titulo')||body.match(/^# (.+)/m)?.[1]||path,sphere,str('uf'),
          str('tipo'),str('numero'),str('data'),str('ano'),str('ementa'),str('situacao'),
          typeof meta.revogada==='boolean'?(meta.revogada?1:0):null,str('versao_texto'),
          str('fonte'),str('baixado_em'),body);
        indexed++;
        if(indexed%10000===0) process.stderr.write(`Indexados: ${indexed}\n`);
      } catch(e) { failed++;process.stderr.write(`Falha em ${path}: ${String(e)}\n`); }
    }
  }
}
if(!statSync(root).isDirectory()) throw Error('LEGIS_DATA_DIR não é uma pasta.');
walk(root);
db.close();
process.stdout.write(JSON.stringify({indexed,failed})+'\n');
if(failed) process.exitCode=1;
