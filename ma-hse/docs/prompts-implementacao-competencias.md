# Prompts de implementação — Módulo Competências e Autorizações

Companheiro de `docs/modulo-competencias-autorizacoes.md`. Cada bloco é para colar tal como está, um de cada vez, na raiz do repositório `ma-hse`.

**Regra única:** não passes à fase seguinte sem o `npm run build` limpo e os testes a passar. Cada fase deixa a aplicação funcional — nenhuma delas deixa o repositório meio-quebrado.

---

## Fase 0 — Preparação (antes de qualquer código do módulo)

Duas correções ao repositório existente. São independentes do módulo e vale fazê-las primeiro, porque a fase 1 assenta nelas.

```
Duas correções no repositório, sem relação com features novas.

1. app/globals.css — o tema escuro (html[data-theme="black"]) tem overrides
   para bg-sky-100, text-sky-700, bg-slate-100, text-slate-500, bg-emerald-100,
   text-emerald-700, text-amber-700 e text-red-700, mas NÃO tem para
   bg-amber-100 nem bg-red-100. Acrescenta esses dois, coerentes com os
   vizinhos já existentes (bg-amber-50, bg-red-50, bg-rose-100).

2. AGENTS.md — duas afirmações estão erradas e induzem em erro quem lê:
   a) "Action sourceTypes: COMMUNICATION, SEWO, MANUAL" omite SMAT.
      O enum ActionSourceType tem quatro valores.
   b) "S3 file operations via presigned URLs (never direct upload)" é falso.
      Não existe getSignedUrl em nenhum ficheiro do repositório. O
      lib/storage-upload.ts documenta explicitamente a decisão oposta: os
      uploads passam sempre pelo servidor da app porque o endpoint de
      armazenamento não é alcançável do browser em produção. Corrige para
      descrever o que o código faz, mantendo a explicação do porquê.

Confirma com grep que getSignedUrl não existe antes de alterares o AGENTS.md.
```

**Verifica antes de avançar:** confirma que as `Area` da planta cobrem os departamentos dos trabalhadores que vais inscrever. Um trabalhador sem `Area` não tem destinatário de alerta na fase 4.

---

## Fase 1 — Schema, catálogo e matriz em leitura

```
Lê docs/modulo-competencias-autorizacoes.md e implementa APENAS a fase 1 do
faseamento do §10.

INCLUI:
- prisma/schema.prisma: os modelos CompetenceType (§3.1), CompetenceRequirement
  (§3.2), CompetenceWorker (§3.3) e WorkerCompetenceState (§3.7), mais os enums
  CompetenceCategory, CompetenceRequirementScope e CompetenceCellState. Acrescenta
  as relações inversas em Plant, User, Area, Workstation e EmployeeDirectory.
- Migração Prisma.
- prisma/seed.ts: os 4 CompetenceType do §3.1 por planta, todos com
  validityMonths: 12 e requiresAssessment: true. refresherMonths fica null.
- lib/modules.ts: chave COMPETENCE_AUTHORIZATIONS em DEFAULT_MODULE_TOGGLES
  (true), entrada em MODULE_OPTIONS, e competences -> COMPETENCE_AUTHORIZATIONS
  em PLANT_NAVIGATION_MODULES. MODULE_TOGGLE_KEYS e o schema Zod derivam
  automaticamente — não os alteres.
- app/(secure)/app/[plant]/layout.tsx: item de navegação "competences" logo
  depois de occupational-health, papéis [N0_ADMIN, N1_CORPORATE,
  N2_PLANT_MANAGER, N3_SAFETY, N4_SUPERVISOR, N5_OPERATOR].
- lib/ui-language.ts: modules.competences nas 7 línguas (pt "Competências",
  en "Competences", it "Competenze", pl "Kompetencje", de "Kompetenzen",
  ro "Competențe", fr "Compétences"), mais uma chave de topo "competences"
  com o dicionário do módulo nas mesmas 7 línguas. Atenção: o bloco "modules"
  é só rótulos de navegação; o dicionário do módulo é chave de topo separada,
  ao nível de "dashboard" e "communications".
- app/(secure)/app/[plant]/competences/page.tsx: server component, seguindo o
  padrão de occupational-health/page.tsx.
- components/feature/competence-matrix-manager.tsx: a matriz do §6.2 em leitura,
  com as colunas geradas a partir de CompetenceType (NÃO fixadas no código),
  os filtros do §6.2 e a legenda. Estados com cor + texto + ícone e aria-label
  completo, conforme §4. Sem painel de detalhe nesta fase.
- components/feature/add-competence-worker-modal.tsx: o modal do §6.2. Lista
  EmployeeDirectory da planta, mostra o campo dept (texto) como pista, e exige
  a escolha de uma Area por trabalhador num select. Seleção múltipla. Marca
  quem já está inscrito.
- lib/services/competence-service.ts: list da matriz e enroll (inscrição).
- lib/validation/dtos.ts: schemas Zod dos endpoints desta fase.
- app/api/plants/[plantCode]/competences/route.ts: GET matriz, POST inscrever.
- app/api/plants/[plantCode]/admin/competence-types/route.ts: CRUD do catálogo.

NÃO INCLUI (fases seguintes):
- TrainingRecord, CompetenceAssessment, WorkerAuthorization (§3.4-3.6)
- O algoritmo de estado do §5 — nesta fase todas as células são MISSING ou
  NOT_APPLICABLE
- Ecrã da matriz de requisitos, alertas, Ações, exportação, PDF

DETALHES QUE NÃO SE ADIVINHAM:
- CompetenceWorker aponta para EmployeeDirectory por FK real, e o areaId é
  atribuído no modal, não herdado do dept.
- A inscrição cria os CompetenceWorker e os WorkerCompetenceState iniciais
  numa única prisma.$transaction().
- Não uses o RecordCodeService para nada nesta fase.

CONVENÇÕES (§9): exportações nomeadas; server components por omissão;
"use client" só onde há interatividade; envelope {ok:true,data} /
{ok:false,errorCode,message} via lib/api.ts; requirePlantAccess() em todas
as rotas; parseBody() com Zod; prisma.$transaction() nas mutações;
writeAuditLog() nas operações críticas.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

**Estado esperado no fim:** a matriz existe, mostra os trabalhadores inscritos e tudo "Em falta" ou "Não necessária". Ainda não faz nada de útil — é o previsto.

---

## Fase 2 — Os três níveis e o algoritmo de estado

Esta é a fase que faz o módulo funcionar. É também a que tem mais armadilhas.

```
Continua o módulo de Competências. Lê docs/modulo-competencias-autorizacoes.md
e implementa a fase 2 do §10.

INCLUI:
- prisma/schema.prisma: TrainingRecord (§3.4), CompetenceAssessment (§3.5),
  WorkerAuthorization (§3.6), as duas tabelas de anexos, e os enums
  TrainingResult, CompetenceAssessmentMethod, CompetenceAssessmentResult,
  AuthorizationStatus. Migração.
- lib/services/competence-state-service.ts: o algoritmo do §5, exatamente na
  ordem de precedência escrita. É o núcleo do módulo.
- lib/services/competence-service.ts: registar formação, registar avaliação,
  conceder autorização, suspender, reativar, revogar.
- Rotas: competences/trainings (POST), competences/assessments (POST),
  competences/authorizations (POST), authorizations/[id]/suspend,
  authorizations/[id]/revoke.
- components/feature/competence-cell-detail-panel.tsx: painel lateral do §6.2,
  com a linha temporal dos três níveis e os botões permitidos pelo papel.
- app/(secure)/app/[plant]/competences/[workerId]/page.tsx e
  components/feature/competence-worker-profile.tsx: a ficha individual do §6.3.
- Os 6 cartões de KPI do §6.1, calculados a partir de WorkerCompetenceState.
- tests/unit/competence-state.test.ts: um caso por ramo do algoritmo, mais os
  limites em 0, 1, 90 e 91 dias, mais as mudanças de hora de março e outubro.

REGRAS QUE SE PERDEM SE NÃO FOREM EXPLÍCITAS:

1. PERMISSÕES (§2.3). Conceder e revogar autorizações:
     const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY]);
   Isto admite N3_SAFETY da planta e, por bypass global do guard,
   N0_ADMIN e N1_CORPORATE — comportamento INTENCIONAL. Põe um comentário
   a dizê-lo, porque quem ler [N3_SAFETY] vai concluir o contrário e
   "corrigir" o que está certo. N2_PLANT_MANAGER e N4_SUPERVISOR não podem
   conceder: basta não estarem na lista. Suspender admite também
   N2_PLANT_MANAGER e N4_SUPERVISOR. Registar formação e avaliação admite
   N3_SAFETY e N4_SUPERVISOR. N5_OPERATOR só vê a própria ficha — restringe
   no serviço, não só no UI.

2. SEPARAÇÃO DE FUNÇÕES. Parâmetro AUTHORIZATION_SEGREGATION_OF_DUTIES
   (SystemParameter, omissão true): quem registou a avaliação prática não
   pode conceder a autorização correspondente. Verificação no SERVIÇO, não
   só na rota, para que qualquer chamador futuro passe pelo mesmo bloqueio.

3. sequenceNumber. NÃO uses o RecordCodeService — ele só serve
   COMMUNICATION, SEWO e REPORT, e o seu campo "tipo" é um union fechado
   validado por isRecordCodeType(), que lança erro para valores novos.
   Replica o max+1 dentro da transação, como lib/services/action-service.ts
   faz para Action.sequenceNumber.

4. ORDEM DE PRECEDÊNCIA do §5. Avaliar de cima para baixo, primeiro que
   corresponde ganha. Dois pontos que não são óbvios:
   - Se a competência deixou de ser exigida mas há autorização ACTIVE,
     mostra-se o estado real, NÃO NOT_APPLICABLE.
   - Formação com certificado caducado torna a célula EXPIRED mesmo com a
     autorização ACTIVE na base de dados. Não é incoerência: é o registo
     formal a existir sem suporte. O painel de detalhe tem de explicar isto
     por palavras, ou vai ser reportado como bug.

5. APTIDÃO MÉDICA. Implementa o passo 4 do §5 (parâmetro
   MEDICAL_FITNESS_BLOCKS_AUTHORIZATION) mas com omissão FALSE, desativado.
   Tem de existir desde já, mesmo morto — ligá-lo mais tarde deve ser um
   true no SystemParameter, não uma alteração ao algoritmo. Quando ligado,
   lê apenas OccupationalHealthWorker.validUntil, nunca examDate nem status.

6. DATAS. toZonedTime para Europe/Lisbon e differenceInCalendarDays para a
   diferença, como lib/services/action-alert-service.ts. Diferença em
   milissegundos dá erros de um dia nas mudanças de hora.

7. RECALCULAR ESTADO. Em cada escrita de formação/avaliação/autorização,
   dentro da mesma transação. Limiar de EXPIRING de SystemParameter
   (COMPETENCE_EXPIRING_THRESHOLD_DAYS, valor 90) — não literal no código.

8. RENOVAÇÃO. Cada renovação cria uma WorkerAuthorization nova e marca a
   anterior como SUPERSEDED com supersededById. Nunca prolongues uma
   autorização existente.

9. validUntil é gravada em cada autorização no momento da concessão.
   Alterar CompetenceType.validityMonths afeta as PRÓXIMAS autorizações,
   nunca as já concedidas.

10. DOCUMENTOS. StorageService.uploadObject() com upload multipart/form-data
    através da rota Next, limite 15 MB (ATTACHMENT_UPLOAD_LIMITS). NÃO
    existem URLs pré-assinados neste repositório, ao contrário do que o
    AGENTS.md diz.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

**Estado esperado no fim:** o módulo funciona de ponta a ponta. Consegues registar formação, avaliar, autorizar, suspender e revogar, e a matriz reflete tudo.

---

## Fase 3 — Matriz de requisitos por função

```
Continua o módulo de Competências. Implementa a fase 3 do §10.

INCLUI:
- components/feature/competence-requirement-manager.tsx: ecrã de gestão da
  matriz de requisitos (§3.2), com os quatro âmbitos: ROLE, AREA,
  WORKSTATION, ALL_WORKERS.
- app/api/plants/[plantCode]/admin/competence-requirements/route.ts: CRUD.
- Resolução do requisito no competence-state-service.ts: uma competência é
  exigida se existir PELO MENOS UMA regra ativa que corresponda à função,
  área, posto ou a toda a planta. As regras somam-se, nunca subtraem —
  não há exceções negativas.
- Recálculo em massa dos WorkerCompetenceState quando uma regra muda ou
  quando o roleName de um trabalhador muda.
- KPI de cobertura da própria matriz de requisitos: quantas funções
  existentes já têm requisitos definidos.
- tests/unit/competence-requirement-resolution.test.ts: os quatro âmbitos,
  regras sobrepostas, e o caso do §5 em que a competência deixou de ser
  exigida mas há autorização ativa.

NOTA: o roleName de CompetenceWorker é a chave do âmbito ROLE. Se estiver
vazio para muitos trabalhadores, o ecrã deve dizê-lo — regras por função
não resolvem para quem não tem função registada.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

**Estado esperado no fim:** o cinzento da matriz passa a ser automático. Antes disto, "Não necessária" era suposição.

---

## Fase 4 — Alertas

```
Continua o módulo de Competências. Implementa a fase 4 do §10 e o §7 inteiro.

INCLUI:
- prisma/schema.prisma: CompetenceAlertDelivery (§3.8) e o enum
  CompetenceAlertType. Migração.
- lib/services/competence-alert-service.ts.
- jobs/handlers/competence-expiry.ts.
- jobs/queues.ts: competenceExpiryQueue — entrada em QUEUE_NAMES e o
  new Queue(...). jobs/worker.ts: linha no workerMap.
- jobs/scheduler.ts: upsertJobScheduler por planta, padrão "0 8 * * *",
  tz ACTION_ALERT_TIMEZONE — igual ao actionsOverdueQueue.
- app/(secure)/app/[plant]/layout.tsx: acrescenta "COMPETENCE_ALERT" ao
  channel: { in: [...] } do findMany de notificações que já lá está, e passa
  os resultados ao componente existente de alertas.
- components/feature/competence-urgent-alert.tsx e
  app/api/plants/[plantCode]/notifications/competences/route.ts: só para
  suspensão e revogação, canal COMPETENCE_URGENT, polling client-side de
  30 s no padrão do SafetyCommunicationFloatingAlert.
- tests/unit/competence-alert-idempotency.test.ts.

QUATRO REGRAS QUE DECIDEM SE ISTO FUNCIONA:

1. NÃO uses NotificationService.notify() para os alertas com rastreio.
   Ele usa createMany, que NÃO devolve ids — logo não consegues preencher
   CompetenceAlertDelivery.notificationId. Segue o padrão de
   lib/services/action-alert-service.ts: tx.notification.create() +
   tx.competenceAlertDelivery.create() na mesma transação, e
   sendNotificationEmail() chamada diretamente.

2. IDEMPOTÊNCIA por cycleKey (§7.3). Chave única:
   [competenceWorkerId, competenceTypeId, userId, alertType, channel, cycleKey]
   - Alertas ligados a uma autorização: cycleKey = authorizationId. Como
     cada renovação cria uma autorização nova, a chave muda sozinha e o
     alerta volta a poder ser enviado no ciclo seguinte.
   - Alertas sem autorização (MISSING_DOCUMENT, ROLE_WITHOUT_COMPETENCE,
     AWAITING_ASSESSMENT): cycleKey = "YYYY-MM". Lembrete mensal, não diário.
   Sem isto: ou o alerta de renovação nunca chega no ciclo seguinte porque a
   chave já existe, ou removem-se as restrições e passa a chegar todos os dias.

3. DESTINATÁRIOS (§7.2). Reutiliza SafetyCommunicationAlertRecipient — a
   tabela que já mapeia utilizador ↔ Area. Extrai a resolução de
   destinatários de safety-communication-alert-service.ts para uma função
   reutilizável, SEM alterar o comportamento existente. Não cries tabela
   nem ecrã de gestão novos.

4. GATILHOS E DESTINATÁRIOS conforme a tabela do §7.2. EXPIRING_90/60/30/7
   e EXPIRY_DAY pelo job diário; AUTHORIZATION_SUSPENDED e
   AUTHORIZATION_REVOKED imediatos na escrita; AWAITING_ASSESSMENT em
   resumo semanal, não diário.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

**Antes de ativar esta fase:** revê quem está hoje na lista de destinatários de comunicações de segurança. A partir daqui passam a receber também alertas de competências.

---

## Fase 5 — Ações a partir de lacunas, exportação e PDF

```
Continua o módulo de Competências. Implementa a fase 5 do §10 e o §8.

INCLUI:
- prisma/schema.prisma: valor COMPETENCE no enum ActionSourceType, e a
  tabela CompetenceActionLink (§3.8). Migração.
- Criar Ação a partir de uma lacuna, com o pré-preenchimento exato da
  tabela do §8. Ponto de entrada: painel de detalhe da célula e linha de
  lacuna do dashboard. Segue o padrão de
  components/feature/create-action-quick.tsx.
- lib/services/competence-export-service.ts: XLSX da matriz. O
  list-export-service.ts existente NÃO é genérico — tem builders hardcoded
  só para Communications e Actions. Reutiliza o padrão e o ExcelJS, não o
  serviço.
- app/api/plants/[plantCode]/competences/export/route.ts
- app/api/plants/[plantCode]/competences/authorizations/[id]/pdf/route.ts:
  PDF da autorização individual para assinatura, via
  lib/services/pdfkit-helper.ts (createPdfDocument).

REGRA IMPORTANTE: fechar a Ação NÃO altera o estado da célula. O estado só
muda quando existir o registo real de formação, avaliação ou autorização.
Fechar a ação administrativa não é o mesmo que o trabalhador estar
autorizado. O painel de detalhe mostra a Ação como resolvida, e a célula
mantém-se como está.

Usa a tabela de ligação CompetenceActionLink, seguindo o padrão de
SmatAuditActionLink, e não uma FK direta em Action.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Fase 6 — KPI no dashboard e vista corporate

```
Continua o módulo de Competências. Implementa a fase 6 do §10.

INCLUI:
- KPI de competências no dashboard de segurança da planta, no padrão de
  components/feature/safety-dashboard-kpi-groups.tsx.
- Vista corporate multi-planta em app/(secure)/app/corporate/, no padrão de
  components/feature/corporate-plant-manager.tsx: cobertura de autorizações
  obrigatórias por planta, e total de expiradas por planta.
- Suporte ao âmbito ALL_PLANTS: acrescenta "competences" a
  AGGREGATE_PLANT_MODULES em lib/plant-scope.ts se a matriz agregada fizer
  sentido, ou deixa de fora se não fizer — decide e justifica no commit.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Verificação entre fases

Depois de cada fase, antes de colar a seguinte:

| Verificação | Como |
|---|---|
| Build limpo | `npm run build` |
| Testes | `npm run test:unit` |
| Migração aplicada | `npx prisma studio` — as tabelas novas existem e têm as colunas certas |
| Módulo visível | Entra em `/app/maap/competences` com um utilizador N3 |
| Módulo desligável | Definições N0 → desliga `COMPETENCE_AUTHORIZATIONS` → o item de navegação desaparece |
| Permissões | Entra com N4 e confirma que não vê o botão de conceder autorização (fase 2+) |
| Tema escuro | Alterna para o tema `black` e confirma que amarelo e vermelho se leem |

Se alguma falhar, corrige antes de avançar. Uma fase construída sobre outra quebrada é o caminho mais rápido para desfazer tudo.
