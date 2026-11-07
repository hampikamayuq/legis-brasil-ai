# Importação controlada do índice legislativo para Cloudflare D1

Esta ferramenta **gera arquivos SQL locais** a partir do índice SQLite previamente construído com `npm run index`. Ela não acessa a Cloudflare, não faz deploy e não transfere o acervo automaticamente. A execução remota exige decisão explícita do operador após revisão do corpus, de direitos de redistribuição, volume e custos.

## 1. Exportar e validar localmente

Execute na raiz do repositório, usando Node 22.13+:

```sh
node remote/scripts/export-d1.mjs --db ./data/legis.db --out ./d1-export --max-rows 100 --max-bytes 500000
node remote/scripts/check-export.mjs ./d1-export
```

Adapte `--db` ao `LEGIS_DB_PATH` real. `--out` deve ser uma pasta vazia: o exportador **recusa sobrescrever** qualquer conteúdo. A saída é `manifest.json` e arquivos `batch-NNNNN.sql` ordenados por ID. O SQL é idempotente por ID (`ON CONFLICT DO UPDATE`) e inclui corpo integral de cada norma; trate o diretório como dados potencialmente sensíveis ao licenciamento. Não versionar/exportar os lotes para GitHub.

O manifesto registra contagem de normas, quantidade e bytes de cada lote, SHA-256 de cada arquivo e SHA-256 canônico do conteúdo SQLite na ordem dos IDs. `check-export` verifica integridade local dos arquivos e somas de contagens. **Isso não comprova integridade do D1 remoto**, que requer verificação separada.

Linhas maiores que `--max-bytes`, valores binários/NUL ou incompatibilidade de esquema interrompem a exportação; diretórios com saída parcial devem ser inspecionados e removidos ou substituídos por um novo diretório vazio antes de repetir. O importador não apaga normas remotas que não estejam presentes no SQLite local.

## 2. Inspecionar os limites antes do envio

Confira o número de lotes e bytes no manifesto. Faça primeiro uma importação de um único lote **no D1 local** para validar o SQL, após aplicar a migração:

```sh
cd remote
npx wrangler d1 migrations apply legis-brasil-ai --local
npx wrangler d1 execute legis-brasil-ai --local --file=../d1-export/batch-00001.sql
npx wrangler d1 execute legis-brasil-ai --local --command='SELECT COUNT(*) AS total FROM laws;'
```

Se o caminho do `wrangler.toml` ou do banco for diferente, ajuste os comandos. Não use `--remote` até confirmar o `database_id` correto (nunca o banco `plugin-chatgpt`), permissões, licenças, tamanho/cotas D1 e efeito esperado na base existente.

## 3. Execução remota (opcional e **manual**)

Somente depois de aprovação expressa da operação e de uma cópia/backup da base de destino, aplique a migração remota. Para cada lote validado e aprovado, execute:

```sh
cd remote
npx wrangler d1 execute legis-brasil-ai --remote --file=../d1-export/batch-00001.sql
npx wrangler d1 execute legis-brasil-ai --remote --command='SELECT COUNT(*) AS total FROM laws;'
```

Repita lotes em ordem e registre sucessos/falhas. `ON CONFLICT` permite reexecutar um lote após falha, mas **não substitui transações, backup nem auditoria**. Compare contagem com o manifesto **apenas se a base remota não contiver outras normas**. Para conferência amostral, compare IDs, títulos, `length(body)` e metadados de normas selecionadas; o hash agregado do manifesto não é calculado pelo D1.

## Limitações importantes

- O corpus do repositório `ctresb/leis` pode ter direitos e políticas de uso específicos: revisar antes da hospedagem pública.
- O conteúdo e o volume completos não foram testados aqui; validamos somente dados sintéticos. A busca remota ainda é `LIKE`, sem paridade com a busca FTS5 local.
- Não executar o importador automaticamente em CI nem publicar os arquivos exportados. O script de exportação não possui credenciais Cloudflare.
- O D1 não fornece garantias de verificação criptográfica remota nesta etapa; essa funcionalidade requer desenvolvimento posterior.

## Testes

```sh
node --test remote/tests/export-d1.test.mjs
```
