import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { fetchLawMarkdown } from './github-source';

interface Env {
  DB: D1Database;
  MCP_BEARER_TOKEN?: string;
}

const warning = 'Acervo informativo: integridade, redação atual e vigência jurídica não certificadas. Confira sempre a publicação oficial e alterações posteriores.';
const out = (payload: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(payload) }] });
const trimmed = (value: string, max = 12000) => value.slice(0, max);
const searchInput = z.object({
  query: z.string().min(1).max(120),
  uf: z.string().max(3).optional(),
  type: z.string().max(80).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  limit: z.number().int().min(1).max(20).default(10)
});

// No FTS migration is assumed: D1 corpus ingestion and search-quality tuning
// must be benchmarked independently before opening a public endpoint.
export function makeServer(env: Env) {
  const server = new McpServer({ name: 'legis-brasil-ai', version: '0.2.0' });
  server.registerTool('search_legislation', {
    description: 'Pesquisa preliminar no acervo legislativo brasileiro, sem certificar vigência.',
    inputSchema: searchInput
  }, async ({ query, uf, type, year, limit }) => {
    const terms = query.trim().split(/\s+/).slice(0, 8);
    const clause = terms.map(() => '(title LIKE ? ESCAPE \'\\\' OR summary LIKE ? ESCAPE \'\\\')').join(' AND ');
    const escaped = terms.flatMap(term => {
      const pattern = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
      return [pattern, pattern];
    });
    const sql = `SELECT id,path,title,sphere,uf,type,number,date,summary,source,github_ref
      FROM law_catalog WHERE ${clause} AND (? IS NULL OR uf=?) AND (? IS NULL OR type=?)
      AND (? IS NULL OR year=?) ORDER BY title LIMIT ?`;
    const rows = await env.DB.prepare(sql).bind(...escaped, uf ?? null, uf ?? null,
      type ?? null, type ?? null, year ?? null, year ?? null, limit).all();
    return out({ results: rows.results, warning });
  });
  server.registerTool('search_by_topic', {
    description: 'Busca textual preliminar por assunto em títulos e ementas.',
    inputSchema: z.object({ topic: z.string().min(1).max(120), limit: z.number().int().min(1).max(20).default(10) })
  }, async ({ topic, limit }) => {
    const pattern = '%' + topic.trim().replace(/[\\%_]/g, '\\$&') + '%';
    const rows = await env.DB.prepare(`SELECT id,path,title,sphere,uf,type,number,date,summary,source,github_ref
      FROM law_catalog WHERE title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' LIMIT ?`)
      .bind(pattern, pattern, limit).all();
    return out({ results: rows.results, warning });
  });
  server.registerTool('get_law', {
    description: 'Recupera metadados e trecho limitado de norma no GitHub pelo ID indexado.',
    inputSchema: z.object({ id: z.string().min(1).max(80) })
  }, async ({ id }) => {
    const law = await env.DB.prepare('SELECT * FROM law_catalog WHERE id=?').bind(id).first<Record<string, unknown>>();
    if (!law) return out({ error: 'Norma não encontrada', warning });
    try {
      const { text: body, url, ref } = await fetchLawMarkdown(String(law.path), { ref: String(law.github_ref ?? 'main') });
      return out({ law: { ...law, body: trimmed(body) }, truncated: body.length > 12000, upstream: { url, ref }, warning });
    } catch (error) { return out({ error: error instanceof Error ? error.message : 'Falha na origem', id, warning }); }
  });
  server.registerTool('get_article', {
    description: 'Localiza artigo numerado no Markdown do GitHub; remissões devem ser conferidas na fonte oficial.',
    inputSchema: z.object({ id: z.string().min(1).max(80), article: z.string().regex(/^\d+[A-Za-z]?$/) })
  }, async ({ id, article }) => {
    const law = await env.DB.prepare('SELECT path,source,github_ref FROM law_catalog WHERE id=?').bind(id).first<{ path: string; source: string | null; github_ref: string }>();
    if (!law) return out({ error: 'Norma não encontrada', warning });
    let body: string, url: string;
    try { const result = await fetchLawMarkdown(law.path, { ref: law.github_ref }); body = result.text; url = result.url; }
    catch (error) { return out({ error: error instanceof Error ? error.message : 'Falha na origem', warning }); }
    const re = new RegExp('(?:^|\\n)\\s*Art\\.?\\s*' + article + '(?:º|°|\\.)?\\s*[-–.]?\\s*', 'im');
    const match = re.exec(body);
    if (!match) return out({ error: 'Artigo não localizado automaticamente', source: law.source, warning });
    const after = body.slice(match.index + match[0].length);
    const next = /\n\s*Art\.?\s*\d+[A-Za-z]?(?:º|°|\.)?\b/im.exec(after);
    const fullExcerpt = body.slice(match.index, match.index + match[0].length + (next?.index ?? after.length));
    const excerpt = trimmed(fullExcerpt);
    return out({ id, article, excerpt, source: law.source, upstream: url, truncated: fullExcerpt.length > 12000, warning });
  });
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return Response.json({ ok: true, public: false }, { headers: { 'cache-control': 'no-store' } });
    if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    // Mandatory closed-by-default interim gate. Replace with MCP-compatible
    // OAuth before public distribution. Never publish a token in plugin.json.
    if (!env.MCP_BEARER_TOKEN) return new Response('MCP not configured', { status: 503 });
    if (request.headers.get('authorization') !== `Bearer ${env.MCP_BEARER_TOKEN}`)
      return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
    return createMcpHandler(() => makeServer(env))(request, env, ctx);
  }
};
