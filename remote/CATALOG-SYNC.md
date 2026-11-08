# Gerar índice leve a partir do GitHub (sem textos jurídicos)

O script `scripts/catalog-from-tree.mjs` transforma uma resposta JSON da **Git Trees API** de `ctresb/leis` em lotes SQL para `law_catalog`. A saída contém somente identificador, caminho, título inferido, esfera, tipo, número e data inferidos, e referência Git. **Não transfere o corpo das normas.**

## Pré-requisitos

1. Mesclar PR #5 e aplicar a migração `remote/migrations/0002_catalog.sql` ao D1 correto.
2. Obter a árvore JSON de `https://api.github.com/repos/ctresb/leis/git/trees/main?recursive=1`, preferencialmente com uma ferramenta autenticada ou cliente API permitido. Guarde como `tree.json` localmente; não o suba ao GitHub.
3. Verificar se o JSON contém `truncated: false`. A API pode truncar árvores grandes. Quando isso ocorrer, obtenha árvores menores por subdiretório e trate cada uma como uma atualização parcial supervisionada; não considere uma árvore truncada como cobertura completa.

```sh
node remote/scripts/catalog-from-tree.mjs --tree tree.json --out ./catalog-export
```

Para testar conscientemente uma árvore truncada, use `--allow-partial`, **apenas para amostras**, conferindo `truncated: true` no manifesto. Uma árvore incompleta não pode ser anunciada como cobertura integral do acervo.

A saída contém `catalog-00001.sql`, outros lotes se necessários, e `manifest.json` com contagem e SHA-256 dos arquivos. A pasta de saída precisa estar vazia. Os `INSERT ... ON CONFLICT DO UPDATE` são idempotentes por ID, mas **não removem entradas antigas**, nem validam vigência jurídica.

## Importação opcional e manual

Após revisar metadados, licença, quantidade e custos, importe inicialmente **um lote** no D1 local com Wrangler. Somente depois de validar contagens, qualidade e backup do destino, considere uma operação remota supervisionada, nunca automática.

## Limitações do índice por caminho

- Títulos e números são **inferidos dos nomes dos arquivos**, não da ementa oficial. A busca por tema não terá qualidade suficiente até enriquecermos os metadados com o frontmatter das normas.
- `github_ref: main` é mutável. Um JSON de árvore pode incluir `commit_sha` de 40 caracteres para fixar a versão; o `sha` da árvore, sozinho, não é um commit e **não** é usado como referência de conteúdo.
- Árvores JSON grandes podem exceder limites de resposta da API, de memória ou de tamanho do SQL gerado. Teste por segmentos antes de indexar o conjunto completo.
- Os IDs são SHA-256 do caminho (24 caracteres), compatíveis com a convenção do índice local atual.
- Nenhum comando nesta etapa cria banco, altera o Worker, executa migração remota ou publica MCP.

## Testes

```sh
node --test remote/tests/catalog-from-tree.test.mjs
```
