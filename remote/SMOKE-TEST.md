# Validação de ponta a ponta da importação

Depois de produzir uma exportação conforme [`IMPORT-D1.md`](./IMPORT-D1.md), execute uma amostra em um SQLite **em memória**, descartado após o teste:

```sh
node remote/scripts/smoke-import.mjs ./d1-export ./remote/migrations/0001_laws.sql
```

O teste carrega somente o primeiro lote por padrão, confere a migração, faz os `INSERT ... ON CONFLICT` dentro de transação, verifica a contagem e calcula o hash das normas importadas.

Para verificar **todos** os lotes (atenção: pode consumir muita RAM e tempo), especifique o número total de lotes indicado no `manifest.json`, por exemplo:

```sh
node remote/scripts/smoke-import.mjs ./d1-export ./remote/migrations/0001_laws.sql 10
```

Quando o número informado incluir todos os lotes, a saída `fullDatasetVerified: true` indica que o SHA-256 reconstruído bate com o manifesto. Para um subconjunto, `fullDatasetVerified` será `false` mesmo que a contagem passe.

Essa checagem **não é um teste no runtime Cloudflare D1**. Depois dela, faça o teste com `wrangler d1 execute --local` descrito em `IMPORT-D1.md`; a execução `--remote` continua sujeita à aprovação explícita após revisão de volume, custos e licenciamento.

Teste automatizado sintético:

```sh
node --test remote/tests/export-d1.test.mjs
```
