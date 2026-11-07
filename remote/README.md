# Legis Brasil AI — MCP remoto (etapa inicial)

Esta pasta prepara um segundo transporte para o projeto. A versão stdio em `src/` continua inalterada e funcional. **Não publicar este Worker como plugin instalável ainda.**

## O que existe

- Worker stateless com `createMcpHandler` (Streamable HTTP em `/mcp`).
- Quatro ferramentas somente leitura: `search_legislation`, `search_by_topic`, `get_law`, `get_article`.
- Banco D1 com campos equivalentes ao índice local, mas sem acervo importado.
- Bloqueio por padrão: sem `MCP_BEARER_TOKEN`, `/mcp` retorna 503; token ausente/incorreto retorna 401.
- `/health` informa apenas disponibilidade do Worker.

As ferramentas `verify_official_source` e `get_legislative_history` ainda não foram portadas. A busca remota usa `LIKE` em título/ementa, **não** oferece a relevância FTS5 da versão local. Esta é uma implementação inicial para validação, não paridade funcional.

## Preparação local

```sh
cd remote
npm install
npm run check
npx wrangler d1 migrations apply legis-brasil-ai --local
npm run dev
```

Antes de executar contra a conta Cloudflare, inventarie recursos existentes, crie um D1 chamado `legis-brasil-ai` somente se não existir e substitua o ID provisório no `wrangler.toml`. Não reuse o D1 editorial `plugin-chatgpt` — são bases independentes.

## Próximos marcos obrigatórios

1. **Ingestão de dados:** construir importador verificável do SQLite local para D1, com tamanho de lote, contagem de registros, integridade por checksum, limites de custo e procedência do acervo. Não enviar o acervo completo sem revisar licenças e volume.
2. **Qualidade da busca:** avaliar FTS compatível com D1 ou índice externo, com benchmarks e filtros; garantir resultados completos sem ampliar demais a resposta MCP.
3. **Paridade de ferramentas:** portar validação de domínio oficial e metadados históricos com proteção SSRF.
4. **Autenticação pública:** substituir o bearer de desenvolvimento por OAuth compatível com clientes MCP ou configuração de autenticação aprovada. Não publicar token em manifest, website ou código.
5. **Testes:** testar protocolo com MCP Inspector, limites, schemas, chamadas anônimas, erros e execução no ChatGPT.
6. **Empacotamento:** criar `plugin.json`, `mcp.json` e skills antes de submeter à revisão da OpenAI. O endpoint público deve ser HTTPS e real, não um endereço placeholder.

Nenhuma etapa de deploy remoto é automática nesta branch. O merge não deve criar recursos Cloudflare nem alterar o plugin local.
