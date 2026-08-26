# Prompt — Requisitos por trabalhador, registo unificado e correção do estado

Quatro problemas reportados a 25/08/2026 sobre o módulo Competências, com as decisões já tomadas. Substitui a abordagem de requisitos por regras descrita no §3.2 da especificação.

## Os quatro problemas

| # | Sintoma | Causa |
|---|---|---|
| 1 | Tudo aparece "Não necessária", mesmo com formação e avaliação registadas | Passo 1 do algoritmo (§5) devolve `NOT_APPLICABLE` sem olhar para registos existentes. Defeito da especificação, não da implementação |
| 2 | As regras por departamento não resolvem | Resolvem por `areaId`, que está vazio; a coluna mostra o `dept` em texto e parece que devia bater |
| 3 | Três entradas de histórico por uma única formação | Formação, avaliação e autorização são registadas em formulários separados |
| 4 | "Segregation of duties" bloqueia a concessão | A regra está correta, mas assume que o avaliador é quem está autenticado — e a mensagem não está traduzida |

## Decisões tomadas

1. **Requisitos por trabalhador.** A matriz de regras por função/departamento/posto é **eliminada** do módulo Admin. O requisito passa a ser marcado trabalhador a trabalhador, na secção "Competências" da ficha individual.
2. **O avaliador passa a ser um campo.** A separação de funções mantém-se, mas compara o avaliador indicado no formulário com quem concede, em vez de assumir o utilizador autenticado.
3. **Formulário unificado.** Formação obrigatória; avaliação e autorização são secções opcionais do mesmo formulário, completáveis depois. Os estados "Aguarda avaliação" e "Aguarda autorização" mantêm-se vivos.

---

## Prompt

```
Lê docs/modulo-competencias-autorizacoes.md, em especial §3.2, §3.7, §5, §6.2
e §6.3. Este lote altera o desenho dos requisitos e do registo. Trabalha os
seis pontos por ordem — o 1 e o 2 são independentes, o 3 depende do 2.

═══ 1. CORREÇÃO DO ESTADO: registos existentes nunca podem ser escondidos ═══

lib/services/competence-state-service.ts, passo 1.

Hoje:
  const hasActiveAuthorization = input.authorizations.some(a => a.status === ACTIVE);
  if (!input.isRequired && !hasActiveAuthorization) return NOT_APPLICABLE;

Um trabalhador com formação PASSED e avaliação COMPETENT, sem autorização e sem
requisito, cai neste ramo e a célula lê "Não necessária" — esconde trabalho já
feito, que é o pior resultado possível. Passa a:

  const hasAnyRecord =
    input.authorizations.length > 0
    || input.trainingRecords.length > 0
    || input.assessments.length > 0;
  if (!input.isRequired && !hasAnyRecord) return NOT_APPLICABLE;

Regra em palavras: NOT_APPLICABLE só quando não é exigida E não existe
absolutamente nenhum registo. Qualquer registo força a mostrar o estado real.
Não alteres mais nada no algoritmo nem reordenes os passos.

Actualiza o comentário do passo 1 e acrescenta a tests/unit/competence-state.test.ts:
- formação PASSED + avaliação COMPETENT, isRequired false, sem autorização
  -> AWAITING_AUTHORIZATION (e não NOT_APPLICABLE)
- formação PASSED, isRequired false, requiresAssessment true
  -> AWAITING_ASSESSMENT
- sem registo nenhum, isRequired false -> NOT_APPLICABLE

═══ 2. REQUISITOS POR TRABALHADOR, e remoção da matriz de regras ═══

2.1 SCHEMA — tabela nova:

  model CompetenceWorkerRequirement {
    id                 String   @id @default(uuid())
    plantId            String
    competenceWorkerId String
    competenceTypeId   String
    isRequired         Boolean  @default(true)
    notes              String?
    setById            String?
    setAt              DateTime @default(now())
    updatedAt          DateTime @updatedAt

    competenceWorker CompetenceWorker @relation(fields: [competenceWorkerId], references: [id], onDelete: Cascade)
    competenceType   CompetenceType   @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)
    setBy            User?            @relation(fields: [setById], references: [id])

    @@unique([competenceWorkerId, competenceTypeId])
    @@index([plantId, isRequired])
  }

2.2 MIGRAÇÃO DE DADOS, antes de largar a tabela antiga:

  Para cada CompetenceRequirement ativo, cria CompetenceWorkerRequirement para
  os trabalhadores que hoje casariam com a regra:
  - âmbito ALL_WORKERS -> todos os CompetenceWorker ativos da planta
  - âmbito ROLE -> comparação de roleName com a mesma normalização de
    normalizeText() que resolveCompetenceRequirement usa hoje
  - âmbito AREA -> por areaId; E TAMBÉM, como fallback, por comparação
    normalizada do nome da Area com EmployeeDirectory.dept em texto. Sem este
    fallback a migração converte zero regras, porque nenhum trabalhador tem
    areaId preenchido — que é precisamente a causa do problema 2.
  - âmbito WORKSTATION -> por workstationId

  Escreve no log quantas regras foram convertidas, quantos requisitos por
  trabalhador foram criados, e quais as regras que não converteram nada.

2.3 REMOÇÃO:
  - modelos CompetenceRequirement e enum CompetenceRequirementScope do schema
  - app/api/plants/[plantCode]/admin/competence-requirements/route.ts
  - components/feature/competence-requirement-manager.tsx
  - a montagem no ecrã de admin, e as ternárias que buscavam
    listRequirements/getRequirementCoverage
  - CompetenceService.listRequirements, upsertRequirement,
    deactivateRequirement, getRequirementCoverage e o painel "Cobertura da
    matriz de requisitos"
  - tests/unit/competence-requirement-resolution.test.ts

  Substitui resolveCompetenceRequirement por uma leitura direta do
  CompetenceWorkerRequirement daquele par (trabalhador, tipo): isRequired
  vem da linha se existir, false se não existir. O requirementSource passa a
  ser o nome de quem marcou, ou null.

  NÃO removas CompetenceWorker.roleName — continua a alimentar a coluna FUNÇÃO
  e o filtro "Todas as funções". Deixa apenas de ser usado para requisitos.

2.4 UI — na ficha individual, secção "Competências"
    (components/feature/competence-worker-profile.tsx):

  Cada cartão de competência ganha uma caixa de seleção "Necessária para este
  trabalhador", que grava imediatamente e recalcula o estado daquela célula.
  Mostra também, em texto pequeno, quem marcou e quando.

  Acrescenta acima da grelha um resumo: "X de Y competências marcadas como
  necessárias", e um botão "Marcar todas" / "Desmarcar todas" para o arranque.

  Rota nova: app/api/plants/[plantCode]/competences/workers/[id]/requirements/route.ts
  Papéis de escrita: [N3_SAFETY, N4_SUPERVISOR] (quem conhece a função real do
  trabalhador), mais N0/N1 por bypass do guard. Valida sempre que o
  competenceWorkerId e o competenceTypeId pertencem à planta do URL.

  Ao marcar ou desmarcar, recalcula o WorkerCompetenceState daquele par na
  mesma transação.

═══ 3. FORMULÁRIO UNIFICADO: uma entrada por formação ═══

3.1 SCHEMA — agrupamento das três escritas:

  Acrescenta entryGroupId String? a TrainingRecord, CompetenceAssessment e
  WorkerAuthorization, com @@index([entryGroupId]) nas três. Quando as três (ou
  duas, ou uma) são criadas na mesma submissão, recebem o MESMO uuid. É este
  campo que o histórico usa para agrupar.

3.2 FORMULÁRIO — substitui os formulários separados no
    components/feature/competence-cell-detail-panel.tsx por um único, com três
    secções:

  A) FORMAÇÃO — obrigatória
     provider, trainerName, completedAt, durationHours, certificateNumber,
     certificateExpiresAt, result (PASSED|FAILED), notes, anexos

  B) AVALIAÇÃO PRÁTICA — opcional, colapsada por omissão
     assessedAt, method, result (COMPETENT|NOT_YET_COMPETENT), score,
     observations
     AVALIADOR — e é aqui que está a mudança que resolve o problema 4:
       escolha entre "utilizador da aplicação" (select de utilizadores da
       planta) e "avaliador externo" (campo de texto -> assessorName).
       NÃO assumas o utilizador autenticado. O campo é obrigatório se a
       secção for preenchida.

  C) AUTORIZAÇÃO — opcional, colapsada por omissão
     validFrom, restrictions, documento
     validUntil é calculado de CompetenceType.validityMonths, não pedido.
     A secção só fica ativa se a secção B estiver preenchida com result
     COMPETENT, quando competenceType.requiresAssessment for true. Se estiver
     desativada, explica porquê em texto, não a esconda.

  Uma única submissão, uma única prisma.$transaction(), um único entryGroupId,
  um único recálculo de estado no fim. Se só a secção A for preenchida, cria
  só o TrainingRecord — os estados "Aguarda avaliação" e "Aguarda autorização"
  continuam a acontecer, e os dois KPI do dashboard continuam a fazer sentido.

  Mantém a possibilidade de completar depois: com uma formação já registada, o
  mesmo painel permite acrescentar a avaliação e a autorização à MESMA
  entrada, reutilizando o entryGroupId existente em vez de criar um novo.

3.3 HISTÓRICO — na ficha individual e no painel de detalhe, agrupa por
    entryGroupId. Uma submissão = uma entrada, com as três fases listadas
    dentro dela e a data de cada uma. Registos antigos sem entryGroupId
    continuam a aparecer individualmente; não inventes agrupamentos
    retroativos.

═══ 4. SEPARAÇÃO DE FUNÇÕES: comparar o avaliador indicado ═══

  Em lib/services/competence-service.ts, a verificação de
  AUTHORIZATION_SEGREGATION_OF_DUTIES passa a comparar
  assessment.assessorUserId com o utilizador que concede. Regras:
  - assessorUserId igual a quem concede -> BLOQUEIA
  - assessorUserId diferente -> permite
  - avaliação com assessorName externo e assessorUserId nulo -> permite,
    porque quem avaliou não é utilizador da aplicação

  Mantém a resolução por dados que o crítico 1 do relatório de revisão pediu
  (não confiar no assessmentId do input), mas o critério passa a ser o
  assessorUserId da avaliação de suporte, não a simples existência de uma
  avaliação feita por quem concede.

  MENSAGEM: hoje aparece em inglês e crua no ecrã. Passa-a pelo dicionário de
  lib/ui-language.ts, nas 7 línguas, e devolve-a com um errorCode próprio
  (SEGREGATION_OF_DUTIES) para o componente a poder mostrar traduzida. Faz o
  mesmo varrimento aos outros erros do módulo que estejam a chegar ao ecrã em
  inglês.

═══ 5. ESTADOS VAZIOS ═══

  Com os requisitos a serem marcados um a um, um trabalhador recém-inscrito
  tem zero competências necessárias — e isso agora é o estado normal, não um
  erro. Na ficha individual, quando nenhuma competência está marcada, mostra
  uma linha a dizer que ainda não foi marcada nenhuma competência como
  necessária para este trabalhador, e o que isso significa (as células ficam
  "Não necessária" até serem marcadas).

  Mantém o estado vazio do catálogo que já existe, para quando não há
  CompetenceType nenhum.

═══ 6. ESPECIFICAÇÃO ═══

  Actualiza docs/modulo-competencias-autorizacoes.md:
  - §3.2: substitui CompetenceRequirement e os quatro âmbitos por
    CompetenceWorkerRequirement, e explica porquê (as regras por âmbito
    dependiam de roleName/areaId que na prática não estão preenchidos)
  - §5, passo 1: a nova condição com hasAnyRecord, e a razão
  - §2.3: a separação de funções compara o avaliador indicado, não o
    utilizador autenticado
  - §3.4/§3.5/§3.6: o entryGroupId e o formulário unificado
  - §6.2/§6.3: os ecrãs, sem a matriz de regras e com a marcação por
    trabalhador
  - §12: acrescenta estas quatro decisões à tabela das fechadas

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## O que esperar depois de correr

O Alexandre passa a mostrar Ponte Rolante como **Aguarda autorização** (tem formação e avaliação competente) e Empilhadores Certificada como **Aguarda avaliação** (tem só formação) — em vez de "Não necessária" nas seis.

A migração das três regras que criaste provavelmente converte pouco: são todas por Departamento e nenhum trabalhador tem `areaId`. O *fallback* por texto (`dept` = "Manutenção" ↔ Area "Manutenção") deve salvar as três, mas confirma no log quantos requisitos foram criados. Se der zero, marcas à mão — são três trabalhadores inscritos.

E a concessão de autorização deixa de te bloquear, desde que indiques um avaliador diferente de ti ou um avaliador externo. Se te indicares a ti mesmo, continua a bloquear — e nesse caso está a funcionar como deve.

## Uma consequência a assumir de propósito

Requisitos por trabalhador não escalam como regras: com 101 trabalhadores e 6 competências são 606 decisões, contra 6 regras. Foi a tua escolha e tem uma boa razão a favor — é explícito, auditável, e não depende de campos que não estão preenchidos. Mas vale saber onde dói: quando um trabalhador muda de função, ninguém é avisado de que os requisitos dele mudaram, porque não há regra a inferir isso. O alerta `ROLE_WITHOUT_COMPETENCE` perde o gatilho automático.

Se isso se tornar um problema, o caminho de volta não é reverter — é acrescentar um botão "aplicar o padrão do departamento X a este trabalhador" que pré-marca as caixas, mantendo a marcação individual como verdade. Fica registado para não ser preciso redescobrir.
