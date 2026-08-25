# Revisão do módulo Competências e Autorizações

**Data:** 24/08/2026 · **Âmbito:** as 6 fases implementadas · **Método:** três passagens independentes — algoritmo de estado, permissões e integridade de dados, alertas e jobs

---

## Veredicto

A implementação é sólida e fiel à especificação. O algoritmo do §5 está correto passo a passo, com os comentários a apontar para as secções e um `do not reorder the steps below` que é exatamente o aviso certo. Os padrões que sinalizei como armadilhas foram todos evitados: não se usou `NotificationService.notify()`, o `sequenceNumber` é `max+1` e não `RecordCodeService`, a idempotência por `cycleKey` funciona, os destinatários reutilizam `SafetyCommunicationAlertRecipient` sem alterar o comportamento existente, e o comentário sobre o bypass N0/N1 no guard está lá.

Há, no entanto, **quatro defeitos críticos** e treze importantes. Dois dos críticos são de segurança e contornam regras que a especificação define como controlos de auditoria. Um dos importantes é uma **regressão em funcionalidade que já funcionava**.

Nada disto é retrabalho estrutural. São correções localizadas.

---

## ✅ O que passou

Registo explícito, porque interessa saber o que não é preciso revisitar.

| Ponto de risco | Estado |
|---|---|
| Ordem de precedência do §5 | Correta, passo a passo, com comentários a justificar as exceções |
| Passo 1 — competência não exigida com autorização ativa mostra estado real | Correto |
| Passo 4 — aptidão médica presente mas desativada | Correto, na posição exata do pseudocódigo |
| Datas em `Europe/Lisbon` com `differenceInCalendarDays` | Correto, no padrão de `action-alert-service.ts` |
| `sequenceNumber` como `max+1`, não `RecordCodeService` | Correto |
| `validUntil` nunca recalculada ao alterar o catálogo | Correto — verificado por grep em `lib/` e `app/` |
| `supersededById` — direção da relação | Correta; a direção contrária colidiria com o `@unique` |
| N5_OPERATOR restrito à própria ficha, no serviço | Correto, e a ligação `User.employeeDirectoryId` existe |
| Guard de concessão com comentário sobre o bypass | Correto, e explícito sobre N2/N4 |
| IDOR nos IDs principais (`competenceWorkerId`, `competenceTypeId`) | Coberto por `assertWorkerAndTypeInPlant` |
| `tx.notification.create()` + `tx.competenceAlertDelivery.create()` | Correto; `notificationId` fica preenchido |
| `cycleKey` mensal gerado em Europe/Lisbon, não UTC | Correto — 31/08 23:30 UTC dá `"2026-09"` |
| Bandas de expiração com `<=` e não igualdade | Correto para 90/60/30/7 (exceção em I7) |
| Reutilização de `SafetyCommunicationAlertRecipient` | Correta; extração sem mudança de comportamento |
| Registo do job nos três sítios (`queues`, `worker`, `scheduler`) | Correto, `0 8 * * *` em `ACTION_ALERT_TIMEZONE` |
| Canais `COMPETENCE_ALERT` / `COMPETENCE_URGENT` não trocados | Correto |
| Fase 0 — overrides no `globals.css` e correções ao `AGENTS.md` | Feito |

Melhorias que acrescentaste e que não estavam na especificação, e que valem: `blockedReason` como códigos estáveis em vez de texto livre, para localização; e `normalizeText` na comparação de `roleName`, que torna a resolução de requisitos insensível a acentos e maiúsculas.

---

## 🔴 Críticos — corrigir antes de produção

### 1. Separação de funções contornável por omitir um campo opcional

`lib/services/competence-service.ts:715` · `lib/validation/dtos.ts:772`

A verificação está no serviço, como pedido. Mas só corre se o cliente enviar `assessmentId`:

```ts
if (segregationOfDuties && input.assessmentId) {
```

E `assessmentId` é `.nullable().optional()`. O mesmo N3 que fez a avaliação prática concede a autorização omitindo o campo — o bloco nunca executa, a autorização fica válida na matriz, e o `AuditLog` não registra nada de anómalo. É precisamente o cenário que o §2.3 descreve como o caso que a regra existe para impedir.

Pior: os chamadores futuros que a especificação nomeia (job, importador, agente interno) são os mais prováveis de não preencher o campo.

**Correção** — resolver a avaliação a partir dos dados, não do input, dentro da transação:

```ts
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
  if (blocking) throw new CompetenceValidationError("SEGREGATION_OF_DUTIES", "…");
}
```

### 2. `trainingRecordId` e `assessmentId` aceitos sem validação de âmbito

`lib/services/competence-service.ts:660, 716-719, 749-750`

Três escritas gravam FKs vindas do cliente sem verificar planta nem trabalhador. O `findUnique` da separação de funções filtra **só por `id`**. Consequências, por ordem:

1. **Segundo contorno da separação de funções.** Passa-se o `assessmentId` de uma avaliação de outra planta, feita por outra pessoa. `assessorUserId !== actorUserId` → passa.
2. **Contorno do §2.4.** O passo 5 do algoritmo procura a formação de suporte *dentro dos registos do próprio trabalhador e tipo* (`trainingRecords.find(t => t.id === …)`). Um `trainingRecordId` de outra planta não é encontrado → `supportingTraining === null` → o teste de certificado caducado é saltado → a célula fica **VALID**. A regra "formação caducada invalida a autorização" deixa de se aplicar.
3. Referências entre plantas persistidas, visíveis na ficha e no PDF.

**Correção** — validar na transação, reutilizando a forma de `assertWorkerAndTypeInPlant`, que já está correta:

```ts
if (input.trainingRecordId) {
  const t = await tx.trainingRecord.findFirst({
    where: { id: input.trainingRecordId, plantId,
             competenceWorkerId: input.competenceWorkerId,
             competenceTypeId: input.competenceTypeId },
    select: { id: true },
  });
  if (!t) throw new CompetenceValidationError("TRAINING_NOT_FOUND", "…");
}
```

Igual para `assessmentId`, e o `findUnique` da separação de funções passa a `findFirst` com os mesmos filtros. Mesmo padrão em `registerAssessment:660`.

### 3. Uma segunda suspensão da mesma autorização nunca alerta

`lib/services/competence-alert-service.ts:384`

`cycleKey = authorization.id` para `AUTHORIZATION_SUSPENDED`. Mas `reactivateAuthorization` faz `SUSPENDED → ACTIVE` na mesma linha, sem criar autorização nova. Sequência: suspender (alerta enviado) → reativar → suspender outra vez → a chave já existe → P2002 → tratado como "já enviado" → **ninguém é avisado, sem log de erro**.

O raciocínio do §7.3 cobre renovações. Não cobre suspender/reativar/suspender — é uma lacuna da minha especificação, não da implementação.

**Correção** — incluir a ocorrência na chave:

```ts
cycleKey: `${authorization.id}:${authorization.suspendedAt?.toISOString() ?? ""}`
```

O `suspendedAt` é reescrito a cada suspensão. Manter `authorization.id` só para `AUTHORIZATION_REVOKED`, que é terminal.

### 4. Um erro transitório aborta os alertas de toda a planta, sem nova tentativa

`lib/services/competence-alert-service.ts:498-532` · `jobs/handlers/competence-expiry.ts` · `jobs/scheduler.ts:58-64`

O `try/catch` existe por destinatário, dentro de `dispatchToRecipients`. Tudo o que está antes — `loadWorkerTypeContext` e as três resoluções de destinatários — está desprotegido. Uma falha de rede ou de pool numa dessas queries propaga até ao handler, que não tem `try/catch`. Resultado:

- todas as linhas seguintes ficam sem alerta nesse dia;
- `dispatchMissingDocuments` está na **última** linha do ciclo, logo nunca corre;
- `upsertJobScheduler` não define `attempts`/`backoff` → o BullMQ não repete → o dia perde-se.

**Correção** — envolver o corpo do `for` num `try/catch` com `logger.error` e `continue`; mover `dispatchMissingDocuments` para fora do ciclo; e acrescentar ao job:

```ts
{ attempts: 3, backoff: { type: "exponential", delay: 60_000 } }
```

---

## 🟠 Importantes

### 5. Uma avaliação sem formação ligada deixa a célula presa em "Aguarda avaliação"

`lib/services/competence-state-service.ts:284-301`

O passo 7 exige `supportingTrainingValid`, que exige `supportingTraining` não nulo. Se a `CompetenceAssessment` tiver `trainingRecordId = null` — e é opcional no DTO — a avaliação é **ignorada** e cai para o passo 8, que devolve `AWAITING_ASSESSMENT`.

Efeito prático: um trabalhador já avaliado como competente aparece como "Aguarda avaliação". Registar outra avaliação sem ligar a formação não resolve. É o tipo de defeito que aparece como bug na primeira semana e custa uma tarde a diagnosticar.

**A culpa é da minha especificação**, que escreveu "se avaliação existe e formaçãoDeSuporte válida" assumindo que a ligação existe sempre. A implementação é fiel ao que estava escrito.

**Correção** — as duas metades:

```ts
// competence-state-service.ts, passo 7: avaliação sem formação ligada conta
const supportingTrainingValid = supportingTraining
  ? !(supportingTraining.certificateExpiresAt && isBeforeToday(...))
  : true;
```

E, do lado da escrita, tornar `trainingRecordId` obrigatório em `registerAssessment` quando `competenceType.requiresTraining === true`.

### 6. Nível 3 concedível sem níveis 1 e 2

`lib/services/competence-service.ts:706-758`

`grantAuthorization` não verifica `requiresTraining`, `requiresAssessment` nem `requiresAuthorization`. Uma autorização pode ser concedida a um trabalhador sem uma única formação registada, e a matriz mostra **VALID** — o passo 5 só olha para a autorização. Os três flags de `CompetenceType` influenciam a apresentação e nunca a escrita: o modelo de três níveis não é imposto do lado do servidor.

**Correção** — pré-condições na transação, guiadas pelos flags do `competenceType` já carregado. Resolve também metade do crítico 1, porque força a existência do `assessmentId`.

### 7. `AuthorizationStatus.EXPIRED` nunca é escrito

`lib/services/competence-service.ts:801-803` · `jobs/handlers/competence-expiry.ts`

O valor não aparece em nenhum ficheiro. A expiração é derivada na célula e nunca materializada na linha, logo uma autorização com `validUntil` no passado continua `ACTIVE` na base de dados. `suspendAuthorization` aceita-a → a célula passa a **SUSPENDED** (passo 3 ganha ao passo 5) → a expiração fica mascarada por uma medida cautelar e os alertas de expiração deixam de a apanhar. Explica também por que o `@@index([plantId, status, validUntil])` não tem consumidor.

**Correção** — no handler, antes do recálculo:

```ts
await prisma.workerAuthorization.updateMany({
  where: { plantId, status: ACTIVE, validUntil: { lt: startOfTodayLisbon } },
  data: { status: EXPIRED },
});
```

### 8. `writeAuditLog()` dentro da transação, com o cliente global

`lib/services/competence-service.ts:565, 614, 672, 767, 821, 883, 932, 1244`

`writeAuditLog` usa `prisma`, não `tx`. Chamado de dentro do callback, commita já e não faz rollback com a transação. Se ela falhar depois — e a corrida do `sequenceNumber` (item 9) é o caso concreto — fica um `AuditLog` "GRANTED" para uma autorização que não existe. Nas três operações que a especificação manda auditar, é o pior sítio para o ter.

O repositório já tem o precedente correto: `action-service.ts:233-236` fecha a transação e só depois escreve o audit log.

### 9. Corrida no `sequenceNumber`

`lib/services/competence-service.ts:738-751`

O `max+1` está dentro da transação, como pedido, mas em READ COMMITTED duas concessões concorrentes leem o mesmo máximo e a segunda aborta com P2002 — uma concessão legítima falha com 422 e a mensagem crua do Prisma. O repositório já tem a ferramenta: `action-service.ts:35-37` usa `pg_advisory_xact_lock`.

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`authorization:seq:${plantId}`}))`;
```

### 10. Conceder uma renovação levanta uma suspensão sem passar por "reativar"

`lib/services/competence-service.ts:730-736`

`previousCurrent` procura `status ∈ {ACTIVE, SUSPENDED}` e marca-a SUPERSEDED. Um N4 suspende por medida cautelar, um N3 anula essa suspensão concedendo uma autorização nova — a célula volta a VALID sem que ninguém tenha reativado nada, e o motivo da suspensão desaparece. A separação N4-suspende / N3-revoga fica com um caminho lateral.

O `findFirst` também não tem `orderBy`: se existir mais de uma linha ACTIVE/SUSPENDED, só uma é substituída, de forma não determinística.

### 11. Alerta "expira em 60 dias" enviado para células já EXPIRED

`lib/services/competence-alert-service.ts:509-522`

A condição não olha para `computed.state`. Mas o passo 5 devolve `EXPIRED` com `daysToExpiry` **positivo** quando o certificado de formação caducou — a autorização em si continua válida. Resultado: um trabalhador sem cobertura gera um e-mail tranquilizador ao N3, e queima o `cycleKey` daquela banda.

**Correção** — filtrar por `state === VALID || state === EXPIRING` antes de despachar.

### 12. `EXPIRY_DAY` com igualdade exata

`lib/services/competence-alert-service.ts:331-332`

É o único alerta com `daysToExpiry === 0`, e é o mais importante da série. Se o job não correr nesse dia, no dia seguinte devolve `null` e o alerta nunca chega — não há alerta de `EXPIRED` para o substituir. Combinado com o crítico 4, é plausível.

**Correção** — `daysToExpiry <= 0`, opcionalmente limitado a `>= -30`. O `cycleKey` já garante um envio único.

### 13. `ROLE_WITHOUT_COMPETENCE` nunca é despachado pelo job

`lib/services/competence-alert-service.ts:498-532`

Só é chamado em escritas (`recomputeCompetenceTypeStates`, `updateWorkerRole`). `recomputeAllStates`, que é o que o job corre, calcula os estados mas não recolhe as lacunas. Uma lacuna aberta é alertada uma vez, no dia da edição, e nunca mais. O `cycleKey` mensal fica sem propósito.

Nota: o §7.2 diz "na alteração de função ou matriz", pelo que a especificação é ambígua aqui. Mas a lógica do §7.3 pressupõe lembrete mensal.

### 14. `AWAITING_ASSESSMENT` não é um resumo, e é mensal e não semanal

`lib/services/competence-alert-service.ts:504, 524-526, 584-615`

O gate semanal existe e está correto (segunda-feira em Lisboa). Mas não há agregação: é uma notificação **e** um e-mail por cada par (trabalhador, competência) por destinatário. Num arranque com 80 avaliações pendentes, o responsável recebe 80 e-mails na mesma manhã. E com `cycleKey = "YYYY-MM"`, as segundas-feiras seguintes do mês são suprimidas — o comportamento efetivo é mensal.

**Correção** — agregar por destinatário numa única notificação, e usar `cycleKey` semanal (`YYYY-Www`).

### 15. Os alertas de competências expulsam os de repetibilidade e S-EWO do modal

`app/(secure)/app/[plant]/layout.tsx:118-132`

**Esta é uma regressão em funcionalidade que já funcionava.** O `findMany` é único para os três canais, com `orderBy: createdAt desc` e `take: 10`. O job diário cria facilmente dezenas de `COMPETENCE_ALERT` para um N3 na mesma manhã; sendo as mais recentes, ocupam os dez lugares e um `REPEATABILITY_ALERT` ou `SEWO_REJECTED` mais antigo **desaparece do modal** — e como o modal só marca como lido o que recebeu, fica em `UNREAD` invisível.

**Correção** — três queries com `take` próprio por canal, ou subir o `take` e priorizar por canal antes de cortar.

### 16. N+1 severo no job diário

`lib/services/competence-alert-service.ts:320-328, 544-551, 636`

Por cada célula em banda: três `findUnique` mais duas ou três `findMany` de destinatários. O `plant.findUnique` e o conjunto N3 são constantes por planta e são reconsultados linha a linha. Como as bandas são `<=`, o custo repete-se **todos os dias durante 90 dias por autorização**, incluindo uma transação que faz rollback e um INSERT que falha. Para 500 autorizações em banda e 3 destinatários: ~2500 leituras e ~3000 escritas falhadas por manhã. Os e-mails são enviados sequencialmente com `await` — 1500 e-mails a 1 s de SMTP são 25 minutos.

**Correção** — carregar `Map`s de planta, tipo, trabalhador e destinatários uma vez antes do ciclo, e fazer um `findMany` das entregas já feitas para saltar combinações, em vez de depender do P2002.

### 17. CRUD de requisitos fora de transação

`lib/services/competence-service.ts:1354-1367, 1379-1393`

`upsertRequirement` e `deactivateRequirement` fazem escrita → audit → recálculo como três operações independentes. Se o recálculo falhar, a regra fica gravada e todos os `isRequired` da planta ficam desatualizados sem sinal, até o job passar. É a mutação de maior alcance do módulo e a única sem transação.

---

## 🟡 Menores

Agrupados, com o ficheiro para localizar:

- **Testes de rota não verificam as listas de papéis** (`competence-authorizations-route.test.ts`) — `requirePlantAccess` é mockado, logo os casos "N2/N4 não podem conceder" passam sem afirmar nada sobre o array. Acrescentar `RoleCode.N2_PLANT_MANAGER` a `GRANT_ROLES` deixa a suite verde. É exatamente a regressão que o comentário do §2.3 tenta prevenir. Acrescentar `expect(...).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY])`.
- **`notificationId` não é afirmado nos testes de idempotência** — era a regra nº 1 da fase 4.
- **Falta teste de fronteira de mês em Lisboa** (`2026-08-31T23:30:00Z` → `"2026-09"`) e do cenário suspender→reativar→suspender.
- **Mensagens de erro internas devolvidas ao cliente** — um P2002 expõe nome de modelo e constraint. Criar `CompetenceValidationError`, no padrão de `ActionValidationError`.
- **`plantId` sem FK em cinco modelos novos** — corresponde aos snippets da especificação, mas não há garantia na base de dados de que coincida com `competenceWorker.plantId`, e é `WorkerCompetenceState.plantId` que alimenta o `groupBy` dos KPI. Rede de segurança em falta, não bug ativo.
- **`MISSING_DOCUMENT` não filtra inativos** — um trabalhador retirado do módulo gera o mesmo alerta todos os meses, para sempre.
- **`MISSING_DOCUMENT`: autorização nova no mesmo mês não alerta** — `authorizationId` não faz parte da `@@unique`. Usar `${authorization.id}:${YYYY-MM}`.
- **Alerta in-app sem link** — o `actionUrl` é calculado mas só vai para o e-mail. Dentro da aplicação, o alerta é um beco sem saída.
- **N0/N1 nunca veem o modal urgente** — `layout.tsx` exclui-os, a rota autoriza-os. Um administrador que seja destinatário fica sem o alerta.
- **Polling ativo com o módulo desligado** — `CompetenceUrgentAlert` renderiza sem consultar `moduleToggles`. Numa planta com o módulo off, cada sessão faz um pedido a cada 30 s.
- **Três overlays no mesmo `z-[100]`** — empilham sem ordem definida.
- **`createdAt` mostrado em UTC** no alerta urgente — uma hora errada no verão. Padrão copiado do componente de referência, mas continua errado.
- **`validFrom` sem limites** no DTO — aceita 1990 ou 2090; com `validityMonths` até 120 dá validade até 2100.
- **`loadWorkerTypeContext` não valida a planta** — `findUnique` por id sem verificar `plantId`.
- **`runDailyAlerts` depende de `this`** — quebra se destruturado. `action-alert-service.ts` não usa `this`.
- **`recomputeAndSaveState` lê `OccupationalHealthWorker` com o cliente global** (`:330`) em vez de `tx` — fora do snapshot da transação.

---

## Ordem sugerida

**Antes de produção** — críticos 1 a 4, mais os itens 5, 6, 7 e 15. O 15 porque é regressão em algo que já funcionava; os outros porque são contornos de controlos de auditoria ou defeitos visíveis ao utilizador na primeira semana.

**Na semana seguinte** — 8, 9, 10, 11, 12, 13, 16, 17. O 16 antes de a base de dados crescer.

**Backlog** — 14 e os menores. Os testes de papéis valem subir de prioridade: são a única rede que apanha mecanicamente a regressão que o §2.3 descreve.

---

## Correções a fazer também na especificação

Dois defeitos vieram de lá, não da implementação:

1. **§5, passo 7** — o pseudocódigo assume que uma avaliação tem sempre formação ligada. Deve ler "se avaliação competente existe e (não há formação ligada ou a formação ligada é válida)".
2. **§7.3** — o raciocínio do `cycleKey` cobre renovações mas não suspender/reativar/suspender. Deve dizer que os alertas de estado da autorização precisam da ocorrência na chave, não só do id.
