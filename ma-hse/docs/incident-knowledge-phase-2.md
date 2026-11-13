# Knowledge Base de incidentes S-EWO — Fase 2

## Fluxo disponível

1. Abrir **Base de Conhecimento** dentro da planta.
2. N0 ou N3 da planta pode importar até cinco PDFs por lote, com limite de 15 MiB por ficheiro e 50 MiB no lote.
3. A aplicação valida o cabeçalho PDF, calcula SHA-256 e impede duplicados na mesma planta. O original fica no MinIO privado.
4. O worker extrai texto e páginas e, conforme `INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER`, preenche um rascunho estruturado com o Claude da Anthropic (`anthropic`) ou com um Ollama local (`ollama`). Com `disabled`, ou se a extração falhar, os campos ficam para preenchimento manual. Sem a variável definida mantém-se o comportamento anterior (Ollama local apenas quando `AGENT_PROVIDER=ollama`).
5. O N0/N3 compara o PDF e as evidências com os campos, causas e ações, corrige o conteúdo, guarda e aprova ou rejeita. A rejeição exige comentário.
6. A aprovação é auditada. Apenas documentos aprovados são visíveis para os perfis de consulta. Alterar documentos aprovados ou rejeitados requer uma nova revisão, preservando o histórico.

## Acesso e privacidade

- **N0_ADMIN**: gestão em todas as plantas, segundo o RBAC existente.
- **N3_SAFETY**: importação, PDF original, revisão e decisão na planta atribuída.
- **N1_CORPORATE** e **N2_PLANT_MANAGER**: consulta de documentos aprovados, no âmbito permitido pelo RBAC.
- Outros perfis não têm acesso.
- O PDF original e evidências textuais brutas são servidos apenas aos revisores N0/N3 e os acessos ao PDF são auditados.
- Perfis de consulta recebem texto filtrado e não recebem excertos brutos da extração.
- Com o provider `ollama`, a extração estruturada só chama Ollama em `localhost`/loopback.
- Com o provider `anthropic` (desde 2026-11-13), o texto do relatório é enviado à API da Anthropic, depois de sanitizado (`sanitizeIncidentKnowledgeExtractionText`): nomes, emails, telefones, números de trabalhador e datas de nascimento são removidos; as datas do incidente mantêm-se. O PDF original nunca é enviado. Validado localmente em 2026-11-13: relatório de 2 páginas extraído em cerca de 30 s (3 causas, 4 ações).
- A extração não envia o PDF para a API OpenAI. A OpenAI só é usada nos embeddings, depois da aprovação.

## Estados e falhas

- Extração: `UPLOADED` → `EXTRACTING` → `PENDING_REVIEW` → `APPROVED` ou `REJECTED`.
- Falhas transitórias podem ser repetidas pelo revisor; o estado do lote é recalculado a partir dos documentos para evitar contagem duplicada durante retries.
- PDFs sem camada de texto ficam em `FAILED`. O revisor pode completar manualmente os campos vendo o original. OCR automático não está configurado nesta fase.
- A coluna de ação mantém separadas a data prevista, a data real e o estado. O estado desconhecido continua disponível e não é inferido de uma data planeada.
- Causas guardam o código original, a versão de taxonomia e o estado `CONFIRMED`, `REJECTED` ou `UNCERTAIN`; a revisão não converte automaticamente categorias destacadas em causas raiz.

## Ativação da base local

A ativação local foi concluída em 2026-10-29:

- Foi criado e validado um backup PostgreSQL em `C:\HSE\backups\ehs-before-pgvector-20261029-071255.dump`, com backup separado dos papéis.
- O volume persistente `ma-hse_postgres_data` foi preservado.
- A imagem está fixada em `pgvector/pgvector:0.8.7-pg16-trixie`, compatível com Debian 13/glibc 2.41 da base existente. A variante Bookworm foi testada inicialmente, mas revertida antes de qualquer migração por apresentar uma versão de collation diferente.
- PostgreSQL 16.15 reporta a collation armazenada e atual como `2.41`.
- A extensão `vector` 0.8.7 está instalada.
- A migração `20261028120000_add_incident_knowledge_base` foi aplicada e `npx prisma migrate status` confirma que as 74 migrações estão atualizadas.

A app local usa a mesma base PostgreSQL, Redis e MinIO. Estado observado em 2026-10-29 na página `/app/MAAP/knowledge-base`:

- Quatro documentos estão em `APPROVED`: S-EWO-03, S-EWO-04, S-EWO-05 e S-EWO-07.
- Um documento está em `PENDING_REVIEW`: `S-EWO_08_MAAP_NEAR MISS_2026_04.pdf`.
- Um está em `EXTRACTING` e três estão em `UPLOADED`, todos ainda sem revisão.
- O conjunto de aceitação original está incompleto: o S-EWO-04 e o S-EWO-05 estão presentes; falta importar o `S-EWO_MAAP_08_FIRST AIDS_2025_03.pdf`. O documento S-EWO-08 de abril de 2026 é outro relatório e não o substitui.

### Extração local dos PDFs

- A primeira execução deixou os campos estruturados vazios porque o Qwen3 entrava em modo de raciocínio e excedia o timeout local.
- O pedido ao Ollama agora usa `reasoning_effort: none`, limita a resposta a 1.200 tokens e aguarda até 180 segundos.
- O código S-EWO e o tipo são extraídos do nome original do ficheiro; a data é lida junto do rótulo `DATE:` no texto do PDF, evitando confundir o código do formulário com o da ocorrência.
- Os rascunhos reprocessados foram revistos e quatro documentos chegaram a `APPROVED`; os restantes continuam sujeitos à revisão HSE no PDF original.
- A pré-visualização do PDF permite enquadramento apenas na mesma origem; as restantes rotas mantêm os cabeçalhos anti-iframe globais.

## Situação das fases seguintes

- **Fase 3 — Pesquisa:** implementada localmente; ver [incident-knowledge-phase-3.md](incident-knowledge-phase-3.md). A indexação automática inicia após aprovação. Os documentos aprovados anteriormente podem ser colocados na fila pelo botão **Indexar aprovados**.
- **Fase 4 — Agente:** implementada localmente; ver [incident-knowledge-phase-4.md](incident-knowledge-phase-4.md). As cinco ferramentas estão ligadas ao agente real OpenAI/Ollama e respeitam planta, aprovação e perfil.
- **Fase 5 — Integração operacional:** implementada localmente; ver [incident-knowledge-phase-5.md](incident-knowledge-phase-5.md). S-EWO aprovados/fechados são sincronizados após aprovação Corporate e reconciliados automaticamente no arranque/diariamente, de forma idempotente. Alterações e revogações atualizam o índice; PDFs históricos aprovados verificam duplicados operacionais.
- Existem testes unitários de PDF, extração, acesso e privacidade. Os testes de aceitação dos três documentos reais e da pesquisa/agente continuam pendentes.

Não repetir a troca de imagem ou aplicar migrations em produção sem backup, verificação do volume e validação da imagem do servidor.

## Verificações executadas nesta fase

- `npx prisma validate` — passou.
- Testes direcionados de PDF, extração estruturada, permissões, privacidade e progresso de lotes — passaram.
- A compilação TypeScript dos ficheiros da aplicação sem a pasta `tests` passou.
- A verificação global inclui erros existentes em testes de outros módulos; consultar o relatório do trabalho para os grupos de ficheiros afetados.
