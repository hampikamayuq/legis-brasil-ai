# Consulta híbrida: D1 somente metadados, GitHub sob demanda

Esta etapa substitui as consultas do MCP remoto para usar `law_catalog` no D1 como índice leve e obter o texto integral diretamente dos arquivos Markdown públicos de `ctresb/leis` quando `get_law` ou `get_article` são chamados.

## Fluxo

1. `search_legislation` e `search_by_topic` consultam **somente** os metadados do D1.
2. O cliente fornece um `id` retornado pela busca.
3. O Worker recupera `path` e `github_ref` a partir do D1 e monta URL de `raw.githubusercontent.com/ctresb/leis` usando caminho relativo validado.
4. Requisição com redirecionamento desabilitado, timeout de 8 segundos, limite de 750 KB de leitura e cache de `fetch` de 1 hora. O texto é retornado truncado em 12 mil caracteres por ferramenta, com URL e aviso de verificação oficial.

## Migração e índice

Aplicar `remote/migrations/0002_catalog.sql` após a migração `0001_laws.sql` já executada manualmente. A tabela nova é independente e a tabela `laws` preexistente não é apagada.

Ainda **não há sincronizador de metadados**. Até ser implementado e executado, `law_catalog` fica vazia e as ferramentas de busca retornam listas vazias. Não implantar publicamente enquanto essa dependência estiver pendente.

O campo `github_ref` pode receber uma SHA de commit para respostas reprodutíveis. `main` funciona como referência mutável, portanto resultados podem mudar entre atualizações; para produção, preferir commits fixos e atualizar o índice por rotina controlada.

## Segurança e limitações

- URLs e hosts não são fornecidos pelo usuário: o Worker só aceita caminhos relativos Markdown no repositório fixo `ctresb/leis`.
- Evita respostas arbitrárias de URLs externas, e não armazena as leis no D1.
- O cache depende do runtime Cloudflare; a API do GitHub e a origem raw continuam sujeitas a indisponibilidade e limites operacionais.
- O índice `LIKE` não substitui um mecanismo robusto de pesquisa jurídica por assunto. A busca e a vigência precisam de validação em fontes oficiais.
- O bearer temporário continua obrigatório para `/mcp`; este PR não configura OAuth, não faz deploy e não torna o serviço público.

## Pendências para próximo PR

Implementar geração incremental/atualização de `law_catalog` a partir da árvore GitHub e frontmatter, com revisão de campos e idempotência. Testar buscas e amostras reais antes de usar em produção.
