# MAxSafety — Knowledge Base de incidentes S-EWO — Fase 4

## Integração com o agente

O agente real regista cinco ferramentas de consulta, disponíveis para os perfis N0, N1, N2 e N3 dentro da planta resolvida no servidor:

- `search_historical_incidents`: pesquisa semântica e textual, com filtros por período, tipo, departamento, equipamento e causa confirmada.
- `find_similar_incidents`: procura ocorrências possivelmente semelhantes a partir de uma descrição, comunicação validada ou S-EWO aprovado.
- `get_incident_root_causes`: apresenta avaliações confirmadas, rejeitadas e incertas em grupos separados.
- `get_incident_corrective_actions`: apresenta ação, estado, prazo previsto, data real e página documental separadamente.
- `get_incident_lessons_learned`: consulta as lições registadas e a respetiva página.

Todas as pesquisas restringem a consulta à planta do contexto autenticado, a documentos aprovados e não arquivados. Não é possível indicar outra planta através do texto enviado ao agente. As comunicações de origem também têm de estar validadas na mesma planta; os S-EWO têm de estar aprovados ou fechados.

O agente recebe instruções para tratar o documento como evidência, citar o código S-EWO e a página quando disponíveis, separar causas confirmadas de outras avaliações e não apresentar relevância como probabilidade nem plano como ação concluída. Os resultados não incluem PDF, texto bruto, nomes de responsáveis ou campos clínicos. A pesquisa por nome pessoal isolado é recusada; narrativas de comunicações são filtradas antes de gerar embeddings.

Os links de fonte abrem o documento correspondente na Base de Conhecimento. Os eventos de auditoria registam planta, ferramenta, filtros e contagem de resultados, sem persistir o texto livre pesquisado.

## Configuração e limites

- As ferramentas são registadas nos modos de agente real OpenAI e Ollama. O modo mock continua a não consultar a Knowledge Base.
- Embeddings usam a configuração da Fase 3 (`OPENAI_API_KEY` e `OPENAI_EMBEDDING_MODEL`). Sem embeddings disponíveis, a ferramenta mantém a pesquisa textual e estruturada; a resposta do agente continua dependente do fornecedor de chat configurado.
- Não foi feita uma chamada real ao OpenAI nem um teste conversacional end-to-end com Ollama nesta fase.
- A sanitização é baseada em padrões e campos estruturados revistos; deve ser tratada como minimização, não como deteção perfeita de dados pessoais.

## Verificações executadas

- `npx vitest run tests/unit/agent-incident-knowledge-tools.test.ts tests/unit/agent-i18n.test.ts` — 8 testes passaram.
- ESLint nos ficheiros da integração — passou.
- `npx tsc --noEmit --pretty false` continua a reportar erros preexistentes em testes de outros módulos; após corrigir a inferência do novo fixture, não reporta erros nos ficheiros da Fase 4.

## Próxima fase

A sincronização operacional da Fase 5 está implementada localmente; ver [incident-knowledge-phase-5.md](incident-knowledge-phase-5.md).
