import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { openDb,getLaw,search } from './db.js';

const db=openDb();
const server=new McpServer({name:'legis-brasil-ai',version:'0.1.0'});
const out=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]});
const caution='Texto informativo; situação e vigência não certificadas. Confira a fonte oficial e atos posteriores.';
server.tool('search_legislation','Pesquisa de legislação brasileira indexada. Resultados não atestam vigência.',
  {query:z.string().min(1),uf:z.string().optional(),type:z.string().optional(),year:z.string().optional(),limit:z.number().int().min(1).max(50).optional()},
  async p=>{try{return out({results:search(db,p.query,p),warning:caution});}catch(e){return out({error:String(e)});}});
server.tool('search_by_topic','Pesquisa textual por assunto jurídico, sem interpretação automática de vigência.',
  {topic:z.string().min(1),limit:z.number().int().min(1).max(50).optional()},
  async p=>{try{return out({results:search(db,p.topic,{limit:p.limit}),warning:caution});}catch(e){return out({error:String(e)});}});
server.tool('get_law','Recupera texto integral indexado de uma norma, com metadados e fonte original.',
  {id:z.string().min(1)},async ({id})=>out({law:getLaw(db,id)||null,warning:caution}));
server.tool('get_article','Extrai o artigo solicitado do texto armazenado; checar remissões e numeração na fonte.',
  {id:z.string().min(1),article:z.string().regex(/^\d+[A-Za-z]?$/)},
  async ({id,article})=>{
    const law=getLaw(db,id);
    if(!law)return out({error:'Norma não encontrada'});
    const body=String(law.body);
    const escaped=article.replace(/[.*+?^\u0024{}()|[\]\\]/g,'\\$&');
    const re=new RegExp('(?:^|\\n)\\s*Art\\.?\\s*'+escaped+'(?:º|°|\\.)?\\s*[-–.]?\\s*','gim');
    const match=re.exec(body);
    if(!match)return out({error:'Artigo não localizado automaticamente; consulte o texto completo.',source:law.source});
    const start=match.index,after=body.slice(start+match[0].length);
    const next=/\n\s*Art\.?\s*\d+[A-Za-z]?(?:º|°|\.)?\b/im.exec(after);
    const excerpt=body.slice(start,Math.min(body.length, start+match[0].length+(next?.index??after.length),start+12000));
    return out({id,article,excerpt,source:law.source,truncated:excerpt.length>=12000,warning:caution});
  });
server.tool('verify_official_source','Consulta apenas URLs oficiais de domínio público .gov.br, .jus.br, .leg.br ou planalto.gov.br e informa status HTTP. Não comprova vigência.',
  {id:z.string().min(1)},async ({id})=>{
    const law=getLaw(db,id);
    if(!law)return out({error:'Norma não encontrada'});
    const source=String(law.source||'');
    let url:URL;
    try{url=new URL(source);}catch{return out({id,verified:false,reason:'URL ausente ou inválida'});}
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:' || !(host==='gov.br'||host.endsWith('.gov.br')||host==='jus.br'||host.endsWith('.jus.br')||host==='leg.br'||host.endsWith('.leg.br')))
      return out({id,verified:false,reason:'Domínio não permitido para consulta automática',source});
    try{
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch(url,{method:'HEAD',redirect:'manual',signal:controller.signal});
        return out({id,source,httpStatus:response.status,reachable:response.ok,officialDomain:true,
          verifiedCurrentWording:false,verifiedValidity:false,checkedAt:new Date().toISOString(),warning:caution});
      }finally{clearTimeout(timeout);}
    }catch(e){return out({id,source,reachable:false,error:String(e),warning:caution});}
  });
server.tool('get_legislative_history','Retorna metadados de versão; o histórico de alterações não é reconstruído a partir dos commits do acervo.',
  {id:z.string().min(1)},async ({id})=>{
    const law=getLaw(db,id);
    if(!law)return out({error:'Norma não encontrada'});
    return out({id,path:law.path,date:law.date,textVersion:law.text_version,statusFromSource:law.status,
      revokedFromSource:law.revoked,downloadedAt:law.downloaded_at,source:law.source,
      historyAvailable:false,warning:'Histórico de alterações e vigência não verificados.'});
  });
const transport=new StdioServerTransport();
await server.connect(transport);
