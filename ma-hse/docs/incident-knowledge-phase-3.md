# MAxSafety — Knowledge Base de incidentes S-EWO — Fase 3

## Pesquisa implementada

- A aprovação HSE coloca o documento na fila Redis de indexação. O estado passa por `INDEXING` e termina em `INDEXED`.
- Os PDFs e o texto bruto extraído nunca são enviados à API de embeddings. A indexação gera texto apenas a partir dos campos estruturados revistos: contexto operacional, mecanismo, causas com o respetivo estado, ações e lições.
- O texto é minimizado: não inclui código do trabalhador, nome do responsável, campos de lesão/parte do corpo/consequência, referência diária exata nem PDF. O sanitizador tenta remover nomes detetáveis, contactos, identificadores e referências médicas rotuladas.
- O modelo predefinido é `text-embedding-3-small`, com 1536 dimensões, consistente com `vector(1536)` no PostgreSQL.
- A pesquisa combina similaridade vetorial e correspondências textuais/estruturadas. Filtra planta, estado aprovado, arquivo, período, tipo, departamento, equipamento e categoria confirmada antes de limitar os resultados.
- Os resultados distinguem causas confirmadas, rejeitadas e incertas; mostram ações e estado, excerto e página quando disponível, e uma referência segura à ficha. A semelhança é apresentada como relevância relativa, nunca como prova de causa comum.
- Consultas são auditadas sem guardar o texto pesquisado. Quando a API está indisponível ou não está configurada, a pesquisa continua por texto e filtros locais.
- O N0/N3 pode reindexar um documento aprovado ou colocar na fila todos os documentos aprovados ainda sem índice. Os erros de embeddings não anulam a aprovação.

## Como ativar localmente

1. Confirmar `OPENAI_API_KEY` no `.env` e, se necessário, `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`.
2. Reiniciar `npm run dev:all` para carregar o novo worker Redis.
3. Na Base de Conhecimento da planta, clicar em **Indexar aprovados** para documentos já aprovados antes desta fase. Aprovações novas entram automaticamente na fila.
4. Usar **Pesquisar ocorrências históricas**. A ausência de embeddings não bloqueia a pesquisa textual.

## Limites e validação pendente

- As quatro aprovações anteriores podem ser reindexadas localmente; não foi iniciada nenhuma chamada externa durante a implementação.
- A revisão dos textos extraídos continua necessária. O sanitizador reduz PII por rótulos e padrões; não é um classificador de entidades perfeito. Campos estruturados revistos minimizam o risco, mas a política de dados da organização deve continuar a reger o uso da API externa.
- O índice vetorial não tem HNSW; o conjunto atual é pequeno e pode usar ordenação exata.
- A validação real dos três relatórios de aceitação permanece pendente porque falta o Documento C esperado (`S-EWO_MAAP_08_FIRST AIDS_2025_03.pdf`).
- Fase 4 (ferramentas do agente) está implementada localmente; ver [incident-knowledge-phase-4.md](incident-knowledge-phase-4.md). A Fase 5 (sincronização operacional) está implementada localmente; ver [incident-knowledge-phase-5.md](incident-knowledge-phase-5.md).

## Verificações executadas

- Testes direcionados de pesquisa, privacidade, texto de embeddings e permissões: 11 testes passaram.
- `npx tsc --noEmit` continua a falhar em testes de outros módulos (tipos de mocks/fixtures preexistentes); não foram reportados erros nos ficheiros da Fase 3.
- Não foram executadas chamadas OpenAI nem criada uma nova migration nesta fase.
