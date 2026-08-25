# Prompts de correção — Módulo Competências e Autorizações

Companheiro de `docs/revisao-modulo-competencias.md`. Seis lotes, agrupados por ficheiro para não conflitarem. Cola um de cada vez, com `npm run build && npm run test:unit` limpos entre eles.

**Lotes 1 a 3 bloqueiam produção.** Os lotes 4 a 6 são robustez, desempenho e testes — importantes, mas não impedem que o módulo entre em uso.

| Lote | Ficheiros principais | Resolve |
|---|---|---|
| 1 | `competence-service.ts`, `dtos.ts` | Críticos 1 e 2, itens 6 e 5 (escrita) |
| 2 | `competence-state-service.ts`, `layout.tsx` | Itens 5 (leitura) e 15 |
| 3 | `competence-alert-service.ts`, `jobs/` | Críticos 3 e 4, itens 11, 12, 13 |
| 4 | `competence-service.ts`, `competence-expiry.ts` | Itens 7, 8, 9, 10, 17 |
| 5 | `competence-alert-service.ts` | Itens 14 e 16 |
| 6 | `tests/unit/` e menores | Rede de regressão |

---

## Lote 1 — Bloqueadores de segurança e integridade

```
Lê docs/revisao-modulo-competencias.md. Corrige os críticos 1 e 2 e os itens
6 e 5 (metade da escrita). Tudo em lib/services/competence-service.ts e
lib/validation/dtos.ts. Não toques em mais nenhum ficheiro.

1. SEPARAÇÃO DE FUNÇÕES CONTORNÁVEL (crítico 1, competence-service.ts:715)

   A verificação está condicionada a `input.assessmentId`, que é opcional no
   DTO. Quem registou a avaliação concede a autorização omitindo o campo.
   Resolve a avaliação a partir dos DADOS, não do input, dentro da transação:

     if (segregationOfDuties) {
       const blocking = await tx.competenceAssessment.findFirst({
         where: {
           plantId,
           competenceWorkerId: input.competenceWorkerId,
           competenceTypeId: input.competenceTypeId,
           result: CompetenceAssessmentResult.COMPETENT,
           assessorUserId: actorUserId,
         },
         orderBy: { assessedAt: "desc" },
       });
       if (blocking) throw new CompetenceValidationError(...);
     }

   Mantém também a verificação por assessmentId quando ele vier preenchido —
   as duas somam-se, não se substituem.

2. FKs SEM VALIDAÇÃO DE ÂMBITO (crítico 2, linhas 660, 716-719, 749-750)

   grantAuthorization grava trainingRecordId e assessmentId sem verificar
   planta nem trabalhador, e o findUnique da separação de funções filtra só
   por id. Isto permite passar ids de outra planta, o que contorna a
   separação de funções E a regra do §2.4 (o passo 5 do algoritmo não
   encontra a formação, salta o teste de certificado caducado, e a célula
   fica VALID).

   Valida dentro da transação, antes do create, reutilizando a forma de
   assertWorkerAndTypeInPlant que já existe:

     if (input.trainingRecordId) {
       const t = await tx.trainingRecord.findFirst({
         where: { id: input.trainingRecordId, plantId,
                  competenceWorkerId: input.competenceWorkerId,
                  competenceTypeId: input.competenceTypeId },
         select: { id: true },
       });
       if (!t) throw new CompetenceValidationError(...);
     }

   Igual para assessmentId. Troca o findUnique da separação de funções por
   findFirst com os mesmos filtros. Mesmo padrão em registerAssessment:660
   para o input.trainingRecordId.

3. NÍVEL 3 SEM NÍVEIS 1 E 2 (item 6, linhas 706-758)

   grantAuthorization não verifica requiresTraining, requiresAssessment nem
   requiresAuthorization. Uma autorização é concedível a quem não tem uma
   única formação registada, e a matriz mostra VALID. Os três flags de
   CompetenceType só influenciam a apresentação — o modelo de três níveis
   não está imposto no servidor.

   Acrescenta pré-condições na transação, guiadas pelos flags do
   competenceType que já está carregado na linha 708:
   - requiresAuthorization === false: rejeita a concessão.
   - requiresTraining === true: exige um TrainingRecord com result = PASSED
     para aquele trabalhador e tipo.
   - requiresAssessment === true: exige uma CompetenceAssessment com
     result = COMPETENT para aquele trabalhador e tipo.
   Erros distintos e com mensagem explícita para cada caso.

4. LIGAÇÃO FORMAÇÃO-AVALIAÇÃO OBRIGATÓRIA (item 5, metade da escrita)

   Em registerAssessment, torna trainingRecordId obrigatório quando
   competenceType.requiresTraining === true. Valida-o com o mesmo padrão do
   ponto 2. Isto evita avaliações órfãs, que a metade da leitura (lote 2)
   passa a tolerar mas que não deviam existir de origem.

5. CLASSE DE ERRO PRÓPRIA

   Cria CompetenceValidationError no padrão de ActionValidationError
   (lib/services/action-service.ts:28-33) e usa-a em todas as validações
   deste lote. Nas rotas, devolve a mensagem só para esta classe; para
   qualquer outro erro devolve mensagem genérica, para não expor nomes de
   modelos e constraints do Prisma num P2002.

TESTES OBRIGATÓRIOS em tests/unit/competence-service.test.ts:
- conceder omitindo assessmentId, sendo o ator o avaliador, falha
- conceder com assessmentId de outra planta falha
- conceder com trainingRecordId de outro trabalhador falha
- conceder sem formação, com requiresTraining true, falha
- conceder sem avaliação competente, com requiresAssessment true, falha
- registar avaliação sem trainingRecordId, com requiresTraining true, falha

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Lote 2 — Defeitos visíveis ao utilizador

```
Lê docs/revisao-modulo-competencias.md. Corrige os itens 5 (metade da
leitura) e 15. Dois ficheiros: lib/services/competence-state-service.ts e
app/(secure)/app/[plant]/layout.tsx.

1. AVALIAÇÃO SEM FORMAÇÃO LIGADA (item 5, competence-state-service.ts:284-301)

   O passo 7 exige supportingTrainingValid, que exige supportingTraining não
   nulo. Se a avaliação tiver trainingRecordId = null, é IGNORADA e cai para
   o passo 8, que devolve AWAITING_ASSESSMENT. Efeito: um trabalhador já
   avaliado como competente aparece para sempre como "Aguarda avaliação", e
   registar outra avaliação não resolve.

   Uma avaliação sem formação ligada deve contar como válida:

     const supportingTrainingValid = supportingTraining
       ? !(supportingTraining.certificateExpiresAt
           && isBeforeToday(supportingTraining.certificateExpiresAt, zonedToday))
       : true;

   NÃO reordenes os passos nem alteres mais nada no algoritmo. Actualiza o
   comentário do passo 7 para registar a tolerância e porquê.

   Acrescenta a tests/unit/competence-state.test.ts: avaliação COMPETENT com
   trainingRecordId null, mais formação PASSED, com requiresAssessment true
   -> AWAITING_AUTHORIZATION (e não AWAITING_ASSESSMENT).

2. ALERTAS DE COMPETÊNCIAS EXPULSAM OS OUTROS (item 15, layout.tsx:118-132)

   Esta é uma REGRESSÃO em funcionalidade que já funcionava. O findMany é
   único para os três canais, com orderBy createdAt desc e take: 10. O job
   diário cria dezenas de COMPETENCE_ALERT numa manhã; sendo as mais
   recentes, ocupam os dez lugares e um REPEATABILITY_ALERT ou SEWO_REJECTED
   mais antigo desaparece do modal — e fica em UNREAD invisível, porque o
   modal só marca como lido o que recebeu.

   Faz uma query por canal, cada uma com o seu take (sugestão: 10 para
   REPEATABILITY_ALERT e SEWO_REJECTED, 10 para COMPETENCE_ALERT), concatena
   e ordena por createdAt desc antes de passar ao componente. Mantém o
   comportamento existente dos dois canais antigos exatamente como está.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Lote 3 — Alertas que desaparecem em silêncio

```
Lê docs/revisao-modulo-competencias.md e o §7 de
docs/modulo-competencias-autorizacoes.md. Corrige os críticos 3 e 4 e os
itens 11, 12 e 13. Ficheiros: lib/services/competence-alert-service.ts,
jobs/handlers/competence-expiry.ts, jobs/scheduler.ts.

1. SEGUNDA SUSPENSÃO NUNCA ALERTA (crítico 3, linha 384)

   cycleKey = authorization.id para AUTHORIZATION_SUSPENDED. Mas
   reactivateAuthorization faz SUSPENDED -> ACTIVE na MESMA linha, sem criar
   autorização nova. Sequência suspender -> reativar -> suspender: a chave já
   existe, o P2002 é tratado como "já enviado", e ninguém é avisado. Sem log.

   Inclui a ocorrência na chave:
     cycleKey: `${authorization.id}:${authorization.suspendedAt?.toISOString() ?? ""}`
   O suspendedAt é reescrito a cada suspensão (competence-service.ts:815).
   Mantém authorization.id sozinho para AUTHORIZATION_REVOKED, que é terminal.

   Teste: suspender, reativar, suspender outra vez -> dois alertas enviados.

2. ERRO TRANSITÓRIO ABORTA A PLANTA INTEIRA (crítico 4, linhas 498-532)

   O try/catch existe por destinatário, dentro de dispatchToRecipients. Tudo
   antes disso — loadWorkerTypeContext e as três resoluções de destinatários
   — está desprotegido. Uma falha de rede propaga até handleCompetenceExpiry,
   que não tem try/catch. Consequências: as linhas seguintes ficam sem
   alerta, dispatchMissingDocuments (última linha do ciclo) nunca corre, e o
   scheduler não define attempts/backoff, logo o dia perde-se.

   Três correções:
   a) Envolve o corpo do for de runDailyAlerts num try/catch com
      logger.error({ error, competenceWorkerId, competenceTypeId }) e continue.
   b) Move dispatchMissingDocuments para FORA do ciclo, com o seu próprio
      try/catch. O mesmo para o dispatch que acrescentares no ponto 5.
   c) Em jobs/scheduler.ts, acrescenta às opções do job de competências:
      { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }

3. "EXPIRA EM 60 DIAS" PARA CÉLULAS JÁ EXPIRED (item 11, linhas 509-522)

   A condição não olha para computed.state. Mas o passo 5 do algoritmo
   devolve EXPIRED com daysToExpiry POSITIVO quando o certificado de formação
   caducou — a autorização em si continua válida. Resultado: um trabalhador
   sem cobertura recebe um e-mail tranquilizador, e queima o cycleKey da banda.

   Filtra por estado antes de despachar:
     if ((computed.state === CompetenceCellState.VALID
          || computed.state === CompetenceCellState.EXPIRING)
         && computed.currentAuthorizationId
         && typeof computed.daysToExpiry === "number")

4. EXPIRY_DAY COM IGUALDADE EXATA (item 12, linhas 331-332)

   É o único alerta com daysToExpiry === 0, e é o mais importante da série.
   Se o job não correr nesse dia, no dia seguinte devolve null e o alerta
   nunca chega — não existe alerta de EXPIRED para o substituir.

   Passa a: if (daysToExpiry <= 0 && daysToExpiry >= -30) return EXPIRY_DAY;
   O cycleKey já garante um envio único por autorização.

5. ROLE_WITHOUT_COMPETENCE NUNCA DESPACHADO PELO JOB (item 13, linhas 498-532)

   dispatchRoleWithoutCompetence só é chamado em escritas. recomputeAllStates,
   que é o que o job corre, calcula os estados mas não recolhe as lacunas.
   Uma lacuna aberta é alertada uma vez, no dia da edição, e nunca mais — o
   cycleKey mensal fica sem propósito.

   Em runDailyAlerts, recolhe as células com
   computed.isRequired && computed.state === CompetenceCellState.MISSING
   num array e chama dispatchRoleWithoutCompetence no fim, fora do ciclo,
   com o seu try/catch. O cycleKey mensal já garante que não é diário.

6. Substitui os this.dispatch... por CompetenceAlertService.dispatch...
   (referência explícita, como em action-alert-service.ts, que não usa this).

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Lote 4 — Robustez transacional

```
Lê docs/revisao-modulo-competencias.md. Corrige os itens 7, 8, 9, 10 e 17.
Ficheiros: lib/services/competence-service.ts,
jobs/handlers/competence-expiry.ts, e possivelmente lib/audit.ts.

1. AuthorizationStatus.EXPIRED NUNCA É ESCRITO (item 7)

   O valor não aparece em nenhum ficheiro do repositório. A expiração é
   derivada na célula e nunca materializada na linha, logo uma autorização
   com validUntil no passado continua ACTIVE. suspendAuthorization aceita-a,
   e a célula passa a SUSPENDED — o passo 3 do algoritmo ganha ao passo 5, a
   expiração fica mascarada por uma medida cautelar, e os alertas de
   expiração deixam de a apanhar. É também por isto que o índice
   @@index([plantId, status, validUntil]) não tem consumidor.

   Em handleCompetenceExpiry, ANTES do recálculo de estados:
     await prisma.workerAuthorization.updateMany({
       where: { plantId, status: ACTIVE, validUntil: { lt: startOfTodayLisbon } },
       data: { status: AuthorizationStatus.EXPIRED },
     });
   Usa o helper de fuso que já existe em competence-state-service.ts. Calcula
   startOfTodayLisbon uma vez por execução.

   Rejeita também em suspendAuthorization e reactivateAuthorization quando o
   status for EXPIRED, com errorCode próprio.

   NOTA DE ARRANQUE: a primeira execução vai marcar como EXPIRED todas as
   autorizações já caducadas. Isso é o pretendido — confirma em prisma studio
   que o número faz sentido antes de considerares a correção terminada.

2. writeAuditLog DENTRO DA TRANSAÇÃO (item 8, linhas 565, 614, 672, 767, 821,
   883, 932, 1244)

   writeAuditLog usa o cliente global prisma, não tx. Chamado de dentro do
   callback, commita já e não faz rollback com a transação. Se ela falhar
   depois — e a corrida do sequenceNumber é o caso concreto — fica um
   AuditLog "GRANTED" para uma autorização que não existe.

   Segue o precedente do repositório: action-service.ts:233-236 fecha a
   transação e só depois escreve o audit log. Ou isso, ou dá a writeAuditLog
   um parâmetro client: Prisma.TransactionClient = prisma e passa tx.
   Escolhe uma e aplica-a de forma consistente às oito chamadas.

3. CORRIDA NO sequenceNumber (item 9, linhas 738-751)

   O max+1 está dentro da transação, mas em READ COMMITTED duas concessões
   concorrentes leem o mesmo máximo e a segunda aborta com P2002 — uma
   concessão legítima falha com 422.

   O repositório já tem a ferramenta: action-service.ts:35-37 usa
   pg_advisory_xact_lock. À entrada da transação, antes do findFirst:
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`authorization:seq:${plantId}`}))`;

4. RENOVAÇÃO LEVANTA UMA SUSPENSÃO SEM REATIVAR (item 10, linhas 730-736)

   previousCurrent procura status em {ACTIVE, SUSPENDED} e marca-a
   SUPERSEDED. Um N4 suspende por medida cautelar e um N3 anula essa
   suspensão concedendo uma autorização nova — a célula volta a VALID sem que
   ninguém tenha reativado, e o motivo da suspensão desaparece.

   Se previousCurrent.status === SUSPENDED, lança erro a exigir reativação
   explícita antes de conceder, com o motivo da suspensão na mensagem.
   Acrescenta orderBy: { grantedAt: "desc" } ao findFirst — hoje não tem, e
   se existir mais de uma linha ACTIVE/SUSPENDED só uma é substituída, de
   forma não determinística.

5. CRUD DE REQUISITOS FORA DE TRANSAÇÃO (item 17, linhas 1354-1367, 1379-1393)

   upsertRequirement e deactivateRequirement fazem escrita, audit e recálculo
   como três operações independentes. Se o recálculo falhar, a regra fica
   gravada e todos os isRequired da planta ficam desatualizados sem sinal, até
   o job passar. É a mutação de maior alcance do módulo e a única sem
   transação.

   Envolve escrita + recálculo numa $transaction (recomputeAndSaveState já
   aceita tx), com o audit log depois, conforme o ponto 2.

6. recomputeAndSaveState:330 lê OccupationalHealthWorker com o cliente global
   prisma em vez de tx, ao contrário das outras seis leituras da mesma
   função. Troca por tx.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Lote 5 — Desempenho do job diário

Faz este antes de a tabela crescer. Com 500 autorizações em banda e três destinatários, são ~2500 leituras e ~3000 escritas falhadas por manhã, todos os dias durante 90 dias por autorização.

```
Lê docs/revisao-modulo-competencias.md. Corrige os itens 16 e 14 em
lib/services/competence-alert-service.ts.

1. N+1 NO JOB DIÁRIO (item 16, linhas 320-328, 544-551, 636)

   Por cada célula em banda: três findUnique mais duas ou três findMany de
   destinatários. O plant.findUnique e o conjunto N3 são constantes por planta
   e são reconsultados linha a linha. Como as bandas são <=, o custo repete-se
   todos os dias. Os e-mails são enviados sequencialmente com await — 1500
   e-mails a 1 s de SMTP são 25 minutos de job.

   Antes do ciclo em runDailyAlerts, carrega uma vez:
   - a Plant
   - um Map de CompetenceType por id (loadActiveCompetenceTypes já existe)
   - um Map de CompetenceWorker por id, com employee e areaId
   - o conjunto de destinatários N3 e N2 da planta
   - um Map de destinatários por areaId
   - um findMany de CompetenceAlertDelivery já entregues nos cycleKeys
     relevantes, para SALTAR combinações em vez de depender do P2002

   Passa esse contexto a dispatchExpiryAlert e dispatchMissingDocuments em
   vez de loadWorkerTypeContext. Mantém loadWorkerTypeContext para os
   dispatches imediatos (suspensão/revogação), onde é uma chamada única.

2. AWAITING_ASSESSMENT NÃO É RESUMO (item 14, linhas 504, 524-526, 584-615)

   O gate semanal está correto (segunda-feira em Lisboa). Mas não há
   agregação: é uma notificação E um e-mail por cada par (trabalhador,
   competência) por destinatário. Num arranque com 80 avaliações pendentes, o
   responsável recebe 80 e-mails na mesma manhã. E com cycleKey "YYYY-MM", as
   segundas-feiras seguintes do mês são suprimidas — o comportamento efetivo
   é mensal, não semanal.

   Agrega por destinatário: uma única notificação e um único e-mail com todas
   as linhas do departamento. Usa cycleKey semanal (YYYY-Www derivado do
   zonedNow) para que a cadência semanal funcione de facto.

3. Enquanto estás aqui, dois menores no mesmo ficheiro:
   - MISSING_DOCUMENT não filtra inativos (linha 625): acrescenta
     competenceWorker: { isActive: true }, competenceType: { isActive: true }.
     Hoje um trabalhador retirado do módulo gera o mesmo alerta todos os
     meses, para sempre.
   - MISSING_DOCUMENT: authorizationId não faz parte da @@unique, logo uma
     autorização nova sem documento no mesmo mês não alerta. Usa
     cycleKey = `${authorization.id}:${monthlyCycleKey(referenceDate)}`.

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Lote 6 — Rede de regressão e menores

```
Lê docs/revisao-modulo-competencias.md, secção "Menores". Implementa:

1. TESTES DE PAPÉIS (o mais importante deste lote)

   Em tests/unit/competence-authorizations-route.test.ts, requirePlantAccess
   está totalmente mockado, logo os casos "N2 não pode conceder" e "N4 não
   pode conceder" passam sem afirmar NADA sobre o array passado ao guard. Se
   alguém acrescentar RoleCode.N2_PLANT_MANAGER a GRANT_ROLES, a suite
   continua verde — e é exatamente a regressão que o comentário do §2.3 do
   documento tenta prevenir.

   Acrescenta a cada caso:
     expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY]);
   E o equivalente nas rotas de formação e avaliação ([N3_SAFETY,
   N4_SUPERVISOR]) e de suspensão.

2. Em tests/unit/competence-alert-idempotency.test.ts:
   - afirma que notificationId é preenchido na CompetenceAlertDelivery (era a
     regra nº 1 da fase 4 e o objectContaining atual omite-o)
   - acrescenta um teste de fronteira de mês em Lisboa:
     2026-08-31T23:30:00Z deve dar cycleKey "2026-09"

3. Actualiza tests/unit/notifications-acknowledge-route.test.ts para os dois
   canais novos (COMPETENCE_ALERT e COMPETENCE_URGENT).

4. Menores de comportamento:
   - listUnreadUrgentAlerts não filtra notification.channel. Acrescenta
     notification: { channel: COMPETENCE_URGENT_CHANNEL }, como em
     action-alert-service.ts:412-413.
   - layout.tsx exclui N0/N1 de hasCompetenceUrgentAlerts, mas a rota
     autoriza-os. Um administrador que seja destinatário fica sem o alerta.
     Alinha os dois conjuntos de papéis.
   - CompetenceUrgentAlert é renderizado sem consultar moduleToggles. Numa
     planta com o módulo desligado, cada sessão faz um pedido a cada 30 s.
     Acrescenta && Boolean(moduleToggles.COMPETENCE_AUTHORIZATIONS) ao enabled.
   - Os três overlays (RepeatabilityAlertModal,
     SafetyCommunicationFloatingAlert, CompetenceUrgentAlert) estão todos em
     z-[100] e empilham sem ordem definida. Dá ao urgente um z-index superior.
   - competence-urgent-alert.tsx mostra createdAt em UTC. Usa o
     formatLisbonDate que já é usado no corpo do alerta.
   - dtos.ts: validFrom sem limites aceita 1990 ou 2090; com validityMonths
     até 120 dá validade até 2100. Acrescenta .min()/.max() de ±1 ano em
     torno de hoje.
   - loadWorkerTypeContext faz findUnique por id sem verificar plantId. Troca
     por findFirst com plantId.
   - AWAITING_ASSESSMENT devolve 0 em silêncio quando o trabalhador não tem
     areaId. Acrescenta logger.info, ou N3 como fallback.

5. Schema, rede de segurança: TrainingRecord, CompetenceAssessment,
   WorkerAuthorization, WorkerCompetenceState e CompetenceAlertDelivery têm
   plantId String sem relação plant Plant, ao contrário de CompetenceType,
   CompetenceRequirement e CompetenceWorker. Não é bug ativo — as rotas
   resolvem sempre pelo plantCode do URL — mas não há garantia na base de
   dados de que plantId coincida com competenceWorker.plantId, e é
   WorkerCompetenceState.plantId que alimenta o groupBy dos KPI. Acrescenta
   as relações e a migração.

6. CompetenceAlertDelivery: acrescenta @@index([plantId, alertType, sentAt]).
   A query de polling filtra userId + plantId + channel + alertType e o único
   índice secundário é [userId, alertType, sentAt].

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Verificação depois dos lotes 1 a 3

Antes de considerar o módulo pronto para utilizadores reais:

| Verificação | Resultado esperado |
|---|---|
| N3 que registou a avaliação tenta conceder, sem `assessmentId` | 403 ou 422, com mensagem sobre separação de funções |
| Conceder a um trabalhador sem formação registada | Rejeitado |
| Trabalhador com avaliação competente sem formação ligada | Célula lê "Aguarda autorização" |
| Suspender, reativar, suspender | Dois alertas, não um |
| Modal de alertas com muitos alertas de competências | Os alertas de repetibilidade e S-EWO continuam visíveis |
| Autorização a expirar hoje, job perdido ontem | Alerta chega hoje |
| Autorização com certificado de formação caducado | Célula "Expirada" e **nenhum** e-mail de "expira em N dias" |

---

## A especificação também precisa de correção

Dois dos defeitos vieram do documento, não da implementação. Eu corrijo-os em `docs/modulo-competencias-autorizacoes.md`:

1. **§5, passo 7** — o pseudocódigo assume que uma avaliação tem sempre formação ligada.
2. **§7.3** — o raciocínio do `cycleKey` cobre renovações mas não suspender/reativar/suspender.
