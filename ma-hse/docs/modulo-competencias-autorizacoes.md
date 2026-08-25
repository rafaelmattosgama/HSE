# Módulo Competências e Autorizações — Especificação

**Projeto:** MA-HSE (MAx Safety) · **Versão:** 1.1 · **Data:** 24/08/2026
**Estado:** decisões de §2 fechadas com Luís Santos · pronto para fase 1
**Chave de módulo:** `COMPETENCE_AUTHORIZATIONS` · **Rota:** `/app/[plant]/competences`

---

## 1. Enquadramento e resposta à proposta inicial

A separação em três níveis que propuseste — **Formação → Competência → Autorização** — é a base correta e é exatamente a distinção que a maioria dos sistemas de gestão de formação não faz. Um trabalhador pode ter certificado de formação válido e não estar autorizado a operar; e pode estar autorizado com restrições. Mantém-se integralmente.

Esta especificação acrescenta cinco elementos que a proposta inicial não cobria e que, por experiência, são os que determinam se o módulo funciona ao fim de dois anos ou se se transforma numa folha de Excel dentro da aplicação:

| # | Acréscimo | Porquê |
|---|---|---|
| 1 | **Catálogo de competências em tabela**, não em enum | Hoje são 4 tipos. Vão ser 15 (empilhador retráctil, porta-paletes elétrico, espaços confinados, LOTO, trabalhos a quente, elétrico BT…). Com enum, cada tipo novo é uma migração de base de dados. Com tabela, é um registo de master data, configurável por planta. |
| 2 | **Matriz de requisitos por função** | É isto que distingue "Em falta" (vermelho) de "Não necessária" (cinzento). Sem esta matriz, as células cinzentas são preenchidas à mão e ficam desatualizadas no primeiro movimento interno. |
| 3 | **Autorização como registo com histórico**, não estado na célula | Quem autorizou, quando, com que validade, com que restrições, e o registo de suspensão/revogação com motivo. É este histórico que sustenta uma auditoria ou a investigação de um acidente. Um estado na célula não sustenta nada. |
| 4 | **Cache de estado derivado** (`WorkerCompetenceState`) | A matriz é o ecrã central. Calcular o estado de N trabalhadores × M competências a partir de 3 tabelas em cada carregamento não escala. O padrão já existe na aplicação: `OccupationalHealthWorker.status` é um campo guardado, não calculado. |
| 5 | **Separação de funções na autorização** | Quem faz a avaliação prática não deve ser quem concede a autorização formal. Controlo de auditoria configurável. |

Todas as afirmações sobre o código existente nesta especificação foram verificadas contra o repositório. Onde a convenção documentada no `AGENTS.md` divergia do código real, prevalece o código — e as divergências estão listadas no §13.

---

## 2. Decisões tomadas

| # | Questão | Decisão |
|---|---|---|
| 2.1 | Aptidão médica bloqueia autorização? | **Não, para já.** Parâmetro desligado, preparado para ligar no futuro |
| 2.2 | Departamento: texto livre ou entidade? | **Entidade `Area`**, os departamentos reais do Master Data da planta |
| 2.3 | Quem concede a autorização formal? | **`N3_SAFETY`**, mais `N0_ADMIN` e `N1_CORPORATE` por bypass global |
| 2.4 | Que validade manda na célula? | **A da autorização**, e formação caducada invalida-a |
| 2.6 | Trabalhadores externos? | **Fora do âmbito** |
| 2.7 | Quem define o catálogo de competências? | **`N3_SAFETY` da planta e `N1_CORPORATE`**. `N0_ADMIN` bloqueado. Nasce vazio, criado de raiz |
| 3.1 | Periodicidades | **12 meses para todas**, por agora; específicas por tipo mais tarde |
| 6.2 | Coluna "Turno" no modal | **Retirada** |
| 7.1 | Janela flutuante | **Server-side**, exceto suspensão/revogação |
| 7.2 | Destinatários de alertas | **Reutilizar** `SafetyCommunicationAlertRecipient` |

As secções seguintes registam o raciocínio e as consequências de implementação de cada uma.

### 2.1 Aptidão médica e autorização — não bloqueia, para já

Indicaste que o módulo deve usar os dados de Medicina do Trabalho **excluindo `examDate` e `status`**. Foi assim que está especificado: o módulo lê `birthDate`, `gender`, `hireDate`, `roleStartDate`, `roleName`, `nationality` e `workstationId` de `OccupationalHealthWorker`, e não lê o resultado do exame.

Implicação aceite: um operador de empilhador com aptidão médica caducada continuará a aparecer como **Válido** na matriz. Em Portugal, a formação de operadores de equipamentos está enquadrada pelo DL 50/2005 e a vigilância da saúde pelo regime geral de SST — são obrigações distintas, mas na prática a aptidão médica é condição de facto para operar.

> **Parâmetro:** `MEDICAL_FITNESS_BLOCKS_AUTHORIZATION` · **Valor atual:** `false`
> Quando ligado: aptidão caducada → célula passa a **Suspensa (motivo médico)**, a autorização **não** é revogada, e reativa automaticamente quando o exame é renovado.

**Requisito para poder ligar mais tarde sem refazer trabalho.** O passo 4 do algoritmo do §5 tem de existir desde a fase 1, mesmo desativado, e o job diário tem de recalcular o estado das células cujo trabalhador tem `OccupationalHealthWorker.validUntil` a passar. Se o passo só for acrescentado quando ligarem o parâmetro, ligar passa a ser uma alteração ao algoritmo e ao job — em vez de um `true` no `SystemParameter`. O custo agora é uma linha morta; o custo depois é uma migração de estados.

Nota: com o parâmetro desligado, o módulo continua a **não ler** `examDate` nem `status`, conforme §3.3. Quando ligarem, passa a ler apenas `validUntil` — nunca o resultado clínico do exame.

### 2.2 Departamento — entidade `Area`

Existe uma ambiguidade real no código atual que afeta diretamente o teu requisito de destinatários de alertas:

- `EmployeeDirectory.dept` é **texto livre** (`String?`)
- `SafetyCommunicationAlertRecipient` encaminha alertas por **`Area`** (entidade com FK)

**Decisão:** os departamentos são as `Area` do Master Data da planta. O módulo guarda `areaId` (FK para `Area`) em `CompetenceWorker` e a coluna "Departamento" na matriz mostra o nome da `Area`, localizado via `localizeMasterDataRows(MasterDataEntityType.AREA, …)` como no resto da aplicação. `EmployeeDirectory.dept` fica como *fallback* de leitura para trabalhadores ainda sem `areaId` atribuído.

Combinada com a decisão 7.2, isto fecha o encaminhamento de alertas: o responsável de departamento resolve-se pelo mapeamento utilizador ↔ `Area` que já existe em `SafetyCommunicationAlertRecipient`, sem tabela nova.

**Consequência na inscrição.** Ao adicionar um trabalhador, o `areaId` não vem de lado nenhum automaticamente — `EmployeeDirectory` só tem `dept` em texto. Duas opções para a fase 1:

- **Atribuir no modal de inscrição** (recomendado): o modal mostra o `dept` em texto como pista e pede a `Area` num select. Explícito, e obriga a olhar uma vez para cada trabalhador.
- Tentar correspondência automática por nome entre `dept` e `Area.name`, com revisão manual do que não casar. Mais rápido no arranque, mas silenciosamente errado quando os nomes divergem — e vão divergir.

### 2.3 Quem concede a autorização formal — `N3_SAFETY`, `N1_CORPORATE` e `N0_ADMIN`

A autorização é o ato pelo qual a empresa assume a responsabilidade. Fica no papel de Segurança da planta, com os dois papéis globais a poder intervir.

| Papel | Ver matriz | Registar formação | Registar avaliação | **Conceder autorização** | Suspender | Revogar | Catálogo e requisitos (§2.7) |
|---|---|---|---|---|---|---|---|
| `N5_OPERATOR` | própria ficha | — | — | — | — | — | — |
| `N4_SUPERVISOR` | ✓ | ✓ | ✓ | **—** | ✓ | — | — |
| `N3_SAFETY` | ✓ | ✓ | ✓ | **✓** | ✓ | ✓ | **✓** |
| `N2_PLANT_MANAGER` | ✓ | — | — | **—** | ✓ | — | — |
| `N1_CORPORATE` | ✓ | ✓ | ✓ | **✓** | ✓ | ✓ | **✓** |
| `N0_ADMIN` | ✓ | ✓ | ✓ | **✓** | ✓ | ✓ | **bloqueado** |
| `MEDICO` | — | — | — | — | — | — | — |

A última coluna é a única em que o `N0_ADMIN` é bloqueado em vez de admitido. A razão está no §2.7, e a implementação exige uma verificação explícita, porque o guard dá-lhe passagem incondicional.

`N4_SUPERVISOR` pode suspender mas não revogar: suspender é uma medida cautelar imediata que quem está no terreno tem de poder tomar; revogar é definitivo e fica com quem concede. `N2_PLANT_MANAGER` pode suspender pela mesma razão, mas não registar formação nem avaliações — não é o seu papel operacional.

#### Implementação: o guard já faz exatamente isto

Detalhe verificado no código, e que aqui joga a favor. Em `lib/rbac/guards.ts`, `requirePlantAccess` devolve mais cedo para `N0_ADMIN` (linhas 36-39) e `N1_CORPORATE` (41-44), **antes** de chegar à linha que valida `allowedRoles.includes(entry.role)` (46). E em `lib/rbac/evaluator.ts`, `hasPlantAccess` devolve `true` para `N0_ADMIN` sem olhar para `allowedRoles` (14-16) e para `N1_CORPORATE` desde que a lista contenha algo que não seja `N0_ADMIN` (18-23).

Ou seja, uma linha dá a regra decidida, sem verificação adicional:

```ts
// app/api/plants/[plantCode]/competences/authorizations/route.ts
// Admite N3_SAFETY da planta; N0_ADMIN e N1_CORPORATE passam por bypass
// global do guard — comportamento intencional, ver §2.3.
const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY]);
if ("error" in auth) return auth.error;
```

O comentário não é decoração: sem ele, alguém que leia `[RoleCode.N3_SAFETY]` conclui que N0/N1 estão excluídos e acrescenta uma verificação que quebra a regra. É a leitura errada mais natural deste guard, e vale prevenir por escrito.

Para os papéis que **não** devem conceder — `N2_PLANT_MANAGER` e `N4_SUPERVISOR` — não é preciso nada: não estão na lista e não têm bypass.

> **Parâmetro:** `AUTHORIZATION_SEGREGATION_OF_DUTIES` · **Omissão:** `true`
> O utilizador que registou a avaliação prática não pode conceder a autorização correspondente. Continua a fazer sentido, porque um N3 pode registar avaliações — e é precisamente esse o caso que a regra impede. Com N1 também a poder conceder, o impasse desaparece: numa planta com um único N3, quando ele próprio fez a avaliação, o N1 concede. Verificação no **serviço** (`competence-service.ts`), não só na rota, para que qualquer chamador futuro — job, importador, agente interno — passe pelo mesmo bloqueio.

### 2.4 Validade — manda a da autorização

São duas datas diferentes:

- **Certificado de formação** tem validade própria (definida pela entidade formadora, ou inexistente)
- **Autorização** tem validade definida pela empresa (`CompetenceType.validityMonths`)

**Decisão:** a célula mostra a validade da **autorização**. Se o certificado de formação caducar antes, a célula passa a **Expirada (formação caducada)** independentemente da autorização, porque a autorização deixou de ter suporte. Está no passo 5 do algoritmo do §5.

Consequência a antecipar: quando a formação caduca, a autorização fica com `status = ACTIVE` na base de dados mas a célula lê **Expirada**. Não é incoerência — é a distinção entre o registo formal (que continua a existir e a ter data de fim) e a validade efetiva (que perdeu suporte). O painel de detalhe deve dizer isto por palavras, ou alguém vai reportar como bug.

### 2.5 Renovação: nova autorização ou prolongamento?

**Recomendação: nova autorização.** Cada renovação cria um registo novo em `WorkerAuthorization` e o anterior passa a `SUPERSEDED`. Vantagens: histórico completo preservado, e a chave de idempotência dos alertas (§7.3) fica naturalmente por ciclo — sem isto, o alerta de 30 dias de 2026 e o de 2031 colidem na mesma chave única.

### 2.7 Quem define o catálogo de competências — `N3_SAFETY` e `N1_CORPORATE`, nunca `N0_ADMIN`

O catálogo (`CompetenceType`) e a matriz de requisitos (`CompetenceRequirement`) pertencem à planta. Quem os define é o **`N3_SAFETY` dessa planta**, no módulo Admin da planta, com o `N1_CORPORATE` a poder intervir. O **`N0_ADMIN` está explicitamente bloqueado** de criar ou editar: é um papel de administração de sistema, não de segurança industrial, e não lhe compete decidir que competências uma fábrica exige.

**O catálogo nasce vazio e é criado de raiz.** Sem valores por omissão, sem sugestões, sem pré-preenchimento no fluxo de criação de plantas. A autoria de cada tipo de competência é de uma pessoa identificada, registada no `AuditLog` — não do sistema.

> **Consequência que obriga a um requisito.** Toda a planta nova entra no módulo com a matriz sem colunas. Sem um estado vazio explícito no ecrã da matriz, a única leitura possível é "o módulo está avariado" — foi exatamente o que aconteceu na `maap`. O estado vazio deixa de ser um detalhe de acabamento e passa a ser parte do caminho normal de arranque.

Nota sobre o `prisma/seed.ts`: continua a criar os quatro tipos, mas **apenas** para as plantas de demonstração (`pl01`, `pl02`, `pl1`), que são fixtures de desenvolvimento a par das comunicações e S-EWO fictícios. Não se propaga ao fluxo de criação de plantas reais.

### 2.6 Trabalhadores externos — fora do âmbito

Confirmou-se por busca no schema, no seed e nas 46 migrações que **não existe hoje nenhum modelo de formação, competência, autorização, certificado ou qualificação** — o módulo não duplica nada. Mas há um vizinho com sobreposição parcial que é preciso delimitar.

`ExternalWorkerDocument` cobre já trabalhadores de empresas externas, com `type ∈ {MEDICAL_FITNESS, PPE_DELIVERY, TRAINING}`, `fileKey`, `validUntil`, `approvalStatus`, `reviewedByUserId` e `reviewedAt`. É o precedente mais próximo do que se propõe em §3.6 — mas tem `@@unique([workerId, type])`, ou seja, guarda **um** documento por tipo e não tem histórico. É exatamente a limitação que o §1 item 3 procura evitar.

**Decisão:** fora do âmbito. A formação de contratados continua em Contratados, com o seu próprio fluxo de aprovação, e este módulo trata só de `EmployeeDirectory`. Convergir os dois é um projeto por si.

Consequência a assumir de propósito: um contratado que opere um empilhador na fábrica não aparece nesta matriz. Se isso vier a ser um requisito de auditoria, a convergência faz-se acrescentando `externalWorkerId` (nullable, alternativo a `employeeDirectoryId`) a `CompetenceWorker` — que é a razão para não pôr `employeeDirectoryId` como parte de uma chave primária composta.

---

## 3. Modelo de dados

Prisma, seguindo as convenções do `schema.prisma` atual: `uuid()` como id, `plantId` em todas as entidades de planta, `@@unique([plantId, code])` em master data, `isActive` para desativação lógica, `sourceLanguage` onde há tradução automática.

### 3.1 Catálogo de competências (master data)

```prisma
model CompetenceType {
  id                     String   @id @default(uuid())
  plantId                String
  code                   String   // FORKLIFT, MEWP, OVERHEAD_CRANE, WORK_AT_HEIGHT
  name                   String
  category               CompetenceCategory @default(EQUIPMENT_OPERATION)
  requiresTraining       Boolean  @default(true)
  requiresAssessment     Boolean  @default(true)   // avaliação prática obrigatória
  requiresAuthorization  Boolean  @default(true)
  validityMonths         Int      @default(12)     // validade da autorização
  refresherMonths        Int?                      // reciclagem intermédia
  legalReference         String?                   // ex.: "DL 50/2005"
  displayOrder           Int      @default(0)
  isActive               Boolean  @default(true)
  sourceLanguage         String?

  plant                  Plant    @relation(fields: [plantId], references: [id], onDelete: Cascade)
  requirements           CompetenceRequirement[]
  trainingRecords        TrainingRecord[]
  assessments            CompetenceAssessment[]
  authorizations         WorkerAuthorization[]
  states                 WorkerCompetenceState[]

  @@unique([plantId, code])
  @@index([plantId, isActive, displayOrder])
}

enum CompetenceCategory {
  EQUIPMENT_OPERATION   // empilhador, ponte rolante, plataforma
  HIGH_RISK_ACTIVITY    // trabalhos em altura, espaços confinados, trabalhos a quente
  SAFETY_ROLE           // primeiros socorros, equipa de emergência
  LEGAL_MANDATORY       // formação obrigatória geral
  OTHER
}
```

**Seed inicial** (`prisma/seed.ts`), alinhado com os quatro tipos que indicaste:

| code | name (pt) | category | requiresAssessment | validityMonths |
|---|---|---|---|---|
| `FORKLIFT` | Empilhador | `EQUIPMENT_OPERATION` | `true` | 12 |
| `MEWP` | Plataforma elevatória | `EQUIPMENT_OPERATION` | `true` | 12 |
| `OVERHEAD_CRANE` | Ponte rolante | `EQUIPMENT_OPERATION` | `true` | 12 |
| `WORK_AT_HEIGHT` | Trabalhos em altura | `HIGH_RISK_ACTIVITY` | `true` | 12 |

**Decisão 3.1: 12 meses para todas, por agora.** As periodicidades específicas por tipo são definidas mais tarde, no ecrã de gestão do catálogo — sem migração, porque `validityMonths` é um campo editável por planta. É exatamente o caso de uso que justifica o catálogo em tabela (§1, item 1).

Três consequências de arrancar com 12 meses que vale ter presentes:

1. **Um quarto do ciclo de vida passa em amarelo.** Com validade de 12 meses, o limiar de `EXPIRING` de 90 dias cobre 25% da vida da autorização, e cada autorização dispara quatro avisos por ano em vez de um a cada cinco anos. A tentação é baixar o limiar para 60 dias — **não o faças**: os teus KPI pedem os cortes a 30/60/90 e os alertas também, e um limiar de 60 deixaria o balde dos 90 dias sempre vazio. Mantém 90 e mantém a coerência. Se a dessensibilização se tornar um problema real, o que se corta é o alerta dos 90 dias (não o estado da célula), e só enquanto a periodicidade for de 12 meses.
2. **Alterar `validityMonths` depois não deve recalcular autorizações já concedidas.** A `validUntil` é gravada em cada `WorkerAuthorization` no momento da concessão — mudar o catálogo afeta as próximas, não as existentes. Isto é deliberado: uma autorização assinada com uma data não muda de data porque alguém editou uma configuração. O ecrã de gestão do catálogo deve dizê-lo.
3. **Reciclagem intermédia perde sentido a 12 meses.** O campo `refresherMonths` fica a `null` por agora; volta a ser útil quando as periodicidades subirem.

> As periodicidades não estão fixadas na lei portuguesa de forma uniforme — dependem do fabricante do equipamento, da avaliação de risco e frequentemente da seguradora. Vale confirmar com HSE/jurídico antes de fixar os valores definitivos.

### 3.2 Matriz de requisitos — o que resolve o cinzento

```prisma
model CompetenceRequirement {
  id                String   @id @default(uuid())
  plantId           String
  competenceTypeId  String
  scopeType         CompetenceRequirementScope
  scopeRoleName     String?   // quando scopeType = ROLE
  scopeAreaId       String?   // quando scopeType = AREA
  scopeWorkstationId String?  // quando scopeType = WORKSTATION
  isMandatory       Boolean  @default(true)
  notes             String?
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  createdById       String?

  plant             Plant           @relation(fields: [plantId], references: [id], onDelete: Cascade)
  competenceType    CompetenceType  @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)
  area              Area?           @relation(fields: [scopeAreaId], references: [id], onDelete: Cascade)
  workstation       Workstation?    @relation(fields: [scopeWorkstationId], references: [id], onDelete: Cascade)

  @@index([plantId, competenceTypeId, isActive])
}

enum CompetenceRequirementScope {
  ROLE          // por função (roleName)
  AREA          // por departamento/área
  WORKSTATION   // por posto de trabalho
  ALL_WORKERS   // toda a planta
}
```

**Resolução:** uma competência é exigida a um trabalhador se existir *pelo menos uma* regra ativa que corresponda à sua função, área, posto ou a toda a planta. Regras adicionam-se, nunca se subtraem — não há exceções negativas, para evitar matrizes impossíveis de auditar. Uma dispensa individual é registada como `CompetenceRequirementException` se e quando for necessário (fora do âmbito da v1).

### 3.3 Trabalhador inscrito no módulo

```prisma
model CompetenceWorker {
  id                  String   @id @default(uuid())
  plantId             String
  employeeDirectoryId String                    // origem: Plant Master Data → Trabalhadores
  areaId              String?                   // departamento como entidade (ver §2.2)
  roleName            String?                   // função — alimenta a matriz de requisitos
  isActive            Boolean  @default(true)
  addedById           String?
  addedAt             DateTime @default(now())
  updatedAt           DateTime @updatedAt

  plant               Plant             @relation(fields: [plantId], references: [id], onDelete: Cascade)
  employee            EmployeeDirectory @relation(fields: [employeeDirectoryId], references: [id], onDelete: Cascade)
  area                Area?             @relation(fields: [areaId], references: [id], onDelete: SetNull)
  addedBy             User?             @relation(fields: [addedById], references: [id])
  trainingRecords     TrainingRecord[]
  assessments         CompetenceAssessment[]
  authorizations      WorkerAuthorization[]
  states              WorkerCompetenceState[]

  @@unique([plantId, employeeDirectoryId])
  @@index([plantId, isActive])
}
```

**Nota sobre as duas tabelas de trabalhadores.** O repositório tem duas, ligadas apenas por convenção `(plantId, employeeNo)` e sem FK entre si:

- `EmployeeDirectory` — `employeeNo`, `name`, `dept`, `shiftId` → é a secção "Trabalhadores" do Plant Master Data
- `OccupationalHealthWorker` — campos relevantes: `employeeNo`, `name`, `birthDate`, `gender`, `hireDate`, `roleStartDate`, `roleName`, `nationality`, `workstationId`, `observation`, `isActive`, `examDate`, `validUntil`, `status`

Conforme pediste, `CompetenceWorker` ancora em `EmployeeDirectory` (FK real) e enriquece a ficha individual com os campos demográficos de `OccupationalHealthWorker`, resolvido por `(plantId, employeeNo)`. Se não existir correspondência em Medicina do Trabalho, a ficha mostra apenas os dados de master data — sem erro.

Dois detalhes verificados no código que importam:

- `OccupationalHealthWorker.status` é `String @default("VALID")`, não um enum. `validUntil` é derivado mas guardado, calculado por `lib/occupational-health-validity.ts` em função da idade. **É o precedente direto para o cache de estado do §3.7** — o padrão já existe na aplicação.
- `EmployeeDirectory.shiftId` existe no schema mas **não é gerido pela secção Trabalhadores**: `createWorkerInput` em `lib/validation/dtos.ts` só aceita `employeeNo`, `name` e `dept`; o turno só é preenchido pelo seed. Ver §6.2.

### 3.4 Nível 1 — Formação

```prisma
model TrainingRecord {
  id                 String   @id @default(uuid())
  plantId            String
  competenceWorkerId String
  competenceTypeId   String
  provider           String?              // entidade formadora
  trainerName        String?
  completedAt        DateTime
  durationHours      Decimal? @db.Decimal(5, 2)
  certificateNumber  String?
  certificateExpiresAt DateTime?          // validade do certificado, se aplicável
  result             TrainingResult @default(PASSED)
  notes              String?
  createdAt          DateTime @default(now())
  createdById        String?

  competenceWorker   CompetenceWorker @relation(fields: [competenceWorkerId], references: [id], onDelete: Cascade)
  competenceType     CompetenceType   @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)
  attachments        TrainingRecordAttachment[]
  assessments        CompetenceAssessment[]
  authorizations     WorkerAuthorization[]

  @@index([competenceWorkerId, competenceTypeId, completedAt])
}

enum TrainingResult { PASSED  FAILED }
```

### 3.5 Nível 2 — Competência (avaliação prática)

```prisma
model CompetenceAssessment {
  id                 String   @id @default(uuid())
  plantId            String
  competenceWorkerId String
  competenceTypeId   String
  trainingRecordId   String?              // formação que suporta a avaliação
  assessedAt         DateTime
  assessorUserId     String?
  assessorName       String?              // avaliador externo
  method             CompetenceAssessmentMethod @default(PRACTICAL_TEST)
  result             CompetenceAssessmentResult
  score              Int?
  observations       String?
  createdAt          DateTime @default(now())
  createdById        String?

  competenceWorker   CompetenceWorker @relation(fields: [competenceWorkerId], references: [id], onDelete: Cascade)
  competenceType     CompetenceType   @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)
  trainingRecord     TrainingRecord?  @relation(fields: [trainingRecordId], references: [id], onDelete: SetNull)
  assessor           User?            @relation(fields: [assessorUserId], references: [id])
  attachments        CompetenceAssessmentAttachment[]
  authorizations     WorkerAuthorization[]

  @@index([competenceWorkerId, competenceTypeId, assessedAt])
}

enum CompetenceAssessmentMethod { PRACTICAL_TEST  OBSERVATION  THEORY_TEST  SIMULATOR }
enum CompetenceAssessmentResult { COMPETENT  NOT_YET_COMPETENT }
```

`NOT_YET_COMPETENT` em vez de `FAILED` é deliberado: a avaliação prática é formativa, e a linguagem influencia como o supervisor a usa.

### 3.6 Nível 3 — Autorização

```prisma
model WorkerAuthorization {
  id                   String   @id @default(uuid())
  plantId              String
  competenceWorkerId   String
  competenceTypeId     String
  trainingRecordId     String?
  assessmentId         String?
  sequenceNumber       Int?                 // max+1 em transação — ver nota abaixo
  grantedAt            DateTime @default(now())
  grantedByUserId      String               // quem autorizou formalmente
  validFrom            DateTime
  validUntil           DateTime
  restrictions         String?              // "apenas contrapesado até 3 t"
  status               AuthorizationStatus @default(ACTIVE)
  documentFileKey      String?              // PDF assinado (MinIO)
  acknowledgedAt       DateTime?            // tomada de conhecimento do trabalhador
  suspendedAt          DateTime?
  suspendedByUserId    String?
  suspensionReason     String?
  reactivatedAt        DateTime?
  revokedAt            DateTime?
  revokedByUserId      String?
  revocationReason     String?
  supersededById       String?  @unique     // autorização que a substituiu
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  competenceWorker     CompetenceWorker      @relation(fields: [competenceWorkerId], references: [id], onDelete: Cascade)
  competenceType       CompetenceType        @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)
  trainingRecord       TrainingRecord?       @relation(fields: [trainingRecordId], references: [id], onDelete: SetNull)
  assessment           CompetenceAssessment? @relation(fields: [assessmentId], references: [id], onDelete: SetNull)
  grantedBy            User                  @relation("AuthorizationGrantedBy", fields: [grantedByUserId], references: [id])
  supersededBy         WorkerAuthorization?  @relation("AuthorizationSupersedes", fields: [supersededById], references: [id])
  supersedes           WorkerAuthorization?  @relation("AuthorizationSupersedes")
  alertDeliveries      CompetenceAlertDelivery[]

  @@unique([plantId, sequenceNumber])
  @@index([plantId, status, validUntil])
  @@index([competenceWorkerId, competenceTypeId, status])
}

enum AuthorizationStatus {
  ACTIVE
  SUSPENDED
  REVOKED
  EXPIRED
  SUPERSEDED
}
```

`@@index([plantId, status, validUntil])` espelha o `@@index([plantId, status, dueDate])` de `Action` — é o índice que serve o job diário de expiração e os KPI do dashboard.

**Nota sobre `sequenceNumber`.** Contra a suposição intuitiva, `Action.sequenceNumber` **não** é atribuído pelo `RecordCodeService`: é um `max+1` dentro da transação, em `lib/services/action-service.ts`. O `RecordCodeService` serve apenas `COMMUNICATION`, `SEWO` e `REPORT`, e o seu `tipo` é um union fechado de 7 códigos de comunicação validado por `isRecordCodeType()`, que lança erro para valores fora da lista. Duas opções:

- **Replicar o `max+1` do `Action`** — mais simples, e consistente com o modelo que este espelha. Recomendado.
- **Estender o `RecordCodeService`** — exige acrescentar `"AUTHORIZATION"` a `SequenceEntityType` e um código novo a `RECORD_CODE_TYPES` em `lib/record-code.ts`. Só vale a pena se quiserem um código legível com ano e fábrica (`AUT-MAAP-2026-0148`).

### 3.7 Cache de estado derivado

```prisma
model WorkerCompetenceState {
  id                     String   @id @default(uuid())
  plantId                String
  competenceWorkerId     String
  competenceTypeId       String
  isRequired             Boolean  @default(false)
  requirementSource      String?              // "ROLE:Operador Logística"
  state                  CompetenceCellState
  validUntil             DateTime?
  daysToExpiry           Int?
  currentAuthorizationId String?
  blockedReason          String?
  computedAt             DateTime @default(now())

  competenceWorker       CompetenceWorker @relation(fields: [competenceWorkerId], references: [id], onDelete: Cascade)
  competenceType         CompetenceType   @relation(fields: [competenceTypeId], references: [id], onDelete: Cascade)

  @@unique([competenceWorkerId, competenceTypeId])
  @@index([plantId, state])
  @@index([plantId, validUntil])
}

enum CompetenceCellState {
  VALID                   // verde
  EXPIRING                // amarelo
  EXPIRED                 // vermelho
  MISSING                 // vermelho
  AWAITING_ASSESSMENT     // azul
  AWAITING_AUTHORIZATION  // azul
  SUSPENDED               // vermelho
  REVOKED                 // vermelho
  NOT_APPLICABLE          // cinzento
}
```

Recalculado em três momentos: (a) na escrita de qualquer formação / avaliação / autorização, dentro da mesma `prisma.$transaction()`; (b) na alteração da matriz de requisitos ou da função do trabalhador; (c) no job diário, para capturar a passagem do tempo.

### 3.8 Entrega de alertas e ligação a Ações

```prisma
model CompetenceAlertDelivery {
  id                 String   @id @default(uuid())
  plantId            String
  competenceWorkerId String
  competenceTypeId   String
  authorizationId    String?
  userId             String
  alertType          CompetenceAlertType
  channel            ActionAlertChannel      // reutiliza SOFTWARE | EMAIL
  cycleKey           String                  // ver §7.3
  notificationId     String?
  sentAt             DateTime @default(now())

  authorization      WorkerAuthorization? @relation(fields: [authorizationId], references: [id], onDelete: Cascade)
  user               User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  notification       Notification? @relation(fields: [notificationId], references: [id])

  @@unique([competenceWorkerId, competenceTypeId, userId, alertType, channel, cycleKey])
  @@index([userId, alertType, sentAt])
}

enum CompetenceAlertType {
  EXPIRING_90
  EXPIRING_60
  EXPIRING_30
  EXPIRING_7
  EXPIRY_DAY
  MISSING_DOCUMENT
  AUTHORIZATION_SUSPENDED
  AUTHORIZATION_REVOKED
  ROLE_WITHOUT_COMPETENCE
  AWAITING_ASSESSMENT
}

model CompetenceActionLink {
  id                 String   @id @default(uuid())
  actionId           String
  competenceWorkerId String
  competenceTypeId   String
  createdAt          DateTime @default(now())

  action             Action @relation(fields: [actionId], references: [id], onDelete: Cascade)

  @@unique([actionId, competenceWorkerId, competenceTypeId])
}
```

Alteração necessária a enum existente: `ActionSourceType` passa a incluir `COMPETENCE`. Segue-se o padrão de tabela de ligação (`SmatAuditActionLink`, `SEWOActionLink`) em vez de FK direta em `Action`, por ser o padrão mais recente do repositório.

---

## 4. Estados e apresentação

Cada célula mostra **cor + texto + ícone**. Nunca só cor. O `aria-label` repete o estado por extenso e inclui a data.

| Estado | Cor | Texto na célula | Classes Tailwind (alinhadas com AGENTS.md) |
|---|---|---|---|
| `VALID` | Verde | `Válida até 12/2027` | `bg-emerald-100 text-emerald-700` |
| `EXPIRING` | Amarelo | `Expira em 20 dias` | `bg-amber-100 text-amber-700` |
| `EXPIRED` | Vermelho | `Expirada 05/2026` | `bg-red-100 text-red-700` |
| `MISSING` | Vermelho | `Em falta` | `bg-red-100 text-red-700` |
| `AWAITING_ASSESSMENT` | Azul | `Aguarda avaliação` | `bg-sky-100 text-sky-700` |
| `AWAITING_AUTHORIZATION` | Azul | `Aguarda autorização` | `bg-sky-100 text-sky-700` |
| `SUSPENDED` | Vermelho | `Suspensa` | `bg-red-100 text-red-700` |
| `REVOKED` | Vermelho | `Revogada` | `bg-red-100 text-red-700` |
| `NOT_APPLICABLE` | Cinzento | `Não necessária` | `bg-slate-100 text-slate-500` |

**Verificação no `globals.css`.** O ficheiro contém apenas *overrides* de tema escuro para utilitários Tailwind, e o inventário real contraria a suposição óbvia: `bg-sky-100`, `text-sky-700`, `bg-slate-100` e `text-slate-500` **já existem** — sky e slate não são adições. As duas que **faltam** são precisamente `bg-amber-100` e `bg-red-100` (o ficheiro cobre `bg-amber-50`, `bg-orange-100`, `bg-red-50` e `bg-rose-100`). Ou se acrescentam os dois overrides, ou se usam as variantes já cobertas. Sem isto, os estados amarelo e vermelho ficam ilegíveis no tema `black`.

Os tokens de cor citados existem todos em `:root`: `--success: #047857`, `--info: #0369a1`, `--warning: #b45309`, `--danger: #b91c1c`, redefinidos em `html[data-theme="black"]`.

---

## 5. Máquina de estados — algoritmo

A ordem de precedência é a parte que costuma sair errada. Avaliar de cima para baixo, primeiro que corresponde ganha.

```
função calcularEstado(trabalhador, competência, hoje):

  1. requisito = resolverRequisito(trabalhador, competência)
     se requisito == NÃO_EXIGIDA e não existe autorização ativa:
        → NOT_APPLICABLE

  2. autorização = autorizaçãoMaisRecente(status ∈ {ACTIVE, SUSPENDED})

  3. se autorização.status == SUSPENDED:
        → SUSPENDED (motivo = autorização.suspensionReason)

  4. se MEDICAL_FITNESS_BLOCKS_AUTHORIZATION e aptidãoMédicaCaducada(trabalhador):
        → SUSPENDED (motivo = "Aptidão médica caducada")

  5. se autorização existe e autorização.status == ACTIVE:
        formação = formaçãoDeSuporte(autorização)
        se formação.certificateExpiresAt < hoje:
           → EXPIRED (motivo = "Formação caducada")      // §2.4
        se autorização.validUntil < hoje:
           → EXPIRED
        se (autorização.validUntil − hoje) <= 90 dias:
           → EXPIRING
        → VALID

  6. se existe autorização REVOKED e nenhuma posterior:
        → REVOKED

  7. avaliação = avaliaçãoMaisRecente(resultado = COMPETENT)
     se avaliação existe:
        formação = formaçãoDeSuporte(avaliação)     // pode não existir
        se formação não existe OU formação válida:
           → AWAITING_AUTHORIZATION

  8. formação = formaçãoMaisRecente(resultado = PASSED)
     se formação existe:
        se formação.certificateExpiresAt < hoje:
           → EXPIRED
        se competência.requiresAssessment:
           → AWAITING_ASSESSMENT
        → AWAITING_AUTHORIZATION

  9. → MISSING
```

Notas de implementação:

- O passo 1 tem uma exceção deliberada: se a competência deixou de ser exigida mas o trabalhador ainda tem autorização ativa, o estado real é mostrado, não cinzento. Esconder uma autorização ativa porque a função mudou é como se perdem autorizações que continuam legalmente válidas.
- **O passo 7 tolera uma avaliação sem formação ligada.** `CompetenceAssessment.trainingRecordId` é anulável, e uma avaliação órfã tem de contar como avaliação — senão o passo 8 devolve `AWAITING_ASSESSMENT` para quem já foi avaliado, e registar outra avaliação não resolve nada. A célula fica presa em "Aguarda avaliação" para sempre. Do lado da escrita, a ligação deve ser **obrigatória** quando `requiresTraining` é `true`; a tolerância na leitura existe para os registos que escapem a essa validação, não para os legitimar.
- O limiar de `EXPIRING` (90 dias) vem de `SystemParameter`, chave `COMPETENCE_EXPIRING_THRESHOLD_DAYS`, para não ficar literal no código.
- Datas em `Europe/Lisbon` via `toZonedTime`, e `differenceInCalendarDays` para a diferença — exatamente o padrão de `action-alert-service.ts`. Usar diferença em milissegundos produz erros de um dia nas mudanças de hora.

**Testes unitários obrigatórios** (`tests/unit/competence-state.test.ts`): um caso por ramo, mais os limites em 0, 1, 90 e 91 dias, mais o caso da mudança de hora de março e outubro.

---

## 6. Ecrãs

### 6.1 Dashboard do módulo (topo da página)

Seis cartões `.app-kpi-card`, cada um clicável e a aplicar o filtro correspondente na matriz abaixo:

1. **Autorizações expiradas** — `state = EXPIRED`
2. **A expirar (30 / 60 / 90 dias)** — um cartão com três segmentos
3. **Aguardam avaliação prática** — `state = AWAITING_ASSESSMENT`
4. **Aguardam autorização formal** — `state = AWAITING_AUTHORIZATION` *(acréscimo: o teu fluxo de três níveis cria esta fila, e sem visibilidade própria ela acumula)*
5. **Lacunas críticas** — trabalhadores com competência obrigatória em `MISSING` *(é daqui que nasce a Ação)*
6. **Cobertura por competência** — barra por tipo, % de autorizados sobre exigidos

### 6.2 Matriz de autorizações — área central

**Barra de ações:** `Adicionar trabalhador` · `Registar formação` · `Exportar` (XLSX)

> O `list-export-service.ts` não é genérico: tem builders *hardcoded* apenas para Comunicações e Ações, com colunas e cópia i18n fixas. O export de competências precisa de funções novas — daí o `competence-export-service.ts` no §9. Reutiliza-se o padrão e as dependências (ExcelJS, pdfkit), não o serviço.

**Adicionar trabalhador** abre um modal com a listagem de `EmployeeDirectory` da planta — número, nome e `dept` (texto, como pista) — com pesquisa, seleção múltipla, e marcando quem já está inscrito. Cada linha selecionada pede a **`Area`** num select, conforme §2.2. `Adicionar` cria os `CompetenceWorker` e calcula os estados iniciais numa transação.

Duas alterações à proposta inicial: seleção múltipla, porque a inscrição inicial de uma fábrica são dezenas de trabalhadores; e a atribuição da `Area` no próprio modal, porque é o único momento em que alguém está a olhar para aquele trabalhador de propósito.

> **Coluna "Turno" retirada** (decisão 6.2). `EmployeeDirectory.shiftId` existe no schema mas não é gerido pela secção Trabalhadores do Master Data, e não se acrescenta essa gestão agora.

**Colunas:** `Nº` · `Trabalhador` · `Departamento` (nome da `Area`) · `Função` · uma coluna por `CompetenceType` ativo (ordenada por `displayOrder`)

As colunas de competência são geradas do catálogo, não fixas no código — é o que permite acrescentar tipos sem tocar no componente.

**Filtros:** trabalhador (texto) · departamento · função · tipo de competência · estado (multi-seleção) · intervalo de validade · `apenas obrigatórias`

**Interação:** clicar numa célula abre um painel lateral com o histórico daquela competência para aquele trabalhador (formações, avaliações, autorizações, em linha temporal) e os botões de ação permitidos pelo papel. Clicar no nome abre a ficha individual.

### 6.3 Ficha individual do trabalhador

**Identificação** — de `EmployeeDirectory`: `employeeNo`, `name`, `dept`; de `CompetenceWorker`: `areaId`, `roleName`.

**Dados complementares** — de `OccupationalHealthWorker`, resolvido por `(plantId, employeeNo)`: `birthDate`, `gender`, `hireDate`, `roleStartDate`, `roleName`, `nationality`, `workstation`. **Não são lidos** `examDate`, `validUntil` nem `status`, conforme §2.1.

**Competências** — uma linha por tipo exigido ou com registo, com o estado e a linha temporal dos três níveis.

**Documentos** — certificados e autorizações em PDF, via `StorageService.uploadObject()`, com upload `multipart/form-data` através da rota Next (limite de 15 MB, `ATTACHMENT_UPLOAD_LIMITS`).

> **Correção a uma convenção mal documentada.** O `AGENTS.md` afirma "S3 file operations via presigned URLs (never direct upload)", mas o código faz o contrário: não existe `getSignedUrl` em nenhum ficheiro do repositório, e o `lib/storage-upload.ts` documenta explicitamente a decisão oposta — os uploads passam sempre pelo servidor da aplicação porque o endpoint de armazenamento não é alcançável do browser em produção. O `AGENTS.md` está desatualizado neste ponto e vale corrigi-lo.

**Histórico** — todos os eventos, incluindo suspensões e revogações com motivo e autor. Imutável.

**Impressão** — autorização individual em PDF (`pdfkit-helper.ts`) para assinatura, e a matriz completa do trabalhador.

---

## 7. Alertas

### 7.1 Reutilização do que existe

Nada de novo se constrói. O módulo liga-se a três mecanismos já presentes — mas há duas escolhas de padrão a fazer, porque a aplicação tem dois de cada.

**E-mail.** Não usar `NotificationService.notify()`. Apesar de ser a API mais óbvia, usa `createMany`, que **não devolve ids** — logo não permite preencher `CompetenceAlertDelivery.notificationId`. Seguir em vez disso o padrão de `action-alert-service.ts`: `tx.notification.create()` + `tx.competenceAlertDelivery.create()` na mesma transação, e `sendNotificationEmail()` chamada diretamente. `NotificationService.notify()` fica reservado para alertas sem rastreio de entrega.

**Janela flutuante.** Existem dois mecanismos distintos e é preciso escolher:

| Padrão | Como funciona | Adequado quando |
|---|---|---|
| `RepeatabilityAlertModal` | O layout carrega as notificações server-side e passa-as como props | O alerta é raro e pode esperar pela navegação seguinte |
| `SafetyCommunicationFloatingAlert` | Recebe só `plantCode`; faz polling client-side de 30 s a uma rota própria | O alerta é imediato e não pode esperar |

**Decisão 7.1: padrão `RepeatabilityAlertModal`** (server-side). Os alertas de expiração são gerados por um job diário — nada justifica polling de 30 segundos, e evita-se uma rota e um `setInterval` por sessão. Concretamente: acrescentar `"COMPETENCE_ALERT"` ao `channel: { in: [...] }` do `findMany` que o `layout.tsx` já faz (linhas 112-144), e passar os resultados ao componente.

**Exceção:** `AUTHORIZATION_SUSPENDED` e `AUTHORIZATION_REVOKED` são imediatos e não podem esperar pela navegação seguinte — uma autorização suspensa significa alguém a operar equipamento sem cobertura. Estes dois usam o padrão de polling do `SafetyCommunicationFloatingAlert`, com canal próprio `"COMPETENCE_URGENT"` para que a rota de polling devolva só estes e não os avisos de expiração.

O campo `Notification.channel` é `String`, por isso `"COMPETENCE_ALERT"` não exige migração de enum.

**Agendamento.** BullMQ, novo `competenceExpiryQueue`, padrão `0 8 * * *` em `ACTION_ALERT_TIMEZONE` — igual ao `actionsOverdueQueue`. Registo em três sítios: `QUEUE_NAMES` e o `new Queue(...)` em `jobs/queues.ts`, e o `workerMap` em `jobs/worker.ts`.

### 7.2 Gatilhos e destinatários

| Gatilho | Momento | Destinatários |
|---|---|---|
| `EXPIRING_90` / `60` / `30` / `7` | Job diário 08:00 | Responsável do departamento (`Area`), `N3_SAFETY` |
| `EXPIRY_DAY` | Job diário, no dia | Responsável do departamento, `N3_SAFETY`, `N2_PLANT_MANAGER` |
| `MISSING_DOCUMENT` | Job diário | `N3_SAFETY` |
| `AUTHORIZATION_SUSPENDED` | Imediato, na escrita | Responsável do departamento, `N3_SAFETY`, o próprio trabalhador se tiver conta |
| `AUTHORIZATION_REVOKED` | Imediato | Responsável do departamento, `N3_SAFETY`, `N2_PLANT_MANAGER` |
| `ROLE_WITHOUT_COMPETENCE` | Na alteração de função ou matriz | Responsável do departamento, `N3_SAFETY` |
| `AWAITING_ASSESSMENT` | Semanal (resumo) | Responsável do departamento |

**Decisão 7.2: reutilizar `SafetyCommunicationAlertRecipient`.** O "responsável do departamento" resolve-se pelo mapeamento utilizador ↔ `Area` que essa tabela já contém, com o `INNER JOIN "Area"` que o `safety-communication-alert-service.ts` já faz. Não se cria tabela nem ecrã de gestão novos — a lista de destinatários gerida nas definições passa a servir os dois módulos.

O `N3_SAFETY` corresponde ao "N3 da fábrica" que indicaste.

**Acoplamento que isto cria, e a saída se incomodar.** A lista passa a ser partilhada: acrescentar alguém para receber alertas de competências acrescenta-o também aos alertas de comunicações de segurança, e removê-lo de um remove-o dos dois. Se mais tarde as pessoas divergirem, a migração é pequena e não destrutiva — acrescentar uma coluna `scope` (`SAFETY_COMMUNICATION | COMPETENCE | BOTH`, omissão `BOTH`) à tabela existente, o que preserva todas as linhas atuais e o comportamento atual. Fica registado para não ser preciso redescobrir o caminho.

Uma implicação a testar no arranque: se a lista atual estiver preenchida a pensar só em comunicações de segurança, o primeiro job diário de expiração vai enviar alertas de competências a essas pessoas. Vale rever a lista antes de ativar a fase 4.

### 7.3 Idempotência — o detalhe que evita spam

`ActionAlertDelivery` usa `@@unique([actionId, userId, alertType, channel])`. Isso funciona para Ações, que não renovam. Autorizações renovam a cada 3–5 anos, e a mesma combinação (trabalhador, empilhador, `EXPIRING_30`) repete-se em cada ciclo.

Solução: o campo `cycleKey`.

| Tipo de alerta | `cycleKey` | Porquê |
|---|---|---|
| Expiração (`EXPIRING_*`, `EXPIRY_DAY`) | `authorizationId` | Cada renovação cria uma autorização nova (§2.5), logo chave nova, logo o alerta volta a poder ser enviado. Sem lógica extra. |
| `AUTHORIZATION_SUSPENDED` | `${authorizationId}:${suspendedAt}` | **Ver aviso abaixo.** |
| `AUTHORIZATION_REVOKED` | `authorizationId` | Terminal — só acontece uma vez por autorização. |
| `MISSING_DOCUMENT` | `${authorizationId}:${YYYY-MM}` | Lembrete mensal, e distingue autorizações renovadas dentro do mesmo mês. |
| `ROLE_WITHOUT_COMPETENCE`, `AWAITING_ASSESSMENT` | `YYYY-MM` (ou `YYYY-Www` se semanal) | Não há autorização a que ancorar. Lembrete periódico, não diário. |

Sem isto acontece uma de duas coisas: ou o alerta de renovação nunca chega em 2031 porque a chave já existe de 2026, ou removem-se as restrições e passam a chegar todos os dias.

> **Aviso: a suspensão não é terminal e reutiliza a linha.** `reactivateAuthorization` faz `SUSPENDED → ACTIVE` na **mesma** `WorkerAuthorization`, sem criar registo novo. Logo a sequência suspender → reativar → suspender colide na chave, o `P2002` é interpretado como "já enviado", e a segunda suspensão **não alerta ninguém, sem log de erro**. É por isso que o `cycleKey` deste tipo precisa da ocorrência — o `suspendedAt`, que é reescrito a cada suspensão — e não apenas do id da autorização. O raciocínio "cada renovação cria uma autorização nova" cobre renovações e não cobre este ciclo.

Nota de robustez relacionada: as bandas de expiração devem usar `<=` e não igualdade exata, para que um dia de job em baixo não perca o alerta — o `cycleKey` já garante o envio único. Isto inclui `EXPIRY_DAY`, que deve ser `daysToExpiry <= 0` (limitado a `>= -30`, para não alertar indefinidamente sobre autorizações caducadas há meses) e não `=== 0`.

---

## 8. Criar uma Ação a partir de uma lacuna

Pediste este requisito e ele encaixa bem no que existe.

**Ponto de entrada:** botão `Criar ação` no painel de detalhe da célula e na linha de lacuna do dashboard.

**Pré-preenchimento** (adaptado de `create-action-quick.tsx`):

| Campo | Valor |
|---|---|
| `sourceType` | `COMPETENCE` (novo valor no enum) |
| `category` | `CORRECTIVE` se `EXPIRED`/`MISSING`; `PREVENTIVE` se `EXPIRING` |
| `priority` | `HIGH` se `EXPIRED`/`MISSING` em competência obrigatória; `MEDIUM` se `EXPIRING`; `LOW` restantes |
| `title` | `"{Competência} — {estado} — {Trabalhador}"` |
| `description` | Estado, data de validade, função, departamento, e o que falta em concreto |
| `ownerUserId` | Responsável do departamento, editável |
| `dueDate` | `validUntil` se `EXPIRING`; hoje + SLA do parâmetro se `EXPIRED`/`MISSING` |
| `level` | `N3` |

Cria-se o `CompetenceActionLink`. Quando a Ação fecha, o painel de detalhe mostra-a como resolvida; o estado da célula **não** muda por fechar a Ação — só muda quando existir o registo real de formação/avaliação/autorização. Esta separação é importante: fechar a ação administrativa não é o mesmo que o trabalhador estar autorizado.

---

## 9. Ficheiros a criar e alterar

### Novos

```
prisma/migrations/xxxxxx_competence_authorizations/

app/(secure)/app/[plant]/competences/page.tsx
app/(secure)/app/[plant]/competences/[workerId]/page.tsx

app/api/plants/[plantCode]/competences/route.ts                    GET matriz, POST inscrever
app/api/plants/[plantCode]/competences/workers/[id]/route.ts       GET, PATCH, DELETE
app/api/plants/[plantCode]/competences/trainings/route.ts          POST
app/api/plants/[plantCode]/competences/assessments/route.ts        POST
app/api/plants/[plantCode]/competences/authorizations/route.ts     POST
app/api/plants/[plantCode]/competences/authorizations/[id]/suspend/route.ts
app/api/plants/[plantCode]/competences/authorizations/[id]/revoke/route.ts
app/api/plants/[plantCode]/competences/authorizations/[id]/pdf/route.ts
app/api/plants/[plantCode]/competences/export/route.ts
app/api/plants/[plantCode]/admin/competence-types/route.ts
app/api/plants/[plantCode]/admin/competence-requirements/route.ts
app/api/plants/[plantCode]/notifications/competences/route.ts    polling só de COMPETENCE_URGENT

components/feature/competence-matrix-manager.tsx
components/feature/competence-worker-profile.tsx
components/feature/competence-cell-detail-panel.tsx
components/feature/add-competence-worker-modal.tsx
components/feature/competence-type-manager.tsx
components/feature/competence-requirement-manager.tsx
components/feature/competence-urgent-alert.tsx

lib/services/competence-service.ts
lib/services/competence-state-service.ts        ← algoritmo do §5
lib/services/competence-alert-service.ts
lib/services/competence-export-service.ts
lib/services/competence-ui-localization.ts

jobs/handlers/competence-expiry.ts

tests/unit/competence-state.test.ts
tests/unit/competence-requirement-resolution.test.ts
tests/unit/competence-alert-idempotency.test.ts
```

### Alterações

| Ficheiro | Alteração |
|---|---|
| `prisma/schema.prisma` | 9 modelos + 7 enums novos; `ActionSourceType` += `COMPETENCE`; relações em `Plant`, `User`, `Area`, `EmployeeDirectory`, `Action`, `Notification` |
| `lib/modules.ts` | `DEFAULT_MODULE_TOGGLES.COMPETENCE_AUTHORIZATIONS = true`; entrada em `MODULE_OPTIONS`; `PLANT_NAVIGATION_MODULES.competences = "COMPETENCE_AUTHORIZATIONS"` |
| `app/(secure)/app/[plant]/layout.tsx` | Item de navegação após `occupational-health`, papéis `[N0, N1, N2, N3, N4, N5]`; `"COMPETENCE_ALERT"` no `channel: { in: [...] }` do `findMany` existente; `<CompetenceUrgentAlert />` |
| `lib/ui-language.ts` | `modules.competences` (rótulo de navegação, dentro do bloco `modules` de rótulos) **mais** nova chave de topo `competences` com o dicionário do módulo — nas 7 línguas (pt, it, en, pl, de, ro, fr) |
| `lib/validation/dtos.ts` | Schemas Zod de todos os endpoints |
| `jobs/queues.ts` | `competenceExpiryQueue` |
| `jobs/worker.ts` | Registo do handler |
| `jobs/scheduler.ts` | `upsertJobScheduler` por planta, `0 8 * * *`, tz `ACTION_ALERT_TIMEZONE` |
| `prisma/seed.ts` | 4 `CompetenceType` por planta + requisitos exemplo |
| `lib/services/record-code-service.ts` | Sequência para `sequenceNumber` de autorizações |
| `lib/services/safety-communication-alert-service.ts` | Expor a resolução de destinatários por `Area` para reutilização pelo `competence-alert-service.ts` (decisão 7.2) — extrair para função, sem alterar comportamento |

Convenções a respeitar: exportações nomeadas; server components por omissão; envelope `{ ok: true, data }` / `{ ok: false, errorCode, message }`; `requirePlantAccess()` em todas as rotas; `writeAuditLog()` em conceder, suspender e revogar; `prisma.$transaction()` nas mutações; ficheiros por URL pré-assinado.

---

## 10. Faseamento sugerido

| Fase | Âmbito | Resultado utilizável |
|---|---|---|
| **1** | Schema + catálogo de competências + inscrição de trabalhadores + matriz só de leitura | A matriz existe e mostra tudo `Em falta`. Já é melhor que o Excel. |
| **2** | Registo dos três níveis + algoritmo de estado + ficha individual | O módulo funciona de ponta a ponta. |
| **3** | Matriz de requisitos por função | O cinzento passa a ser automático. |
| **4** | Alertas (job diário, e-mail, janela flutuante) + destinatários | Deixa de ser preciso alguém abrir o módulo. |
| **5** | Ações a partir de lacunas + exportação XLSX + PDF de autorização | Fecha o ciclo. |
| **6** | KPI no dashboard de segurança + vista corporate multi-planta | Visibilidade de grupo. |

Fases 1 e 2 entregam valor real; 3 e 4 são o que faz o módulo manter-se atualizado sozinho.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Departamento em texto livre impede encaminhar alertas | Resolver §2.2 antes da fase 4 |
| Migração de dados de Excel sem validade conhecida | Importador com `validUntil` obrigatório e relatório de rejeitados; sem data, o registo entra como `MISSING`, não como válido |
| Matriz de requisitos nunca preenchida | Fase 3 com ecrã dedicado e KPI de cobertura da própria matriz |
| Autorizações concedidas sem avaliação prática | `AUTHORIZATION_SEGREGATION_OF_DUTIES` + `requiresAssessment` bloqueiam no serviço, não só no UI |
| Fadiga de alertas | `cycleKey` mensal para lacunas; resumo semanal em vez de diário para `AWAITING_ASSESSMENT` |
| Matriz lenta com 800 trabalhadores × 15 competências | `WorkerCompetenceState` + paginação server-side + `@@index([plantId, state])` |
| Estados amarelo e vermelho ilegíveis no tema `black` | Acrescentar overrides de `bg-amber-100` e `bg-red-100` ao `globals.css` antes da fase 1 (ver §4) |
| Alertas sem `notificationId` por se usar `NotificationService.notify()` | Seguir o padrão de `action-alert-service.ts`, não o de `notify()` (ver §7.1) |

---

## 12. Estado das decisões

Todas as questões de desenho estão fechadas. O que resta são tarefas de preparação, não decisões.

### Fechadas

| # | Decisão | Consequência principal |
|---|---|---|
| 2.1 | Aptidão médica não bloqueia | Passo 4 do algoritmo (§5) implementado mas desativado desde a fase 1 |
| 2.2 | Departamentos são `Area` | `areaId` atribuído no modal de inscrição |
| 2.3 | Concedem N3, N1 e N0 | `requirePlantAccess(plantCode, [N3_SAFETY])` — uma linha, com comentário a explicar o bypass |
| 2.4 | Manda a validade da autorização | Formação caducada → célula **Expirada** com autorização `ACTIVE`; explicar no painel |
| 2.5 | Renovação cria autorização nova | `cycleKey = authorizationId` resolve a idempotência dos alertas |
| 2.6 | Externos fora do âmbito | `employeeDirectoryId` fica fora de chave composta, para permitir convergência futura |
| 3.1 | 12 meses para todas | Manter `COMPETENCE_EXPIRING_THRESHOLD_DAYS` a 90 para coerência com os KPI; 25% do ciclo fica amarelo |
| 6.2 | Sem coluna "Turno" | Modal mostra `dept` em texto + select de `Area` |
| 7.1 | Janela flutuante server-side | Exceção: suspensão/revogação por polling, canal `COMPETENCE_URGENT` |
| 7.2 | Reutilizar destinatários | Lista partilhada com comunicações de segurança; coluna `scope` é a saída se divergirem |

### A tratar antes de cada fase

| Antes da fase | Tarefa | Porquê |
|---|---|---|
| **1** | Acrescentar overrides de `bg-amber-100` e `bg-red-100` ao `globals.css` | Sem eles, amarelo e vermelho ficam ilegíveis no tema `black` (§4) |
| **1** | Confirmar que as `Area` cobrem todos os departamentos com trabalhadores a inscrever | Um trabalhador sem `Area` não tem destinatário de alerta |
| **3** | Levantar as funções (`roleName`) reais e que competências cada uma exige | É o conteúdo da matriz de requisitos; sem ele a fase 3 não tem o que configurar |
| **4** | Rever a lista de destinatários existente | Passa a receber também alertas de competências (§7.2) |
| **5** | Validar as periodicidades definitivas com HSE e jurídico | Substituem os 12 meses provisórios (§3.1) |

---

## 13. Correções ao `AGENTS.md` do repositório

Duas afirmações do `AGENTS.md` estão desatualizadas e induziram erros na primeira versão desta especificação. Vale corrigi-las no repositório, porque qualquer pessoa (ou agente) que trabalhe sobre esse ficheiro herda os mesmos erros:

| Linha | Afirmação atual | Realidade no código |
|---|---|---|
| "Action sourceTypes: COMMUNICATION, SEWO, MANUAL" | Omite `SMAT` | O enum tem quatro valores, incluindo `SMAT` |
| "S3 file operations via presigned URLs (never direct upload)" | Falso | Não existe `getSignedUrl` no repositório; `lib/storage-upload.ts` documenta a decisão oposta e explica porquê |
