# Legis Brasil AI

Servidor MCP de pesquisa da legislação brasileira baseado no acervo [ctresb/leis](https://github.com/ctresb/leis), com recuperação de textos e indicação explícita dos limites de verificação de vigência.

> **Aviso:** o acervo é informativo; textos obtidos por conversão/OCR podem conter falhas. Nenhuma ferramenta declara vigência jurídica confirmada apenas com base no repositório. Antes de citar ou tomar decisões, confira a publicação oficial e alterações posteriores.

## Início rápido

```bash
npm install
npm run build
LEGIS_DATA_DIR=/caminho/para/ctresb/leis npm run index
LEGIS_DATA_DIR=/caminho/para/ctresb/leis npm start
```

O banco SQLite de busca é gerado em `LEGIS_DB_PATH` (padrão `./data/legis.db`). A indexação utiliza o checkout local do acervo, que deve ser obtido independentemente. Para o primeiro teste, basta colocar alguns arquivos `.md` em uma pasta e indicá-la em `LEGIS_DATA_DIR`. É recomendável usar uma cópia sem histórico Git para reduzir tamanho e tempo de download.

### Ferramentas MCP

- `search_legislation`: filtro por texto, UF, tipo e ano;
- `get_law`: conteúdo da norma por identificador;
- `get_article`: extrai trecho pelo número de artigo;
- `search_by_topic`: pesquisa textual por assunto;
- `verify_official_source`: verifica a estrutura e o status HTTP do link oficial, sem afirmar vigência;
- `get_legislative_history`: informa limites da análise histórica e metadados disponíveis.

### Integração

O transporte inicial é **stdio**, adequado a clientes MCP que executam processos locais. Não há endpoint público nem autenticação remota implementada. Para conexão remota privada ao ChatGPT será necessária uma segunda etapa com transporte HTTP, autenticação e hospedagem protegida. **Não exponha o servidor diretamente na internet.**

## Licenças e fontes

O código deste projeto usa licença MIT. Preserve os avisos de licença aplicáveis ao reutilizar scripts do projeto original. Os textos legislativos devem ser conferidos nas fontes públicas apontadas nos metadados.
