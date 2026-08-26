# Competences Module — Per-Worker Requirements & Unified Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a state-computation bug that hides real training/assessment records, replace the role/area/workstation requirement matrix with per-worker requirement marking, merge the training/assessment/authorization forms into one submission, fix the segregation-of-duties check to compare the actual supporting assessor (not the authenticated user), add empty states for the new per-worker marking flow, and update the module spec to match.

**Architecture:** `CompetenceWorkerRequirement` is a new table, one row per (worker, competenceType), replacing `CompetenceRequirement`'s role/area/workstation scope matching. `recomputeAndSaveState` reads `isRequired` directly from that row instead of resolving scoped rules. Training/assessment/authorization become one write path (`CompetenceService.registerCompetenceEntry`) sharing a `entryGroupId` and a single `prisma.$transaction()`, replacing three separate forms in the UI with one. Segregation-of-duties moves from "did the actor ever assess this worker/type" to "did the actor perform the specific assessment backing this authorization."

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Zod, Vitest, React (client components), date-fns/date-fns-tz.

**Spec:** `docs/modulo-competencias-autorizacoes.md` (updated by Task 17 of this plan) — sections §3.2, §3.7, §5, §6.2, §6.3 are the ones this plan changes; read them before starting.

## Global Constraints

- Kill any running `next dev` / `npm run dev:all` process before `npx prisma generate` or `npx prisma migrate dev` — the Windows file lock on `query_engine-windows.dll.node` makes generation fail with EPERM otherwise.
- Dates in the module are always computed in `Europe/Lisbon` via `toZonedTime`/`differenceInCalendarDays` — never raw millisecond math (DST changes produce off-by-one-day errors).
- Every route that changes state calls `requirePlantAccess()` first; `N0_ADMIN` and `N1_CORPORATE` bypass the allowed-roles list inside that guard (see `lib/rbac/guards.ts`) — an explicit in-route check is required wherever a role must be excluded despite the bypass (see the `competence-requirements` route's own comment for the existing pattern).
- Every mutation that also touches `WorkerCompetenceState` runs inside one `prisma.$transaction()` covering the write, the audit log, and the recompute — never as three separate statements.
- `writeAuditLog()` is called for every state-changing service action, inside the same transaction.
- Exported strings live in `lib/ui-language.ts`'s `competences` dictionary, once per each of the 7 languages (`en`, `pt`, `it`, `pl`, `de`, `ro`, `fr`) — never hardcoded in a component.
- Terminate the whole plan with `npm run build && npm run test:unit`, both clean, run from `c:\HSE\ma-hse`.

---

## Phase map

| Phase | Tasks | Covers user's point |
|---|---|---|
| 1 | 1 | 1 — state fix |
| 2 | 2–3 | 2.1–2.2 — schema + data migration |
| 3 | 4–6 | 2.3 — service refactor |
| 4 | 7 | 2.3 — remove old requirement-matrix UI/routes |
| 5 | 8–9 | 2.4 — worker-profile API + requirement-toggle route (backend) |
| 6 | 10–12 | 3.1, 3.3 — unified entry: schema, service, route |
| 7 | 13 | 3.2, 2.4 — unified entry UI, and the per-worker requirement checkbox UI itself |
| 8 | 14 | 4 — segregation of duties |
| 9 | 15 | 4 — i18n error sweep |
| 10 | 16 | 5 — empty states |
| 11 | 17 | 6 — spec doc |
| 12 | 18 | final verification |

---

## Task 1: Fix NOT_APPLICABLE hiding real training/assessment records

**Files:**
- Modify: `lib/services/competence-state-service.ts:162-178`
- Test: `tests/unit/competence-state.test.ts:68-84`

**Interfaces:**
- Consumes: `ComputeCompetenceCellStateInput` (already has `authorizations`, `trainingRecords`, `assessments` arrays — no signature change).
- Produces: no change to `computeCompetenceCellState`'s signature; only its step-1 branch condition changes.

- [ ] **Step 1: Write the three failing tests**

Add these three tests to the existing `describe("computeCompetenceCellState — step 1 (requirement)", ...)` block in `tests/unit/competence-state.test.ts`, right after the existing two tests (after line 82, before the closing `});` on line 83):

```typescript
  it("shows AWAITING_AUTHORIZATION, not NOT_APPLICABLE, when training passed and assessment is competent but nothing requires it and no authorization exists", () => {
    const result = computeCompetenceCellState(
      baseInput({
        isRequired: false,
        requirementSource: null,
        trainingRecords: [training({ result: TrainingResult.PASSED })],
        assessments: [assessment({ result: CompetenceAssessmentResult.COMPETENT })],
      }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_AUTHORIZATION);
  });

  it("shows AWAITING_ASSESSMENT, not NOT_APPLICABLE, when training passed and the competence type requires an assessment that hasn't happened yet", () => {
    const result = computeCompetenceCellState(
      baseInput({
        isRequired: false,
        requirementSource: null,
        requiresAssessment: true,
        trainingRecords: [training({ result: TrainingResult.PASSED })],
      }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_ASSESSMENT);
  });

  it("still returns NOT_APPLICABLE when not required and there is truly no record of any kind", () => {
    const result = computeCompetenceCellState(baseInput({ isRequired: false, requirementSource: null }));
    expect(result.state).toBe(CompetenceCellState.NOT_APPLICABLE);
  });
```

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-state.test.ts`
Expected: the first two new tests FAIL — both currently resolve to `NOT_APPLICABLE` (the existing `!input.isRequired && !hasActiveAuthorization` branch fires because there is no authorization, ignoring the training/assessment records). The third new test already passes (it duplicates the existing first test in the block, added here as a pinned regression case) — do not treat that as a problem, it is not testing the fix.

- [ ] **Step 3: Fix the step-1 condition**

In `lib/services/competence-state-service.ts`, replace lines 166-178:

```typescript
  // Step 1 — deliberate exception: a competence no longer required but with
  // an active authorization still shows its real state, not NOT_APPLICABLE.
  const hasActiveAuthorization = input.authorizations.some((a) => a.status === AuthorizationStatus.ACTIVE);
  if (!input.isRequired && !hasActiveAuthorization) {
    return {
      ...base,
      state: CompetenceCellState.NOT_APPLICABLE,
      validUntil: null,
      daysToExpiry: null,
      currentAuthorizationId: null,
      blockedReason: null,
    };
  }
```

with:

```typescript
  // Step 1 — deliberate exception: NOT_APPLICABLE is reserved for a
  // competence that is neither required nor has ANY record at all. A worker
  // with a PASSED training and a COMPETENT assessment, but no requirement and
  // no authorization, must not read "Not required" — that hides completed
  // work, which is worse than showing the real (pending) state.
  const hasAnyRecord =
    input.authorizations.length > 0
    || input.trainingRecords.length > 0
    || input.assessments.length > 0;
  if (!input.isRequired && !hasAnyRecord) {
    return {
      ...base,
      state: CompetenceCellState.NOT_APPLICABLE,
      validUntil: null,
      daysToExpiry: null,
      currentAuthorizationId: null,
      blockedReason: null,
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-state.test.ts`
Expected: all tests in the file PASS, including the three new ones. The existing "shows the real state, not NOT_APPLICABLE, when no longer required but an ACTIVE authorization exists" test must still pass unchanged (an ACTIVE authorization is itself a record, so `hasAnyRecord` is still true there).

- [ ] **Step 5: Run the full competence test suite for regressions**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-state.test.ts tests/unit/competence-service.test.ts tests/unit/competence-requirement-resolution.test.ts`
Expected: all PASS — this step's change is local to `computeCompetenceCellState`'s pure logic and does not touch resolution or the service layer.

- [ ] **Step 6: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-state-service.ts tests/unit/competence-state.test.ts
git commit -m "fix(competences): stop hiding completed training/assessment behind NOT_APPLICABLE"
```

---

## Task 2: Add the CompetenceWorkerRequirement model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_competence_worker_requirement/migration.sql` (generated, not hand-written)

**Interfaces:**
- Produces: `CompetenceWorkerRequirement` Prisma model with `@@unique([competenceWorkerId, competenceTypeId])`, consumed by Task 4's `recomputeAndSaveState` rewrite and Task 3's backfill script.

- [ ] **Step 1: Add the model and its relations to schema.prisma**

Insert this model immediately after the `WorkerCompetenceState` model's closing brace (after line 541, before the `enum CompetenceCellState` block that currently follows it — i.e. between line 541 and line 543):

```prisma
/// §3.2 (revised): replaces CompetenceRequirement's role/area/workstation
/// scope matching. One row per (worker, competenceType) — set explicitly by
/// a supervisor who knows that worker's real duties, not inferred from a
/// role-name string match that depended on data nobody kept filled in.
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
  setBy            User?            @relation("CompetenceWorkerRequirementSetBy", fields: [setById], references: [id])

  @@unique([competenceWorkerId, competenceTypeId])
  @@index([plantId, isRequired])
}
```

Note: this model deliberately has no `plant Plant @relation(...)` back-reference field of its own on `Plant` — `plantId` is still a plain scoping column (matching every other plant-scoped model), but plan Step 2 below adds `Plant.competenceWorkerRequirements` for consistency with how every other plant-scoped model is listed on `Plant`.

- [ ] **Step 2: Add the relation field on Plant, CompetenceType, CompetenceWorker, and User**

In `prisma/schema.prisma`, `model Plant` (around line 28), add a line right after `competenceRequirements CompetenceRequirement[]` (leave that line in place — Task 7 removes it once the old model is fully retired):

```prisma
  competenceWorkerRequirements       CompetenceWorkerRequirement[]
```

In `model CompetenceType` (around line 444), add right after `requirements CompetenceRequirement[]`:

```prisma
  workerRequirements    CompetenceWorkerRequirement[]
```

In `model CompetenceWorker` (around line 509, right after `states WorkerCompetenceState[]`), add:

```prisma
  requirements    CompetenceWorkerRequirement[]
```

In `model User` (around line 121, right after `createdCompetenceRequirements CompetenceRequirement[] @relation("CompetenceRequirementCreatedBy")`), add:

```prisma
  setCompetenceWorkerRequirements           CompetenceWorkerRequirement[]       @relation("CompetenceWorkerRequirementSetBy")
```

- [ ] **Step 3: Validate the schema**

Run: `cd c:\HSE\ma-hse && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Kill the dev server, then generate the migration**

If `npm run dev` or `npm run dev:all` is running in any terminal, stop it first (Ctrl+C) — `prisma generate`, which `migrate dev` runs internally, fails with `EPERM` on Windows while `query_engine-windows.dll.node` is locked by a running Next.js dev process.

Run: `cd c:\HSE\ma-hse && npx prisma migrate dev --name add_competence_worker_requirement`
Expected: a new folder under `prisma/migrations/` containing a `CREATE TABLE "CompetenceWorkerRequirement"` (plus its FKs, unique constraint, and index) and no `DROP` statements — this migration is additive only. Prisma Client regenerates automatically at the end of this command.

- [ ] **Step 5: Confirm generation and type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i competence`
Expected: no output referencing `competenceWorkerRequirement` — the new delegate exists on the generated client (`prisma.competenceWorkerRequirement`).

- [ ] **Step 6: Commit**

```bash
cd c:\HSE\ma-hse
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(competences): add CompetenceWorkerRequirement schema (additive)"
```

---

## Task 3: Backfill CompetenceWorkerRequirement from the old CompetenceRequirement rules

**Files:**
- Create: `scripts/backfill-competence-worker-requirements.ts`
- Modify: `package.json` (new script entry)

**Interfaces:**
- Consumes: `prisma.competenceRequirement` (still present — Task 7 drops it), `prisma.competenceWorker`, `prisma.employeeDirectory`, `prisma.area`, `prisma.occupationalHealthWorker`, `prisma.competenceWorkerRequirement` (added in Task 2).
- Produces: populated `CompetenceWorkerRequirement` rows; a log summary printed to stdout. This script's output is read by a human before Task 7 drops the old table — it is not called from any other code.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-competence-worker-requirements.ts`:

```typescript
import { PrismaClient, CompetenceRequirementScope } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

async function main() {
  const plants = await prisma.plant.findMany({ select: { id: true, code: true } });
  let totalRulesConverted = 0;
  let totalRequirementsCreated = 0;
  const unconvertedRules: Array<{ plantCode: string; ruleId: string; scopeType: string }> = [];

  for (const plant of plants) {
    const [rules, workers, employeesByEmployeeNo, occupationalHealthByEmployeeNo] = await Promise.all([
      prisma.competenceRequirement.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.competenceWorker.findMany({
        where: { plantId: plant.id, isActive: true },
        include: { employee: { select: { employeeNo: true, dept: true } }, area: { select: { id: true, name: true } } },
      }),
      prisma.employeeDirectory.findMany({ where: { plantId: plant.id } })
        .then((rows) => new Map(rows.map((row) => [row.employeeNo, row]))),
      prisma.occupationalHealthWorker.findMany({ where: { plantId: plant.id } })
        .then((rows) => new Map(rows.map((row) => [row.employeeNo, row]))),
    ]);

    // (worker, competenceType) -> whether this rule set requires it, keyed to dedupe multiple matching rules.
    const toCreate = new Map<string, { competenceWorkerId: string; competenceTypeId: string }>();

    for (const rule of rules) {
      let matchedAny = false;

      for (const worker of workers) {
        let matches = false;

        if (rule.scopeType === CompetenceRequirementScope.ALL_WORKERS) {
          matches = true;
        } else if (rule.scopeType === CompetenceRequirementScope.ROLE && rule.scopeRoleName && worker.roleName) {
          matches = normalizeText(rule.scopeRoleName) === normalizeText(worker.roleName);
        } else if (rule.scopeType === CompetenceRequirementScope.AREA && rule.scopeAreaId) {
          if (worker.areaId) {
            matches = worker.areaId === rule.scopeAreaId;
          } else if (worker.employee.dept) {
            // Fallback: the worker has no areaId yet, but its free-text dept
            // might name the same department as the rule's Area — without
            // this fallback the backfill converts zero AREA rules, because
            // no worker has areaId filled in (that gap is the reason this
            // migration exists).
            const area = await prisma.area.findUnique({ where: { id: rule.scopeAreaId }, select: { name: true } });
            matches = Boolean(area && normalizeText(area.name) === normalizeText(worker.employee.dept));
          }
        } else if (rule.scopeType === CompetenceRequirementScope.WORKSTATION && rule.scopeWorkstationId) {
          const occupationalHealthWorker = occupationalHealthByEmployeeNo.get(worker.employee.employeeNo);
          matches = occupationalHealthWorker?.workstationId === rule.scopeWorkstationId;
        }

        if (matches) {
          matchedAny = true;
          toCreate.set(`${worker.id}:${rule.competenceTypeId}`, { competenceWorkerId: worker.id, competenceTypeId: rule.competenceTypeId });
        }
      }

      if (matchedAny) {
        totalRulesConverted += 1;
      } else {
        unconvertedRules.push({ plantCode: plant.code, ruleId: rule.id, scopeType: rule.scopeType });
      }
    }

    for (const entry of toCreate.values()) {
      await prisma.competenceWorkerRequirement.upsert({
        where: { competenceWorkerId_competenceTypeId: entry },
        update: {},
        create: { plantId: plant.id, ...entry, isRequired: true },
      });
      totalRequirementsCreated += 1;
    }

    console.log(`[${plant.code}] ${rules.length} active rule(s) -> ${toCreate.size} worker requirement(s)`);
  }

  console.log(`\nTotal: ${totalRulesConverted} rule(s) converted, ${totalRequirementsCreated} CompetenceWorkerRequirement row(s) created.`);
  if (unconvertedRules.length > 0) {
    console.log(`\n${unconvertedRules.length} rule(s) matched no worker at all:`);
    for (const entry of unconvertedRules) {
      console.log(`  - plant ${entry.plantCode}, rule ${entry.ruleId}, scope ${entry.scopeType}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Register the npm script**

In `package.json`, add this line next to `"db:backfill-master-data-translations": "tsx scripts/backfill-master-data-translations.ts",`:

```json
    "db:backfill-competence-worker-requirements": "tsx scripts/backfill-competence-worker-requirements.ts",
```

- [ ] **Step 3: Run it against the local dev database**

Run: `cd c:\HSE\ma-hse && npm run db:backfill-competence-worker-requirements`
Expected: one summary line per plant, plus a total line, plus a list of any rules that matched nobody (expected to be non-empty if a `ROLE` rule's `scopeRoleName` never matches any enrolled worker's `roleName` — that is a pre-existing data-quality gap the backfill can't invent an answer for, not a bug in the script). Read the output before continuing — Task 7 permanently removes `CompetenceRequirement`, so this is the only chance to review what converted.

- [ ] **Step 4: Spot-check with Prisma Studio (optional but recommended)**

Run: `cd c:\HSE\ma-hse && npx prisma studio`, open `CompetenceWorkerRequirement`, and confirm row counts roughly match the summary printed in Step 3.

- [ ] **Step 5: Commit**

```bash
cd c:\HSE\ma-hse
git add scripts/backfill-competence-worker-requirements.ts package.json
git commit -m "feat(competences): add one-off backfill script for CompetenceWorkerRequirement"
```

(The backfilled *data* is not itself committed — only the script. Running it again in another environment, e.g. staging, is a manual deploy step, not something this plan automates.)

---

## Task 4: Read isRequired from CompetenceWorkerRequirement in recomputeAndSaveState

**Files:**
- Modify: `lib/services/competence-service.ts:240-267, 294-409`
- Modify: `lib/services/competence-state-service.ts` (remove `resolveCompetenceRequirement` and its supporting types)
- Test: `tests/unit/competence-service.test.ts` (rewrite `stubRecomputeDependencies` and the tests that depend on it)
- Test: `tests/unit/competence-requirement-resolution.test.ts` — **delete this file** (its subject, `resolveCompetenceRequirement`, no longer exists — see Task 7 for the full removal list; deleting it here rather than in Task 7 because this task is what makes it obsolete)

**Interfaces:**
- Consumes: `tx.competenceWorkerRequirement.findUnique({ where: { competenceWorkerId_competenceTypeId: {...} } })` (Task 2's new delegate).
- Produces: `recomputeAndSaveState` keeps its exact same external signature (`{plantId, competenceWorkerId, competenceTypeId, now, expiringThresholdDays, medicalFitnessBlocksAuthorization}` in, `ComputedCompetenceCellState` out) — every caller (`registerTraining`, `registerAssessment`, `grantAuthorization`, `suspendAuthorization`, `reactivateAuthorization`, `revokeAuthorization`, `updateWorkerRole`, `recomputeCompetenceTypeStatesInTx`, `recomputeAllStates`) is unaffected by this task.

- [ ] **Step 1: Remove resolveCompetenceRequirement from competence-state-service.ts**

In `lib/services/competence-state-service.ts`, delete:
- The `import { ..., CompetenceRequirementScope, ... } from "@prisma/client"` — remove `CompetenceRequirementScope` from that import list (keep `AuthorizationStatus`, `CompetenceAssessmentResult`, `CompetenceCellState`, `TrainingResult`).
- The `normalizeText` function (lines 85-91) — it was only used by `resolveCompetenceRequirement`.
- `export type RequirementRuleForResolution = {...}` (lines 93-99).
- `export type WorkerForRequirementResolution = {...}` (lines 101-105).
- `export type ResolvedCompetenceRequirement = {...}` (lines 107-110).
- The whole `export function resolveCompetenceRequirement(...) {...}` function (lines 112-160), including its doc comment.

Everything else in the file (the timezone helpers, `computeCompetenceCellState` itself, the blocked-reason constants) stays exactly as-is.

- [ ] **Step 2: Delete the now-obsolete resolution test file**

```bash
cd c:\HSE\ma-hse
git rm tests/unit/competence-requirement-resolution.test.ts
```

- [ ] **Step 3: Write the new failing test for recomputeAndSaveState's new resolution source**

In `tests/unit/competence-service.test.ts`, replace the `stubRecomputeDependencies` helper (lines 129-157) with:

```typescript
function stubRecomputeDependencies() {
  transactionMock.$executeRaw.mockResolvedValue(0);
  transactionMock.occupationalHealthWorker.findUnique.mockResolvedValue(null);
  transactionMock.competenceWorker.findMany.mockResolvedValue([]);
  transactionMock.competenceType.findUniqueOrThrow.mockResolvedValue({ id: "type-forklift", requiresAssessment: true });
  transactionMock.competenceWorker.findUniqueOrThrow.mockResolvedValue({
    id: "worker-1",
    areaId: "area-1",
    roleName: null,
    employee: { employeeNo: "001" },
  });
  transactionMock.workerAuthorization.findMany.mockResolvedValue([]);
  transactionMock.trainingRecord.findMany.mockResolvedValue([]);
  transactionMock.competenceAssessment.findMany.mockResolvedValue([]);
  transactionMock.workerCompetenceState.upsert.mockResolvedValue({});
  // §3.2 (revised): isRequired now comes from a direct per-(worker,type) row,
  // not a resolved rule set. Individual tests override this per-call when
  // they need a specific pair to be required or not.
  transactionMock.competenceWorkerRequirement.findUnique.mockResolvedValue({
    isRequired: true,
    setBy: { name: "N3 Safety" },
  });
  prismaMock.prisma.occupationalHealthWorker.findUnique.mockResolvedValue(null);
}
```

Add `competenceWorkerRequirement: { findUnique: vi.fn() }` to the `transactionMock` hoisted object (right after the existing `occupationalHealthWorker: { findUnique: vi.fn() }` entry inside `transactionMock`, around line 41-43).

Remove the now-invalid `prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([...])` block from inside `stubRecomputeDependencies` (it was mocking a delegate that no longer exists on the real client after Task 7, and is no longer read by `recomputeAndSaveState` after this task regardless).

- [ ] **Step 4: Run the affected describe blocks to see them fail for the right reason**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "updateWorkerRole"`
Expected: FAIL — `recomputeAndSaveState` still calls `loadActiveRequirements`/`resolveCompetenceRequirement` against `prismaMock.prisma.competenceRequirement`, not `transactionMock.competenceWorkerRequirement`, so the mock set up in Step 3 is never consulted and the assertions on `isRequired`/gaps diverge from what Step 3 now expects.

- [ ] **Step 5: Rewrite recomputeAndSaveState's resolution source**

In `lib/services/competence-service.ts`, replace the `recomputeAndSaveState` function body (lines 294-409) — specifically the `Promise.all` at lines 305-336, the `occupationalHealthWorker` query at lines 342-345, and the `resolveCompetenceRequirement` call at lines 347-355 — with:

```typescript
async function recomputeAndSaveState(
  tx: TransactionClient,
  input: {
    plantId: string;
    competenceWorkerId: string;
    competenceTypeId: string;
    now: Date;
    expiringThresholdDays: number;
    medicalFitnessBlocksAuthorization: boolean;
  },
) {
  const [competenceType, competenceWorker, authorizations, trainingRecords, assessments, workerRequirement] = await Promise.all([
    tx.competenceType.findUniqueOrThrow({ where: { id: input.competenceTypeId } }),
    tx.competenceWorker.findUniqueOrThrow({
      where: { id: input.competenceWorkerId },
      include: { employee: { select: { employeeNo: true } } },
    }),
    tx.workerAuthorization.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: {
        id: true,
        status: true,
        validUntil: true,
        suspensionReason: true,
        revocationReason: true,
        trainingRecordId: true,
        grantedAt: true,
      },
    }),
    tx.trainingRecord.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: { id: true, result: true, completedAt: true, certificateExpiresAt: true },
    }),
    tx.competenceAssessment.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: { id: true, result: true, assessedAt: true, trainingRecordId: true },
    }),
    // §3.2 (revised): direct per-(worker,type) lookup, replacing the old
    // role/area/workstation rule resolution — a rule set no longer exists,
    // only this one row (or its absence, meaning not required).
    tx.competenceWorkerRequirement.findUnique({
      where: {
        competenceWorkerId_competenceTypeId: {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
        },
      },
      include: { setBy: { select: { name: true } } },
    }),
  ]);

  // Read unconditionally: validUntil is still the only occupational-health
  // field ever read for medical fitness (never examDate or status, §2.1).
  const occupationalHealthWorker = await tx.occupationalHealthWorker.findUnique({
    where: { plantId_employeeNo: { plantId: input.plantId, employeeNo: competenceWorker.employee.employeeNo } },
    select: { validUntil: true },
  });

  const isRequired = workerRequirement?.isRequired ?? false;
  const requirementSource = workerRequirement?.setBy?.name ?? null;
```

Leave everything from `const medicalFitnessExpired = ...` (the old line 357) through the end of the function completely unchanged — it already only reads `isRequired`/`requirementSource` as plain local values, which still exist under those same names.

- [ ] **Step 6: Remove the now-dead loadActiveRequirements and loadWorkstationIdsByEmployeeNo helpers**

In `lib/services/competence-service.ts`, delete:
- `async function loadActiveRequirements(plantId: string): Promise<RequirementRuleForResolution[]> {...}` (lines 247-258) — its only caller was `recomputeAndSaveState` (removed in Step 5) and `enroll` (rewritten in Task 5).
- `async function loadWorkstationIdsByEmployeeNo(...) {...}` (lines 260-267) — its only caller is `enroll`, rewritten in Task 5 to no longer need it. (If Task 5 has not been done yet at this point, leave this one in place until Task 5's Step 1 removes it — do not delete it here if `enroll` still calls it, or the file won't compile.)
- Remove `RequirementRuleForResolution` and `resolveCompetenceRequirement` from the `import {...} from "@/lib/services/competence-state-service"` block at the top of the file (lines 25-31) — keep `COMPETENCE_TIMEZONE`, `computeCompetenceCellState`, `type ComputedCompetenceCellState`.
- Remove `CompetenceRequirementScope` from the `import {...} from "@prisma/client"` block at the top of the file **only if** nothing else in the file still references it — at this point in the plan `upsertRequirement`/`deactivateRequirement`/`listRequirements` (removed in Task 6) still use it, so leave the import in place until Task 6.

- [ ] **Step 7: Run the updateWorkerRole tests again**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "updateWorkerRole"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts lib/services/competence-state-service.ts tests/unit/competence-service.test.ts
git rm tests/unit/competence-requirement-resolution.test.ts
git commit -m "refactor(competences): resolve isRequired from CompetenceWorkerRequirement, not scoped rules"
```

---

## Task 5: Simplify enroll() — no more requirement resolution at enrollment time

**Files:**
- Modify: `lib/services/competence-service.ts:518-633`
- Test: `tests/unit/competence-service.test.ts:159-323`

**Interfaces:**
- Consumes: `getCompetenceExpiringThresholdDays`, `getMedicalFitnessBlocksAuthorization` (already imported), `recomputeAndSaveState` (Task 4's rewritten version).
- Produces: `CompetenceService.enroll` keeps its exact same public signature (`plantId, input: EnrollCompetenceWorkersInput, actorUserId`) and return shape (array of created `CompetenceWorker` rows) — only its internal per-type state computation changes.

- [ ] **Step 1: Write the failing test for the new (simpler) enrollment behavior**

In `tests/unit/competence-service.test.ts`, replace the `describe("CompetenceService.enroll", ...)` block (lines 159-323) — which currently contains 4 tests exercising `ALL_WORKERS`/`ROLE`/`AREA`/`WORKSTATION` scope resolution at enrollment — with:

```typescript
describe("CompetenceService.enroll", () => {
  beforeEach(() => {
    prismaMock.prisma.occupationalHealthWorker.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enrolls a worker with every competence type NOT_APPLICABLE — no CompetenceWorkerRequirement row exists yet at enrollment time", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([
      { id: "employee-1", employeeNo: "001", name: "Ana Silva", dept: "Logistics" },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", isActive: true, displayOrder: 0 },
    ]);
    transactionMock.competenceWorker.upsert.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: "area-1",
      roleName: null,
    });
    transactionMock.competenceType.findUniqueOrThrow.mockResolvedValue({ id: "type-forklift", requiresAssessment: true });
    transactionMock.competenceWorker.findUniqueOrThrow.mockResolvedValue({
      id: "worker-1",
      areaId: "area-1",
      roleName: null,
      employee: { employeeNo: "001" },
    });
    transactionMock.workerAuthorization.findMany.mockResolvedValue([]);
    transactionMock.trainingRecord.findMany.mockResolvedValue([]);
    transactionMock.competenceAssessment.findMany.mockResolvedValue([]);
    transactionMock.competenceWorkerRequirement.findUnique.mockResolvedValue(null);
    transactionMock.occupationalHealthWorker.findUnique.mockResolvedValue(null);
    transactionMock.workerCompetenceState.upsert.mockResolvedValue({});

    const result = await CompetenceService.enroll(
      "plant-1",
      { workers: [{ employeeDirectoryId: "employee-1", areaId: "area-1" }] },
      "user-1",
    );

    expect(result).toHaveLength(1);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(1);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isRequired: false, state: CompetenceCellState.NOT_APPLICABLE }),
      }),
    );
  });

  it("rejects employees that do not belong to the plant before opening a transaction", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);

    await expect(
      CompetenceService.enroll("plant-1", { workers: [{ employeeDirectoryId: "employee-x", areaId: "area-1" }] }, "user-1"),
    ).rejects.toThrow(/Employee not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

(The four scope-specific enrollment tests this replaces — `ALL_WORKERS`/`ROLE`/`AREA`/`WORKSTATION` matching at enroll time — no longer describe real behavior: enrollment never resolves a rule set anymore, so there is nothing left to assert about scope matching at this point in the flow. Their coverage moves to Task 4's `recomputeAndSaveState` tests, which already exercise `CompetenceWorkerRequirement` resolution directly.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "CompetenceService.enroll"`
Expected: FAIL — `enroll` still calls `loadActiveRequirements`/`resolveCompetenceRequirement`/`loadWorkstationIdsByEmployeeNo`, none of which the new test's mocks populate, so it throws or produces a mismatched call.

- [ ] **Step 3: Rewrite enroll()**

In `lib/services/competence-service.ts`, replace the whole `enroll` method (lines 518-633) with:

```typescript
  /**
   * Enrolls one or more employees into the competence matrix. §3.2 (revised):
   * nothing is required at enrollment time — CompetenceWorkerRequirement
   * rows are set explicitly afterward, per worker, from the profile screen
   * (Task 8). Every cell starts NOT_APPLICABLE, computed through the same
   * recomputeAndSaveState path a later requirement-toggle uses, so enrollment
   * never produces a state a normal recompute couldn't also produce.
   */
  async enroll(plantId: string, input: EnrollCompetenceWorkersInput, actorUserId: string | null) {
    const employeeIds = input.workers.map((worker) => worker.employeeDirectoryId);
    const areaIds = Array.from(new Set(input.workers.map((worker) => worker.areaId)));

    const [employees, areas, competenceTypes, expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      prisma.employeeDirectory.findMany({
        where: { id: { in: employeeIds }, plantId },
        select: { id: true, employeeNo: true, name: true, dept: true },
      }),
      prisma.area.findMany({
        where: { id: { in: areaIds }, plantId },
        select: { id: true },
      }),
      loadActiveCompetenceTypes(plantId),
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const validAreaIds = new Set(areas.map((area) => area.id));

    for (const worker of input.workers) {
      if (!employeeById.has(worker.employeeDirectoryId)) {
        throw new Error(`Employee not found for plant scope: ${worker.employeeDirectoryId}`);
      }
      if (!validAreaIds.has(worker.areaId)) {
        throw new Error(`Area not found for plant scope: ${worker.areaId}`);
      }
    }

    const now = new Date();
    const enrolled = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const workerInput of input.workers) {
        const employee = employeeById.get(workerInput.employeeDirectoryId)!;

        const competenceWorker = await tx.competenceWorker.upsert({
          where: {
            plantId_employeeDirectoryId: {
              plantId,
              employeeDirectoryId: workerInput.employeeDirectoryId,
            },
          },
          update: {
            areaId: workerInput.areaId,
            isActive: true,
          },
          create: {
            plantId,
            employeeDirectoryId: workerInput.employeeDirectoryId,
            areaId: workerInput.areaId,
            roleName: null,
            addedById: actorUserId,
          },
        });

        for (const competenceType of competenceTypes) {
          await recomputeAndSaveState(tx, {
            plantId,
            competenceWorkerId: competenceWorker.id,
            competenceTypeId: competenceType.id,
            now,
            expiringThresholdDays,
            medicalFitnessBlocksAuthorization,
          });
        }

        await writeAuditLog({
          entityType: "CompetenceWorker",
          entityId: competenceWorker.id,
          action: "ENROLLED",
          actorUserId,
          plantId,
          diff: buildDiff(null, {
            employeeDirectoryId: workerInput.employeeDirectoryId,
            employeeNo: employee.employeeNo,
            areaId: workerInput.areaId,
          }),
        }, tx);

        results.push(competenceWorker);
      }

      return results;
    });

    return enrolled;
  },
```

- [ ] **Step 4: Remove the now-fully-dead loadWorkstationIdsByEmployeeNo helper**

`enroll` was its only remaining caller (Task 4 already removed the one in `recomputeAndSaveState`). Delete `async function loadWorkstationIdsByEmployeeNo(...) {...}` from `lib/services/competence-service.ts` now.

- [ ] **Step 5: Run to verify it passes**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "CompetenceService.enroll"`
Expected: PASS.

- [ ] **Step 6: Run the full service test file for regressions**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts`
Expected: PASS except for the `describe("CompetenceService — requirement matrix CRUD ...")` block (lines 1155-1292 in the original file) — those tests target `listRequirements`/`upsertRequirement`/`deactivateRequirement`/`getRequirementCoverage`, removed in Task 6. Confirm the failures are limited to that block; anything else failing is a real regression to fix before continuing.

- [ ] **Step 7: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts tests/unit/competence-service.test.ts
git commit -m "refactor(competences): enroll() no longer resolves a requirement rule set"
```

---

## Task 6: Add setWorkerCompetenceRequirement, remove the old rule-matrix CRUD methods

**Files:**
- Modify: `lib/services/competence-service.ts`
- Modify: `lib/validation/dtos.ts`
- Test: `tests/unit/competence-service.test.ts:1155-1292` (replace the whole describe block)

**Interfaces:**
- Produces: `CompetenceService.setWorkerCompetenceRequirement(plantId, competenceWorkerId, competenceTypeId, input: SetCompetenceWorkerRequirementInput, actorUserId)` — consumed by Task 9's new route.
- Removes: `CompetenceService.listRequirements`, `upsertRequirement`, `deactivateRequirement`, `getRequirementCoverage`, `CompetenceRequirementView`, `CompetenceRequirementCoverage` — consumed today only by the requirement-matrix UI/route removed in Task 7; removing them here first (before Task 7 deletes their callers) keeps this task's diff reviewable as "service layer" separate from "route/UI layer."

- [ ] **Step 1: Write the failing test for setWorkerCompetenceRequirement**

In `tests/unit/competence-service.test.ts`, replace the entire `describe("CompetenceService — requirement matrix CRUD (§3.2 admin screen)", ...)` block (from `describe("CompetenceService — requirement matrix CRUD (§3.2 admin screen)", () => {` through its matching closing `});`, i.e. what was lines 1155-1292) with:

```typescript
describe("CompetenceService.setWorkerCompetenceRequirement — §2.4, per-worker marking replaces the rule matrix", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
  });

  afterEach(() => vi.clearAllMocks());

  it("creates a requirement row, recomputes that one pair, and audits the change", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1", plantId: "plant-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", plantId: "plant-1", name: "Forklift" });
    transactionMock.competenceWorkerRequirement.findUnique
      .mockResolvedValueOnce(null) // "does it already exist" check before the upsert
      .mockResolvedValueOnce({ isRequired: true, setBy: { name: "N3 Safety" } }); // read back inside recomputeAndSaveState
    transactionMock.competenceWorkerRequirement.upsert = vi.fn().mockResolvedValue({ id: "req-1", isRequired: true, setAt: new Date("2026-08-26") });

    const result = await CompetenceService.setWorkerCompetenceRequirement(
      "plant-1",
      "worker-1",
      "type-forklift",
      { isRequired: true, notes: null },
      "user-1",
    );

    expect(transactionMock.competenceWorkerRequirement.upsert).toHaveBeenCalledWith({
      where: { competenceWorkerId_competenceTypeId: { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift" } },
      update: { isRequired: true, notes: null, setById: "user-1", setAt: expect.any(Date) },
      create: { plantId: "plant-1", competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", isRequired: true, notes: null, setById: "user-1" },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "CompetenceWorkerRequirement", action: "UPDATED" }), transactionMock);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(1);
    expect(result.isRequired).toBe(true);
  });

  it("dispatches ROLE_WITHOUT_COMPETENCE when marking a competence required immediately produces a MISSING gap", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1", plantId: "plant-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", plantId: "plant-1", name: "Forklift" });
    transactionMock.competenceWorkerRequirement.upsert = vi.fn().mockResolvedValue({ id: "req-1", isRequired: true, setAt: new Date() });
    transactionMock.competenceWorkerRequirement.findUnique.mockResolvedValue({ isRequired: true, setBy: { name: "N3 Safety" } });
    transactionMock.competenceType.findUniqueOrThrow.mockResolvedValue({ id: "type-forklift", requiresAssessment: true });

    await CompetenceService.setWorkerCompetenceRequirement("plant-1", "worker-1", "type-forklift", { isRequired: true, notes: null }, "user-1");

    expect(competenceAlertServiceMock.CompetenceAlertService.dispatchRoleWithoutCompetence).toHaveBeenCalledWith(
      "plant-1",
      [{ competenceWorkerId: "worker-1", competenceTypeId: "type-forklift" }],
      expect.any(Date),
    );
  });

  it("rejects a worker or competence type outside the plant scope before opening a transaction", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue(null);
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", plantId: "plant-1", name: "Forklift" });

    await expect(
      CompetenceService.setWorkerCompetenceRequirement("plant-1", "worker-x", "type-forklift", { isRequired: true, notes: null }, "user-1"),
    ).rejects.toThrow(/not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

Add `upsert: vi.fn()` to the `transactionMock.competenceWorkerRequirement` object declared in Task 4 Step 3 (it currently only has `findUnique`).

- [ ] **Step 2: Add the DTO**

In `lib/validation/dtos.ts`, replace `upsertCompetenceRequirementInput` and `deleteCompetenceRequirementInput` (lines 931-954) with:

```typescript
export const setCompetenceWorkerRequirementInput = z.object({
  isRequired: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});
```

Replace the corresponding type exports near the bottom of the file (`export type UpsertCompetenceRequirementInput = ...` and `export type DeleteCompetenceRequirementInput = ...`, around lines 1215-1216) with:

```typescript
export type SetCompetenceWorkerRequirementInput = z.infer<typeof setCompetenceWorkerRequirementInput>;
```

- [ ] **Step 3: Remove CompetenceRequirementScope from dtos.ts's Prisma import**

At the top of `lib/validation/dtos.ts`, remove `CompetenceRequirementScope` from the `import {...} from "@prisma/client"` list — this was the only remaining consumer of that enum in the file after Step 2's replacement.

- [ ] **Step 4: Run to verify the new tests fail**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "setWorkerCompetenceRequirement"`
Expected: FAIL with `CompetenceService.setWorkerCompetenceRequirement is not a function`.

- [ ] **Step 5: Add setWorkerCompetenceRequirement, remove the four old methods**

In `lib/services/competence-service.ts`:

Remove the `listRequirements`, `upsertRequirement`, `deactivateRequirement`, and `getRequirementCoverage` methods in their entirety (everything from `/** §3.2 admin screen: ... */` through `getRequirementCoverage`'s closing `},`) — this is the block that was lines 1562-1768 before Task 5's edits shifted line numbers; locate it by the method names, not the line numbers.

Remove the now-unused `CompetenceRequirementView` and `CompetenceRequirementCoverage` type exports (originally lines 91-113) — nothing outside this file constructs them anymore once Task 7 deletes the requirement-manager component and route.

Remove `CompetenceRequirementScope` from this file's own `import {...} from "@prisma/client"` block — `upsertRequirement`/`deactivateRequirement` were its only remaining callers in this file.

In their place, add:

```typescript
  /**
   * §2.4: sets or clears whether one competence is required for one enrolled
   * worker — the entire replacement for the old role/area/workstation rule
   * matrix. Always upserts a row (never deletes it) even when isRequired is
   * false, so "who unmarked this and when" stays visible in the worker
   * profile, matching the rest of the module's audit-trail convention.
   */
  async setWorkerCompetenceRequirement(
    plantId: string,
    competenceWorkerId: string,
    competenceTypeId: string,
    input: SetCompetenceWorkerRequirementInput,
    actorUserId: string,
  ) {
    const { competenceWorker, competenceType } = await assertWorkerAndTypeInPlant(plantId, competenceWorkerId, competenceTypeId);
    void competenceWorker;

    const now = new Date();
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    const { requirement, computed } = await prisma.$transaction(async (tx) => {
      const requirement = await tx.competenceWorkerRequirement.upsert({
        where: { competenceWorkerId_competenceTypeId: { competenceWorkerId, competenceTypeId } },
        update: { isRequired: input.isRequired, notes: input.notes ?? null, setById: actorUserId, setAt: now },
        create: {
          plantId,
          competenceWorkerId,
          competenceTypeId,
          isRequired: input.isRequired,
          notes: input.notes ?? null,
          setById: actorUserId,
        },
      });

      await writeAuditLog({
        entityType: "CompetenceWorkerRequirement",
        entityId: requirement.id,
        action: "UPDATED",
        actorUserId,
        plantId,
        diff: buildDiff(null, { competenceWorkerId, competenceTypeId, isRequired: input.isRequired }),
      }, tx);

      const computed = await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId,
        competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return { requirement, computed };
    });

    if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
      gaps.push({ competenceWorkerId, competenceTypeId });
    }

    if (gaps.length > 0) {
      try {
        await CompetenceAlertService.dispatchRoleWithoutCompetence(plantId, gaps, now);
      } catch (error) {
        logger.error({ error, plantId, competenceWorkerId, competenceTypeId }, "failed_to_dispatch_role_without_competence_alert");
      }
    }

    void competenceType;
    return requirement;
  },
```

Update the `import type {...} from "@/lib/validation/dtos"` block at the top of the file: remove `UpsertCompetenceRequirementInput`, add `SetCompetenceWorkerRequirementInput`.

- [ ] **Step 6: Run to verify the new tests pass**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "setWorkerCompetenceRequirement"`
Expected: PASS.

- [ ] **Step 7: Run the full service test file**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts`
Expected: PASS. (Task 7 still needs to remove the requirement-manager route/component/tests that reference the now-deleted `CompetenceService.listRequirements` etc. — those are separate files, handled next, not part of this test file.)

- [ ] **Step 8: Type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "competence-service|competence-requirement-manager|admin.page|competence-requirements.route"`
Expected: errors in `competence-requirement-manager.tsx`, `admin/page.tsx`, and `app/api/.../admin/competence-requirements/route.ts` — those are exactly the files Task 7 removes/fixes next. No errors should appear in `competence-service.ts` itself.

- [ ] **Step 9: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts lib/validation/dtos.ts tests/unit/competence-service.test.ts
git commit -m "feat(competences): add setWorkerCompetenceRequirement, remove requirement-rule CRUD"
```

---

## Task 7: Remove the requirement-matrix route, component, admin-page wiring, and drop CompetenceRequirement from the schema

**Files:**
- Delete: `app/api/plants/[plantCode]/admin/competence-requirements/route.ts`
- Delete: `components/feature/competence-requirement-manager.tsx`
- Delete: `tests/unit/competence-requirements-route.test.ts`
- Modify: `app/(secure)/app/[plant]/admin/page.tsx`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_drop_competence_requirement/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing new.
- Removes: `CompetenceRequirement` model, `CompetenceRequirementScope` enum, and every relation field pointing at them (`Plant.competenceRequirements`, `Area.competenceRequirements`, `Workstation.competenceRequirements`, `CompetenceType.requirements`, `User.createdCompetenceRequirements`).

- [ ] **Step 1: Delete the requirement-matrix route, component, and its route test**

```bash
cd c:\HSE\ma-hse
git rm app/api/plants/[plantCode]/admin/competence-requirements/route.ts
git rm components/feature/competence-requirement-manager.tsx
git rm tests/unit/competence-requirements-route.test.ts
```

- [ ] **Step 2: Remove the requirement-manager mounting from the admin page**

In `app/(secure)/app/[plant]/admin/page.tsx`:

Remove the import line `import { CompetenceRequirementManager } from "@/components/feature/competence-requirement-manager";`.

In the `Promise.all` array destructuring, remove `competenceRequirements,` and `competenceRequirementCoverage,` from the `const [...] =` list, and remove the two corresponding entries from the `Promise.all([...])` call itself:

```typescript
    canViewCompetenceCatalog
      ? CompetenceService.listRequirements(plantRow.id, uiLocale)
      : Promise.resolve([]),
    canViewCompetenceCatalog
      ? CompetenceService.getRequirementCoverage(plantRow.id)
      : Promise.resolve({ totalRoles: 0, rolesWithRequirement: 0, roleNamesWithoutRequirement: [], workersWithoutRoleName: 0, totalWorkers: 0 }),
```

In the JSX, remove the whole `<CompetenceRequirementManager ... />` element (the block starting `<CompetenceRequirementManager` and ending at its self-closing `/>`), leaving `<CompetenceTypeManager ... />` as the sole child of the `canViewCompetenceCatalog ? (<>...</>) : null` block — collapse the now-single-child `<>...</>` fragment if you prefer, but it is not required for correctness.

- [ ] **Step 3: Type-check to confirm the admin page compiles**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "admin/page.tsx"`
Expected: no output.

- [ ] **Step 4: Remove CompetenceRequirement from the schema**

In `prisma/schema.prisma`:
- Delete the entire `model CompetenceRequirement {...}` block and the `enum CompetenceRequirementScope {...}` block that follows it (originally lines 464-492).
- Remove `competenceRequirements CompetenceRequirement[]` from `model Plant` (line 28).
- Remove `competenceRequirements CompetenceRequirement[]` from `model Area` (line 185).
- Remove `competenceRequirements CompetenceRequirement[]` from `model Workstation` (line 217).
- Remove `requirements CompetenceRequirement[]` from `model CompetenceType` (it sits next to the `workerRequirements CompetenceWorkerRequirement[]` line Task 2 added — remove only the `CompetenceRequirement[]` one).
- Remove `createdCompetenceRequirements CompetenceRequirement[] @relation("CompetenceRequirementCreatedBy")` from `model User` (it sits next to the `setCompetenceWorkerRequirements` line Task 2 added — remove only the `CompetenceRequirement[]` one).

- [ ] **Step 5: Validate**

Run: `cd c:\HSE\ma-hse && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 6: Kill the dev server, then generate the drop migration**

Confirm no `next dev`/`npm run dev:all` process is running (same Windows EPERM caveat as Task 2 Step 4).

Run: `cd c:\HSE\ma-hse && npx prisma migrate dev --name drop_competence_requirement`
Expected: a new migration containing `DROP TABLE "CompetenceRequirement"` and `DROP TYPE "CompetenceRequirementScope"` (plus the FK/index drops Prisma emits ahead of them). Confirm this migration runs **after** Task 3's backfill script has already been executed against this same database — dropping the table first would make the backfill's source data unavailable.

- [ ] **Step 7: Full type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i competence`
Expected: no output referencing `CompetenceRequirement`, `competenceRequirement`, `CompetenceRequirementScope`, `CompetenceRequirementManager`, `listRequirements`, `upsertRequirement`, `deactivateRequirement`, or `getRequirementCoverage`.

- [ ] **Step 8: Run the full unit suite**

Run: `cd c:\HSE\ma-hse && npx vitest run`
Expected: all tests pass. (Any remaining failures at this point are pre-existing and unrelated to this plan — do not silently accept a competence-related failure here.)

- [ ] **Step 9: Commit**

```bash
cd c:\HSE\ma-hse
git add -A
git commit -m "feat(competences): remove the requirement-rule matrix (schema, route, UI)"
```

---

## Task 8: Extend the worker profile API to carry per-competence requirement state

**Files:**
- Modify: `lib/services/competence-service.ts` (`CompetenceWorkerCompetenceRow` type and `getWorkerProfile`)
- Test: `tests/unit/competence-service.test.ts`

**Interfaces:**
- Produces: `CompetenceWorkerCompetenceRow` gains `requirementSetAt: Date | null` — consumed by Task 9's checkbox UI to show "marked by X on \<date\>".

- [ ] **Step 1: Write the failing test**

In `tests/unit/competence-service.test.ts`, find the `describe("CompetenceService — N5_OPERATOR only sees their own record, enforced in the service (rule §2.3)", ...)` block's `getWorkerProfile()` test (or any nearby `getWorkerProfile` test) and add a new one in the same file:

```typescript
describe("CompetenceService.getWorkerProfile — requirement metadata (§2.4)", () => {
  afterEach(() => vi.clearAllMocks());

  it("includes requirementSetAt alongside the existing requirementSource (who) for each competence row", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: null,
      roleName: null,
      employee: { employeeNo: "001", name: "Ana Silva", dept: null },
      area: null,
    });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", name: "Forklift", category: "EQUIPMENT_OPERATION", isActive: true, displayOrder: 0 },
    ]);
    prismaMock.prisma.workerCompetenceState.findMany.mockResolvedValue([
      { competenceTypeId: "type-forklift", state: "MISSING", isRequired: true, requirementSource: "N3 Safety", validUntil: null, daysToExpiry: null, blockedReason: null, currentAuthorizationId: null },
    ]);
    prismaMock.prisma.occupationalHealthWorker.findUnique.mockResolvedValue(null);
    prismaMock.prisma.trainingRecord.findMany.mockResolvedValue([]);
    prismaMock.prisma.competenceAssessment.findMany.mockResolvedValue([]);
    prismaMock.prisma.workerAuthorization.findMany.mockResolvedValue([]);
    prismaMock.prisma.workstation.findMany.mockResolvedValue([]);
    prismaMock.prisma.competenceActionLink.findMany.mockResolvedValue([]);
    prismaMock.prisma.competenceWorkerRequirement.findMany.mockResolvedValue([
      { competenceTypeId: "type-forklift", setAt: new Date("2026-08-20T10:00:00.000Z") },
    ]);

    const profile = await CompetenceService.getWorkerProfile("plant-1", "worker-1", "pt", { role: RoleCode.N3_SAFETY, userId: "user-1" });

    expect(profile?.competences[0].requirementSetAt).toEqual(new Date("2026-08-20T10:00:00.000Z"));
  });
});
```

Add `competenceWorkerRequirement: { findMany: vi.fn() }` to the top-level `prismaMock.prisma` hoisted object (next to the existing `competenceWorker: { findMany: vi.fn(), findFirst: vi.fn() }` entry).

- [ ] **Step 2: Run to verify it fails**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "requirement metadata"`
Expected: FAIL — `profile.competences[0].requirementSetAt` is `undefined`, the field doesn't exist yet.

- [ ] **Step 3: Add the field**

In `lib/services/competence-service.ts`:

Add `requirementSetAt: Date | null;` to `CompetenceWorkerCompetenceRow` (right after the existing `requirementSource: string | null;` line).

In `getWorkerProfile`, add `prisma.competenceWorkerRequirement.findMany({ where: { competenceWorkerId }, select: { competenceTypeId: true, setAt: true } })` to the big `Promise.all([...])` (the one currently fetching `competenceTypes, states, occupationalHealthWorker, trainingRecords, assessments, authorizations, workstations, actionLinkRows`) — add it as a new destructured name `workerRequirements` and a new array element.

Right before the `const competences: CompetenceWorkerCompetenceRow[] = competenceTypes.map((type) => {...})` block, add:

```typescript
    const requirementSetAtByTypeId = new Map(workerRequirements.map((row) => [row.competenceTypeId, row.setAt]));
```

Inside that `.map()`'s returned object, add `requirementSetAt: requirementSetAtByTypeId.get(type.id) ?? null,` next to the existing `requirementSource: state?.requirementSource ?? null,` line.

- [ ] **Step 4: Run to verify it passes**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "requirement metadata"`
Expected: PASS.

- [ ] **Step 5: Run the full service test file**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts tests/unit/competence-service.test.ts
git commit -m "feat(competences): surface requirementSetAt in the worker profile"
```

---

## Task 9: Add the requirement-toggle API route

**Files:**
- Create: `app/api/plants/[plantCode]/competences/workers/[id]/requirements/route.ts`
- Create: `tests/unit/competence-worker-requirements-route.test.ts`

**Interfaces:**
- Consumes: `CompetenceService.setWorkerCompetenceRequirement` (Task 6), `setCompetenceWorkerRequirementInput` (Task 6's DTO — needs `competenceTypeId` added to the body schema for this route, since the DTO from Task 6 only carries `isRequired`/`notes`; see Step 1 below).
- Produces: `PATCH /api/plants/[plantCode]/competences/workers/[id]/requirements` — consumed by Task 13's checkbox UI.

- [ ] **Step 1: Extend the DTO with competenceTypeId (the route body needs to name which competence type it's toggling)**

In `lib/validation/dtos.ts`, change `setCompetenceWorkerRequirementInput` (added in Task 6 Step 2) to:

```typescript
export const setCompetenceWorkerRequirementInput = z.object({
  competenceTypeId: z.string().uuid(),
  isRequired: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});
```

This is a body-shape change only — `CompetenceService.setWorkerCompetenceRequirement`'s signature (Task 6) already takes `competenceTypeId` as its own positional argument, separate from `input`, so the route passes `parsed.data.competenceTypeId` positionally and `{ isRequired: parsed.data.isRequired, notes: parsed.data.notes }` as `input`. No service-layer change needed.

- [ ] **Step 2: Write the failing route test**

Create `tests/unit/competence-worker-requirements-route.test.ts`:

```typescript
import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn(async () => ({ id: "plant-1", code: "pl01" })) }));
const serviceMock = vi.hoisted(() => ({
  CompetenceService: { setWorkerCompetenceRequirement: vi.fn() },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/competence-service", () => serviceMock);

import { PATCH } from "@/app/api/plants/[plantCode]/competences/workers/[id]/requirements/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/plants/pl01/competences/workers/worker-1/requirements", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/plants/[plantCode]/competences/workers/[id]/requirements", () => {
  afterEach(() => vi.clearAllMocks());

  it("allows N4_SUPERVISOR to mark a competence required and returns the updated row", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N4_SUPERVISOR });
    serviceMock.CompetenceService.setWorkerCompetenceRequirement.mockResolvedValue({ id: "req-1", isRequired: true });

    const response = await PATCH(jsonRequest({ competenceTypeId: "00000000-0000-0000-0000-000000000001", isRequired: true }), {
      params: Promise.resolve({ plantCode: "pl01", id: "worker-1" }),
    });

    expect(response.status).toBe(200);
    expect(serviceMock.CompetenceService.setWorkerCompetenceRequirement).toHaveBeenCalledWith(
      "plant-1",
      "worker-1",
      "00000000-0000-0000-0000-000000000001",
      { isRequired: true, notes: undefined },
      "user-1",
    );
  });

  it("rejects a role outside N0/N1/N3/N4 before touching the service", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ error: new Response(null, { status: 403 }) });

    const response = await PATCH(jsonRequest({ competenceTypeId: "00000000-0000-0000-0000-000000000001", isRequired: true }), {
      params: Promise.resolve({ plantCode: "pl01", id: "worker-1" }),
    });

    expect(response.status).toBe(403);
    expect(serviceMock.CompetenceService.setWorkerCompetenceRequirement).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-worker-requirements-route.test.ts`
Expected: FAIL — the route file doesn't exist yet (module not found).

- [ ] **Step 4: Write the route**

Create `app/api/plants/[plantCode]/competences/workers/[id]/requirements/route.ts`:

```typescript
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { setCompetenceWorkerRequirementInput } from "@/lib/validation/dtos";

// §2.4: N3_SAFETY and N4_SUPERVISOR mark a competence required/not-required
// for a worker they know — the same roles allowed to register training and
// assessments (../../../trainings/route.ts). N0_ADMIN and N1_CORPORATE pass
// through requirePlantAccess's global bypass.
const REQUIREMENT_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, REQUIREMENT_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, setCompetenceWorkerRequirementInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const requirement = await CompetenceService.setWorkerCompetenceRequirement(
      plant.id,
      id,
      parsed.data.competenceTypeId,
      { isRequired: parsed.data.isRequired, notes: parsed.data.notes },
      auth.session.user.id,
    );
    return ok({ requirement });
  } catch (error) {
    return fail("SET_REQUIREMENT_FAILED", error instanceof Error ? error.message : "Failed to update the requirement", 422);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-worker-requirements-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd c:\HSE\ma-hse
git add app/api/plants/[plantCode]/competences/workers/[id]/requirements/route.ts tests/unit/competence-worker-requirements-route.test.ts lib/validation/dtos.ts
git commit -m "feat(competences): add per-worker requirement toggle route"
```

---

## Task 10: Add entryGroupId to TrainingRecord, CompetenceAssessment, WorkerAuthorization

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_competence_entry_group_id/migration.sql` (generated)

**Interfaces:**
- Produces: `entryGroupId String?` on all three models — consumed by Task 11's `registerCompetenceEntry`.

- [ ] **Step 1: Add the column and index to all three models**

In `prisma/schema.prisma`:

`model TrainingRecord` — add `entryGroupId String?` right after `plantId String` line, and `@@index([entryGroupId])` alongside the existing `@@index([competenceWorkerId, competenceTypeId, completedAt])` line.

`model CompetenceAssessment` — same: add `entryGroupId String?` after `plantId String`, add `@@index([entryGroupId])` alongside `@@index([competenceWorkerId, competenceTypeId, assessedAt])`.

`model WorkerAuthorization` — same: add `entryGroupId String?` after `plantId String`, add `@@index([entryGroupId])` alongside the existing two `@@index` lines.

- [ ] **Step 2: Validate**

Run: `cd c:\HSE\ma-hse && npx prisma validate`
Expected: valid.

- [ ] **Step 3: Kill the dev server, generate the migration**

Run: `cd c:\HSE\ma-hse && npx prisma migrate dev --name add_competence_entry_group_id`
Expected: three `ALTER TABLE ... ADD COLUMN "entryGroupId" TEXT` plus three `CREATE INDEX` statements, no drops.

- [ ] **Step 4: Type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i entryGroupId`
Expected: no output (nothing references the field yet — that's Task 11).

- [ ] **Step 5: Commit**

```bash
cd c:\HSE\ma-hse
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(competences): add entryGroupId to training/assessment/authorization"
```

---

## Task 11: Add CompetenceService.registerCompetenceEntry (unified transaction)

**Files:**
- Modify: `lib/services/competence-service.ts`
- Modify: `lib/validation/dtos.ts`
- Test: `tests/unit/competence-service.test.ts`

**Interfaces:**
- Consumes: `randomUUID` from `"crypto"` (new import), `assertWorkerAndTypeInPlant`, `recomputeAndSaveState`, `getAuthorizationSegregationOfDuties` (already imported).
- Produces: `CompetenceService.registerCompetenceEntry(plantId, input: RegisterCompetenceEntryInput, actorUserId)` returning `{ entryGroupId, trainingRecordId, assessmentRecordId, authorizationId }` — consumed by Task 12's route and Task 13's UI. Also produces `assertSegregationOfDuties`, a module-private helper also consumed by Task 14's rewrite of `grantAuthorization`.

- [ ] **Step 1: Add the DTO**

In `lib/validation/dtos.ts`, add after `grantAuthorizationInput` (after its closing `});` around line 917):

```typescript
export const registerCompetenceEntryInput = z.object({
  competenceWorkerId: z.string().uuid(),
  competenceTypeId: z.string().uuid(),
  // Present when appending an assessment/authorization to an entry whose
  // training was already registered in a previous submission — absent when
  // starting a brand-new entry, in which case `training` is required.
  entryGroupId: z.string().uuid().optional(),
  training: z.object({
    provider: z.string().trim().max(160).nullable().optional(),
    trainerName: z.string().trim().max(160).nullable().optional(),
    completedAt: z.coerce.date(),
    durationHours: z.coerce.number().positive().max(999).nullable().optional(),
    certificateNumber: z.string().trim().max(80).nullable().optional(),
    certificateExpiresAt: z.coerce.date().nullable().optional(),
    result: z.nativeEnum(TrainingResult).default(TrainingResult.PASSED),
    notes: z.string().trim().max(2000).nullable().optional(),
  }).optional(),
  assessment: z.object({
    assessedAt: z.coerce.date(),
    assessorUserId: z.string().uuid().nullable().optional(),
    assessorName: z.string().trim().max(160).nullable().optional(),
    method: z.nativeEnum(CompetenceAssessmentMethod).default(CompetenceAssessmentMethod.PRACTICAL_TEST),
    result: z.nativeEnum(CompetenceAssessmentResult),
    score: z.coerce.number().int().min(0).max(100).nullable().optional(),
    observations: z.string().trim().max(2000).nullable().optional(),
  }).superRefine((value, ctx) => {
    const hasInternal = Boolean(value.assessorUserId);
    const hasExternal = Boolean(value.assessorName && value.assessorName.trim());
    if (hasInternal === hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assessorUserId"],
        message: "Choose exactly one: an internal user (assessorUserId) or an external assessor name (assessorName)",
      });
    }
  }).optional(),
  authorization: z.object({
    validFrom: z.coerce.date(),
    restrictions: z.string().trim().max(500).nullable().optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.entryGroupId && !value.training) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["training"], message: "training is required when starting a new entry" });
  }
});

export type RegisterCompetenceEntryInput = z.infer<typeof registerCompetenceEntryInput>;
```

- [ ] **Step 2: Write the failing tests**

In `tests/unit/competence-service.test.ts`, add:

```typescript
describe("CompetenceService.registerCompetenceEntry — §3.2/§3.3, one submission across all three levels", () => {
  beforeEach(() => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1", plantId: "plant-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({
      id: "type-forklift", plantId: "plant-1", name: "Forklift", requiresTraining: true, requiresAssessment: true, requiresAuthorization: true, validityMonths: 12,
    });
    transactionMock.$executeRaw.mockResolvedValue(0);
    transactionMock.trainingRecord.create = vi.fn().mockResolvedValue({ id: "training-1", result: "PASSED" });
    transactionMock.competenceAssessment.create = vi.fn().mockResolvedValue({ id: "assessment-1", result: "COMPETENT", assessorUserId: null });
    transactionMock.competenceAssessment.findFirst = vi.fn().mockResolvedValue(null);
    transactionMock.trainingRecord.findFirst = vi.fn().mockResolvedValue({ id: "training-1" });
    transactionMock.workerAuthorization.findFirst = vi.fn().mockResolvedValue(null);
    transactionMock.workerAuthorization.create = vi.fn().mockResolvedValue({ id: "auth-1", sequenceNumber: 1 });
    stubRecomputeDependencies();
  });

  afterEach(() => vi.clearAllMocks());

  it("creates training only when assessment and authorization are both omitted, with a fresh entryGroupId", async () => {
    const result = await CompetenceService.registerCompetenceEntry(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        training: { completedAt: new Date("2026-08-01"), result: "PASSED" as const, provider: null, trainerName: null, durationHours: null, certificateNumber: null, certificateExpiresAt: null, notes: null },
      },
      "user-1",
    );

    expect(transactionMock.trainingRecord.create).toHaveBeenCalledTimes(1);
    expect(transactionMock.trainingRecord.create.mock.calls[0][0].data.entryGroupId).toEqual(expect.any(String));
    expect(transactionMock.competenceAssessment.create).not.toHaveBeenCalled();
    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(1);
    expect(result.trainingRecordId).toBe("training-1");
    expect(result.assessmentRecordId).toBeNull();
    expect(result.authorizationId).toBeNull();
  });

  it("creates training, assessment and authorization together in one submission, reusing the same entryGroupId across all three rows", async () => {
    const result = await CompetenceService.registerCompetenceEntry(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        training: { completedAt: new Date("2026-08-01"), result: "PASSED" as const, provider: null, trainerName: null, durationHours: null, certificateNumber: null, certificateExpiresAt: null, notes: null },
        assessment: { assessedAt: new Date("2026-08-02"), result: "COMPETENT" as const, assessorUserId: "assessor-1", assessorName: null, method: "PRACTICAL_TEST" as const, score: null, observations: null },
        authorization: { validFrom: new Date("2026-08-03"), restrictions: null },
      },
      "user-1",
    );

    const trainingGroupId = transactionMock.trainingRecord.create.mock.calls[0][0].data.entryGroupId;
    expect(transactionMock.competenceAssessment.create.mock.calls[0][0].data.entryGroupId).toBe(trainingGroupId);
    expect(transactionMock.workerAuthorization.create.mock.calls[0][0].data.entryGroupId).toBe(trainingGroupId);
    expect(transactionMock.workerAuthorization.create.mock.calls[0][0].data.trainingRecordId).toBe("training-1");
    expect(transactionMock.workerAuthorization.create.mock.calls[0][0].data.assessmentId).toBe("assessment-1");
    expect(result.authorizationId).toBe("auth-1");
  });

  it("continues an existing entry by entryGroupId, without creating a new training record", async () => {
    transactionMock.trainingRecord.findFirst = vi.fn().mockResolvedValue({ id: "training-1" });

    const result = await CompetenceService.registerCompetenceEntry(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        entryGroupId: "existing-group-1",
        assessment: { assessedAt: new Date("2026-08-02"), result: "COMPETENT" as const, assessorUserId: "assessor-1", assessorName: null, method: "PRACTICAL_TEST" as const, score: null, observations: null },
      },
      "user-1",
    );

    expect(transactionMock.trainingRecord.create).not.toHaveBeenCalled();
    expect(transactionMock.competenceAssessment.create.mock.calls[0][0].data.trainingRecordId).toBe("training-1");
    expect(result.trainingRecordId).toBe("training-1");
    expect(result.entryGroupId).toBe("existing-group-1");
  });

  it("rejects continuing an entryGroupId that has no training record for this worker/type", async () => {
    transactionMock.trainingRecord.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      CompetenceService.registerCompetenceEntry(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", entryGroupId: "missing-group", assessment: { assessedAt: new Date(), result: "COMPETENT" as const, assessorUserId: "assessor-1", assessorName: null, method: "PRACTICAL_TEST" as const, score: null, observations: null } },
        "user-1",
      ),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "registerCompetenceEntry"`
Expected: FAIL — `CompetenceService.registerCompetenceEntry is not a function`.

- [ ] **Step 4: Add randomUUID import**

At the top of `lib/services/competence-service.ts`, add `import { randomUUID } from "crypto";` (matching the pattern already used in `occupational-health-service.ts`).

- [ ] **Step 5: Add the segregation-of-duties helper**

Add this module-private function to `lib/services/competence-service.ts`, near `assertWorkerAndTypeInPlant`:

```typescript
/**
 * §2.3/§4 (revised): compares the actor granting an authorization against the
 * assessor of the SPECIFIC assessment backing it — not "did the actor ever
 * assess this worker/type at all" (the old, over-broad rule this replaces).
 * The supporting assessment is `assessmentId` when given, otherwise the most
 * recent COMPETENT one — the same definition §5 step 7 of the state machine
 * already uses for "the" assessment that matters.
 */
async function assertSegregationOfDuties(
  tx: TransactionClient,
  input: {
    plantId: string;
    competenceWorkerId: string;
    competenceTypeId: string;
    assessmentId: string | null;
    actorUserId: string;
  },
) {
  const assessment = input.assessmentId
    ? await tx.competenceAssessment.findFirst({
        where: { id: input.assessmentId, plantId: input.plantId, competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
        select: { assessorUserId: true },
      })
    : await tx.competenceAssessment.findFirst({
        where: { plantId: input.plantId, competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId, result: CompetenceAssessmentResult.COMPETENT },
        orderBy: { assessedAt: "desc" },
        select: { assessorUserId: true },
      });

  if (input.assessmentId && !assessment) {
    throw new CompetenceValidationError(
      "ASSESSMENT_NOT_FOUND",
      "The referenced assessment was not found for this worker and competence type in this plant.",
    );
  }

  if (assessment?.assessorUserId && assessment.assessorUserId === input.actorUserId) {
    throw new CompetenceValidationError(
      "SEGREGATION_OF_DUTIES",
      "Segregation of duties: the user who performed the competent practical assessment backing this authorization cannot grant it.",
    );
  }
}
```

- [ ] **Step 6: Add registerCompetenceEntry**

Add this method to the `CompetenceService` object, after `registerAssessment`:

```typescript
  /**
   * §3.2/§3.3 (revised): one submission across all three levels, sharing one
   * entryGroupId and one prisma.$transaction() — replaces separately calling
   * registerTraining / registerAssessment / grantAuthorization from the UI.
   * `training` is required unless `entryGroupId` names an entry already
   * started in a prior submission (the "complete later" flow), in which case
   * this call only appends the assessment and/or authorization sections to
   * that entry's existing training record.
   *
   * Intentionally does not reuse grantAuthorization's own transaction body —
   * that method owns its single-purpose endpoint and its own tests; the
   * validation that actually needed to change (segregation of duties) is
   * factored into assertSegregationOfDuties above and shared by both.
   */
  async registerCompetenceEntry(plantId: string, input: RegisterCompetenceEntryInput, actorUserId: string) {
    const now = new Date();
    const { competenceType } = await assertWorkerAndTypeInPlant(plantId, input.competenceWorkerId, input.competenceTypeId);
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization, segregationOfDuties] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
      getAuthorizationSegregationOfDuties(plantId),
    ]);

    const result = await prisma.$transaction(async (tx) => {
      let entryGroupId = input.entryGroupId ?? null;
      let trainingRecordId: string | null = null;

      if (entryGroupId) {
        const existingTraining = await tx.trainingRecord.findFirst({
          where: { entryGroupId, plantId, competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
          select: { id: true },
        });
        if (!existingTraining) {
          throw new CompetenceValidationError("ENTRY_NOT_FOUND", "The referenced entry was not found for this worker and competence type.");
        }
        trainingRecordId = existingTraining.id;
      } else {
        entryGroupId = randomUUID();
        const trainingRecord = await tx.trainingRecord.create({
          data: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            entryGroupId,
            provider: input.training!.provider ?? null,
            trainerName: input.training!.trainerName ?? null,
            completedAt: input.training!.completedAt,
            durationHours: input.training!.durationHours ?? null,
            certificateNumber: input.training!.certificateNumber ?? null,
            certificateExpiresAt: input.training!.certificateExpiresAt ?? null,
            result: input.training!.result,
            notes: input.training!.notes ?? null,
            createdById: actorUserId,
          },
        });
        trainingRecordId = trainingRecord.id;

        await writeAuditLog({
          entityType: "TrainingRecord",
          entityId: trainingRecord.id,
          action: "REGISTERED",
          actorUserId,
          plantId,
          diff: buildDiff(null, { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId, result: input.training!.result, entryGroupId }),
        }, tx);
      }

      let assessmentRecordId: string | null = null;

      if (input.assessment) {
        if (competenceType.requiresTraining && !trainingRecordId) {
          throw new CompetenceValidationError(
            "TRAINING_LINK_REQUIRED",
            `Competence type "${competenceType.name}" requires training: link the passed training record when registering this assessment.`,
          );
        }

        const assessmentRecord = await tx.competenceAssessment.create({
          data: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            entryGroupId,
            trainingRecordId,
            assessedAt: input.assessment.assessedAt,
            assessorUserId: input.assessment.assessorUserId ?? null,
            assessorName: input.assessment.assessorUserId ? null : (input.assessment.assessorName ?? null),
            method: input.assessment.method,
            result: input.assessment.result,
            score: input.assessment.score ?? null,
            observations: input.assessment.observations ?? null,
            createdById: actorUserId,
          },
        });
        assessmentRecordId = assessmentRecord.id;

        await writeAuditLog({
          entityType: "CompetenceAssessment",
          entityId: assessmentRecord.id,
          action: "REGISTERED",
          actorUserId,
          plantId,
          diff: buildDiff(null, { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId, result: input.assessment.result, entryGroupId }),
        }, tx);
      }

      let authorizationId: string | null = null;

      if (input.authorization) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`authorization:seq:${plantId}`}))`;

        if (!competenceType.requiresAuthorization) {
          throw new CompetenceValidationError("AUTHORIZATION_NOT_REQUIRED", `Competence type "${competenceType.name}" does not require a formal authorization.`);
        }
        if (competenceType.requiresTraining && !trainingRecordId) {
          throw new CompetenceValidationError("TRAINING_REQUIRED", `Competence type "${competenceType.name}" requires a passed training record before an authorization can be granted.`);
        }

        let supportingAssessmentId = assessmentRecordId;
        if (!supportingAssessmentId && competenceType.requiresAssessment) {
          const existingAssessment = await tx.competenceAssessment.findFirst({
            where: { plantId, competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId, result: CompetenceAssessmentResult.COMPETENT },
            orderBy: { assessedAt: "desc" },
            select: { id: true },
          });
          if (!existingAssessment) {
            throw new CompetenceValidationError("ASSESSMENT_REQUIRED", `Competence type "${competenceType.name}" requires a competent practical assessment before an authorization can be granted.`);
          }
          supportingAssessmentId = existingAssessment.id;
        }

        if (segregationOfDuties) {
          await assertSegregationOfDuties(tx, {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            assessmentId: supportingAssessmentId,
            actorUserId,
          });
        }

        const previousCurrent = await tx.workerAuthorization.findFirst({
          where: {
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            status: { in: [AuthorizationStatus.ACTIVE, AuthorizationStatus.SUSPENDED] },
          },
          orderBy: { grantedAt: "desc" },
        });
        if (previousCurrent?.status === AuthorizationStatus.SUSPENDED) {
          throw new CompetenceValidationError(
            "SUSPENDED_AUTHORIZATION_REQUIRES_REACTIVATION",
            `This worker has a SUSPENDED authorization for this competence (reason: ${previousCurrent.suspensionReason ?? "not recorded"}). Reactivate it explicitly before granting a new one.`,
          );
        }

        const latest = await tx.workerAuthorization.findFirst({
          where: { plantId, sequenceNumber: { not: null } },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });

        const validUntil = addMonths(input.authorization.validFrom, competenceType.validityMonths);
        const authorization = await tx.workerAuthorization.create({
          data: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            entryGroupId,
            trainingRecordId,
            assessmentId: supportingAssessmentId,
            sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
            grantedByUserId: actorUserId,
            validFrom: input.authorization.validFrom,
            validUntil,
            restrictions: input.authorization.restrictions ?? null,
            status: AuthorizationStatus.ACTIVE,
          },
        });
        authorizationId = authorization.id;

        if (previousCurrent) {
          await tx.workerAuthorization.update({ where: { id: previousCurrent.id }, data: { status: AuthorizationStatus.SUPERSEDED, supersededById: authorization.id } });
        }

        await writeAuditLog({
          entityType: "WorkerAuthorization",
          entityId: authorization.id,
          action: "GRANTED",
          actorUserId,
          plantId,
          diff: buildDiff(previousCurrent ? { supersededAuthorizationId: previousCurrent.id } : null, { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId, validFrom: input.authorization.validFrom, validUntil, entryGroupId }),
        }, tx);
      }

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: input.competenceWorkerId,
        competenceTypeId: input.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return { entryGroupId, trainingRecordId, assessmentRecordId, authorizationId };
    });

    return result;
  },
```

Add `RegisterCompetenceEntryInput` to the `import type {...} from "@/lib/validation/dtos"` block at the top of the file.

- [ ] **Step 7: Run to verify the tests pass**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "registerCompetenceEntry"`
Expected: PASS.

- [ ] **Step 8: Run the full service test file**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts lib/validation/dtos.ts tests/unit/competence-service.test.ts
git commit -m "feat(competences): add registerCompetenceEntry, one transaction across training/assessment/authorization"
```

---

## Task 12: Add the unified entry route

**Files:**
- Create: `app/api/plants/[plantCode]/competences/entries/route.ts`
- Create: `tests/unit/competence-entries-route.test.ts`

**Interfaces:**
- Consumes: `CompetenceService.registerCompetenceEntry` (Task 11).
- Produces: `POST /api/plants/[plantCode]/competences/entries` — consumed by Task 13's UI.

- [ ] **Step 1: Write the failing route test**

Create `tests/unit/competence-entries-route.test.ts`:

```typescript
import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn(async () => ({ id: "plant-1", code: "pl01" })) }));
const serviceMock = vi.hoisted(() => ({
  CompetenceService: { registerCompetenceEntry: vi.fn() },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/competence-service", () => serviceMock);

import { POST } from "@/app/api/plants/[plantCode]/competences/entries/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/plants/pl01/competences/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  competenceWorkerId: "00000000-0000-0000-0000-00000000000a",
  competenceTypeId: "00000000-0000-0000-0000-00000000000b",
  training: { completedAt: "2026-08-01", result: "PASSED" },
};

describe("POST /api/plants/[plantCode]/competences/entries", () => {
  afterEach(() => vi.clearAllMocks());

  it("allows N4_SUPERVISOR to submit training only", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N4_SUPERVISOR });
    serviceMock.CompetenceService.registerCompetenceEntry.mockResolvedValue({ entryGroupId: "g1", trainingRecordId: "t1", assessmentRecordId: null, authorizationId: null });

    const response = await POST(jsonRequest(VALID_BODY), { params: Promise.resolve({ plantCode: "pl01" }) });

    expect(response.status).toBe(201);
    expect(serviceMock.CompetenceService.registerCompetenceEntry).toHaveBeenCalledTimes(1);
  });

  it("rejects N4_SUPERVISOR submitting an authorization section — only N3/N1/N0 may grant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N4_SUPERVISOR });

    const response = await POST(
      jsonRequest({ ...VALID_BODY, authorization: { validFrom: "2026-08-03" } }),
      { params: Promise.resolve({ plantCode: "pl01" }) },
    );

    expect(response.status).toBe(403);
    expect(serviceMock.CompetenceService.registerCompetenceEntry).not.toHaveBeenCalled();
  });

  it("allows N3_SAFETY submitting an authorization section", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    serviceMock.CompetenceService.registerCompetenceEntry.mockResolvedValue({ entryGroupId: "g1", trainingRecordId: "t1", assessmentRecordId: "a1", authorizationId: "auth1" });

    const response = await POST(
      jsonRequest({ ...VALID_BODY, assessment: { assessedAt: "2026-08-02", result: "COMPETENT", assessorUserId: "u2" }, authorization: { validFrom: "2026-08-03" } }),
      { params: Promise.resolve({ plantCode: "pl01" }) },
    );

    expect(response.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-entries-route.test.ts`
Expected: FAIL — the route module does not exist yet.

- [ ] **Step 3: Write the route**

Create `app/api/plants/[plantCode]/competences/entries/route.ts`:

```typescript
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService, CompetenceValidationError } from "@/lib/services/competence-service";
import { registerCompetenceEntryInput } from "@/lib/validation/dtos";

// §2.3/§3.2: N3_SAFETY and N4_SUPERVISOR can submit training and assessment;
// only N3_SAFETY (plus N0/N1 bypass) can include an authorization section —
// enforced below, since a single endpoint now covers all three levels.
const ENTRY_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, ENTRY_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, registerCompetenceEntryInput);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.authorization && auth.role === RoleCode.N4_SUPERVISOR) {
    return fail("FORBIDDEN", "N4_SUPERVISOR cannot grant a formal authorization; only register training and assessment.", 403);
  }

  const plant = await getPlantByCode(plantCode);

  try {
    const entry = await CompetenceService.registerCompetenceEntry(plant.id, parsed.data, auth.session.user.id);
    return ok(entry, { status: 201 });
  } catch (error) {
    if (error instanceof CompetenceValidationError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("REGISTER_ENTRY_FAILED", error instanceof Error ? error.message : "Failed to register the entry", 422);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-entries-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd c:\HSE\ma-hse
git add app/api/plants/[plantCode]/competences/entries/route.ts tests/unit/competence-entries-route.test.ts
git commit -m "feat(competences): add unified entry submission route"
```

---

## Task 13: Rebuild the cell detail panel as a single unified form, and add the per-worker requirement checkbox UI

**Files:**
- Modify: `components/feature/competence-cell-detail-panel.tsx`
- Modify: `components/feature/competence-worker-profile.tsx` (unified-form wiring, plus the §2.4 checkbox UI added in Steps 4-6, plus history grouping in Step 7)
- Modify: `lib/services/competence-service.ts` (Step 7 — `entryGroupId` on history events)
- Create: `lib/competence-history-grouping.ts` (Step 7)
- Modify: `lib/ui-language.ts` (Steps 4-6's new keys, plus `entryGroupHistoryLabel` in Step 7; the unified-form's own new keys are covered separately by Task 15)

This task is UI-only and has no automated test (the codebase's existing convention for `.tsx` feature components — none of `competence-cell-detail-panel.tsx`, `competence-worker-profile.tsx`, `competence-matrix-manager.tsx` have component-level tests today; `tests/unit/n0-master-data-manager.test.ts` is the only jsdom-rendered component test in the suite and is not a pattern this plan needs to extend). Verification is manual, via `npm run dev` and the browser, per Step 5.

- [ ] **Step 1: Replace TrainingForm/AssessmentForm/AuthorizationForm with one CompetenceEntryForm**

In `components/feature/competence-cell-detail-panel.tsx`, replace the three separate form components (`TrainingForm`, `AssessmentForm`, `AuthorizationForm` — everything from `function TrainingForm({` through `AuthorizationForm`'s closing `}` before `function ReasonForm`) with one:

```typescript
type AssessorType = "internal" | "external";

function CompetenceEntryForm({
  labels,
  saving,
  competenceType,
  existingEntry,
  assessorOptions,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  competenceType: { requiresAssessment: boolean; requiresAuthorization: boolean };
  existingEntry: { entryGroupId: string; trainingCompletedAt: string } | null;
  assessorOptions: Array<{ id: string; name: string }>;
  onSubmit: (payload: {
    entryGroupId?: string;
    training?: { completedAt: string; result: "PASSED" | "FAILED"; provider: string | null; certificateExpiresAt: string | null; notes: string | null };
    assessment?: { assessedAt: string; result: "COMPETENT" | "NOT_YET_COMPETENT"; method: "PRACTICAL_TEST" | "OBSERVATION" | "THEORY_TEST" | "SIMULATOR"; assessorUserId: string | null; assessorName: string | null; score: number | null; observations: string | null };
    authorization?: { validFrom: string; restrictions: string | null };
  }) => void;
  onCancel: () => void;
}) {
  const [completedAt, setCompletedAt] = useState(todayInputValue());
  const [trainingResult, setTrainingResult] = useState<"PASSED" | "FAILED">("PASSED");
  const [provider, setProvider] = useState("");
  const [certificateExpiresAt, setCertificateExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const [assessmentOpen, setAssessmentOpen] = useState(Boolean(existingEntry) === false);
  const [assessedAt, setAssessedAt] = useState(todayInputValue());
  const [assessmentResult, setAssessmentResult] = useState<"COMPETENT" | "NOT_YET_COMPETENT">("COMPETENT");
  const [method, setMethod] = useState<"PRACTICAL_TEST" | "OBSERVATION" | "THEORY_TEST" | "SIMULATOR">("PRACTICAL_TEST");
  const [assessorType, setAssessorType] = useState<AssessorType>("internal");
  const [assessorUserId, setAssessorUserId] = useState("");
  const [assessorName, setAssessorName] = useState("");
  const [score, setScore] = useState("");
  const [observations, setObservations] = useState("");

  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [validFrom, setValidFrom] = useState(todayInputValue());
  const [restrictions, setRestrictions] = useState("");

  const authorizationAvailable = !competenceType.requiresAssessment || (assessmentOpen && assessmentResult === "COMPETENT");

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          entryGroupId: existingEntry?.entryGroupId,
          training: existingEntry
            ? undefined
            : { completedAt, result: trainingResult, provider: provider.trim() || null, certificateExpiresAt: certificateExpiresAt || null, notes: notes.trim() || null },
          assessment: assessmentOpen
            ? {
                assessedAt,
                result: assessmentResult,
                method,
                assessorUserId: assessorType === "internal" ? (assessorUserId || null) : null,
                assessorName: assessorType === "external" ? (assessorName.trim() || null) : null,
                score: score.trim() ? Number(score) : null,
                observations: observations.trim() || null,
              }
            : undefined,
          authorization: authorizationOpen && authorizationAvailable
            ? { validFrom, restrictions: restrictions.trim() || null }
            : undefined,
        });
      }}
    >
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">{labels.entryFormTrainingSectionTitle}</h4>
        {existingEntry ? (
          <p className="text-sm text-slate-500">{labels.entryFormContinuingNotice.replace("{date}", existingEntry.trainingCompletedAt)}</p>
        ) : (
          <>
            <FormField label={labels.formCompletedAt}>
              <input type="date" required value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formTrainingResult}>
              <select value={trainingResult} onChange={(event) => setTrainingResult(event.target.value as "PASSED" | "FAILED")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="PASSED">{labels.trainingResultPassed}</option>
                <option value="FAILED">{labels.trainingResultFailed}</option>
              </select>
            </FormField>
            <FormField label={labels.formProvider}>
              <input type="text" value={provider} onChange={(event) => setProvider(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formCertificateExpiresAt}>
              <input type="date" value={certificateExpiresAt} onChange={(event) => setCertificateExpiresAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formNotes}>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </FormField>
          </>
        )}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-3">
        <button type="button" onClick={() => setAssessmentOpen((open) => !open)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900">
          {labels.entryFormAssessmentSectionTitle}
          <span className="text-xs font-normal text-slate-500">{assessmentOpen ? labels.entryFormCollapse : labels.entryFormExpand}</span>
        </button>
        {assessmentOpen ? (
          <>
            <FormField label={labels.formAssessedAt}>
              <input type="date" required value={assessedAt} onChange={(event) => setAssessedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formAssessmentResult}>
              <select value={assessmentResult} onChange={(event) => setAssessmentResult(event.target.value as "COMPETENT" | "NOT_YET_COMPETENT")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="COMPETENT">{labels.assessmentResultCompetent}</option>
                <option value="NOT_YET_COMPETENT">{labels.assessmentResultNotYetCompetent}</option>
              </select>
            </FormField>
            <FormField label={labels.formAssessmentMethod}>
              <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="PRACTICAL_TEST">{labels.assessmentMethodPracticalTest}</option>
                <option value="OBSERVATION">{labels.assessmentMethodObservation}</option>
                <option value="THEORY_TEST">{labels.assessmentMethodTheoryTest}</option>
                <option value="SIMULATOR">{labels.assessmentMethodSimulator}</option>
              </select>
            </FormField>
            <FormField label={labels.entryFormAssessorTypeLabel}>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={assessorType === "internal"} onChange={() => setAssessorType("internal")} />
                  {labels.entryFormAssessorTypeInternal}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={assessorType === "external"} onChange={() => setAssessorType("external")} />
                  {labels.entryFormAssessorTypeExternal}
                </label>
              </div>
            </FormField>
            {assessorType === "internal" ? (
              <FormField label={labels.entryFormAssessorUserLabel}>
                <select required value={assessorUserId} onChange={(event) => setAssessorUserId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">{labels.entryFormAssessorUserPlaceholder}</option>
                  {assessorOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </FormField>
            ) : (
              <FormField label={labels.entryFormAssessorNameLabel}>
                <input type="text" required value={assessorName} onChange={(event) => setAssessorName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </FormField>
            )}
            <FormField label={labels.formScore}>
              <input type="number" min={0} max={100} value={score} onChange={(event) => setScore(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formObservations}>
              <textarea value={observations} onChange={(event) => setObservations(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </FormField>
          </>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-3">
        <button
          type="button"
          disabled={!authorizationAvailable}
          onClick={() => setAuthorizationOpen((open) => !open)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {labels.entryFormAuthorizationSectionTitle}
          <span className="text-xs font-normal text-slate-500">{authorizationOpen ? labels.entryFormCollapse : labels.entryFormExpand}</span>
        </button>
        {!authorizationAvailable ? <p className="text-xs text-slate-500">{labels.entryFormAuthorizationDisabledReason}</p> : null}
        {authorizationOpen && authorizationAvailable ? (
          <>
            <FormField label={labels.formValidFrom}>
              <input type="date" required value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>
            <FormField label={labels.formRestrictions}>
              <textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </FormField>
          </>
        ) : null}
      </section>

      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}
```

- [ ] **Step 2: Wire the new form into CompetenceCellDetailPanel**

In `components/feature/competence-cell-detail-panel.tsx`'s main `CompetenceCellDetailPanel` component:

Replace `type ActiveForm = "training" | "assessment" | "authorization" | "suspend" | ...` with `type ActiveForm = "entry" | "suspend" | "reactivate" | "revoke" | "action" | null;`.

Replace the three `canRegister`-gated buttons (`actionRegisterTraining`, `actionRegisterAssessment`) and the `canGrant`-gated `actionGrantAuthorization` button with one:

```typescript
              {canRegister ? (
                <Button type="button" size="sm" onClick={() => setActiveForm("entry")}>
                  {labels.entryFormOpenButton}
                </Button>
              ) : null}
```

Replace the three `activeForm === "training" | "assessment" | "authorization"` branches (the ones rendering `<TrainingForm .../>`, `<AssessmentForm .../>`, `<AuthorizationForm .../>`) with one:

```typescript
          {activeForm === "entry" ? (
            <CompetenceEntryForm
              labels={labels}
              saving={saving}
              competenceType={{ requiresAssessment: true, requiresAuthorization: true }}
              existingEntry={
                latestPassedTraining && !latestCompetentAssessment
                  ? { entryGroupId: (latestPassedTraining as unknown as { entryGroupId?: string }).entryGroupId ?? "", trainingCompletedAt: new Date(latestPassedTraining.occurredAt).toLocaleDateString() }
                  : null
              }
              assessorOptions={assessorOptions}
              onCancel={() => setActiveForm(null)}
              onSubmit={(payload) =>
                submit(`/api/plants/${plant}/competences/entries`, "POST", {
                  competenceWorkerId,
                  competenceTypeId,
                  ...payload,
                })
              }
            />
          ) : activeForm === "suspend" || activeForm === "revoke" ? (
```

Note: `competenceType={{ requiresAssessment: true, requiresAuthorization: true }}` is a placeholder pair of booleans wired to always-true here because `CompetenceCellDetailPanel` does not currently receive the full `CompetenceType` row (only `competenceTypeName`) — extend the component's props with a new required `competenceType: { requiresAssessment: boolean; requiresAuthorization: boolean }` prop, threaded from `CompetenceWorkerProfile` (Step 3 below) and from wherever else `CompetenceCellDetailPanel` is mounted (check `components/feature/competence-matrix-manager.tsx` for another mount point before finishing this step — grep for `<CompetenceCellDetailPanel` across `components/feature/*.tsx` and update every call site, not only the profile one).

Also add `assessorOptions: Array<{ id: string; name: string }>` as a new prop on `CompetenceCellDetailPanel`, threaded the same way (a list of plant users eligible to be picked as an internal assessor — reuse whatever prop already supplies `owners: CompetenceActionOwnerOption[]` for the Create Action flow as the source list if its shape already fits `{id, name}`; otherwise fetch it the same way `owners` is fetched today, from whichever server component builds `CompetenceWorkerProfile`'s props).

- [ ] **Step 3: Thread the new props from CompetenceWorkerProfile and the matrix manager**

In `components/feature/competence-worker-profile.tsx`, add a `competenceType: { requiresAssessment: boolean; requiresAuthorization: boolean }` lookup from `profile.competences` (the row already has `competenceTypeId`; if the profile view doesn't expose `requiresAssessment`/`requiresAuthorization` per row, add them to `CompetenceWorkerCompetenceRow` in `lib/services/competence-service.ts` the same way Task 8 added `requirementSetAt` — pull `requiresAssessment`/`requiresAuthorization` off the already-loaded `competenceType` row inside `getWorkerProfile`'s `.map()`), and pass it plus `assessorOptions={owners.map((owner) => ({ id: owner.id, name: owner.name }))}` into `<CompetenceCellDetailPanel .../>`.

Find every other place that renders `<CompetenceCellDetailPanel` (grep `components/feature/*.tsx` for `CompetenceCellDetailPanel`) and pass the same two new props there too, sourcing `requiresAssessment`/`requiresAuthorization` from whatever competence-type list that caller already has in scope.

- [ ] **Step 4: Add the six new dictionary keys for the checkbox UI**

In `lib/ui-language.ts`, add these keys to each of the 7 `competences: {` blocks (same process as Task 15 Step 4 — locate each language's block by its `competences: {` opening line):

| key | en | pt | it | pl | de | ro | fr |
|---|---|---|---|---|---|---|---|
| `workerRequirementCheckboxLabel` | Required for this worker | Necessária para este trabalhador | Necessaria per questo lavoratore | Wymagane dla tego pracownika | Für diesen Mitarbeiter erforderlich | Necesară pentru acest lucrător | Nécessaire pour ce collaborateur |
| `workerRequirementSetByPrefix` | Marked by {name} on {date} | Marcada por {name} em {date} | Contrassegnata da {name} il {date} | Oznaczone przez {name} dnia {date} | Markiert von {name} am {date} | Marcată de {name} la {date} | Marquée par {name} le {date} |
| `workerRequirementSummary` | {marked} of {total} competences marked as required | {marked} de {total} competências marcadas como necessárias | {marked} di {total} competenze contrassegnate come necessarie | {marked} z {total} kompetencji oznaczonych jako wymagane | {marked} von {total} Kompetenzen als erforderlich markiert | {marked} din {total} competențe marcate ca necesare | {marked} sur {total} compétences marquées comme nécessaires |
| `workerRequirementMarkAll` | Mark all | Marcar todas | Contrassegna tutte | Zaznacz wszystkie | Alle markieren | Marchează toate | Tout marquer |
| `workerRequirementUnmarkAll` | Unmark all | Desmarcar todas | Deseleziona tutte | Odznacz wszystkie | Alle demarkieren | Demarchează toate | Tout démarquer |
| `workerRequirementSaveError` | Could not update the requirement. Try again. | Não foi possível atualizar o requisito. Tenta novamente. | Impossibile aggiornare il requisito. Riprova. | Nie udało się zaktualizować wymogu. Spróbuj ponownie. | Die Anforderung konnte nicht aktualisiert werden. Versuchen Sie es erneut. | Nu s-a putut actualiza cerința. Încearcă din nou. | Impossible de mettre à jour l'exigence. Réessayez. |

- [ ] **Step 5: Add the checkbox, "who/when", summary, and mark-all/unmark-all to CompetenceWorkerProfile**

In `components/feature/competence-worker-profile.tsx`, add two new pieces of local state right after the existing `const [activeCompetenceTypeId, setActiveCompetenceTypeId] = useState<string | null>(null);` line:

```typescript
  const [savingRequirementFor, setSavingRequirementFor] = useState<string | null>(null);
  const [requirementError, setRequirementError] = useState("");
  const canEditRequirements = viewerRole === "N0_ADMIN" || viewerRole === "N1_CORPORATE" || viewerRole === "N3_SAFETY" || viewerRole === "N4_SUPERVISOR";
```

Add these two functions in the same component, above the `return (`:

```typescript
  async function toggleRequirement(competenceTypeId: string, isRequired: boolean) {
    setSavingRequirementFor(competenceTypeId);
    setRequirementError("");
    try {
      const response = await fetch(`/api/plants/${plant}/competences/workers/${profile.worker.id}/requirements`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competenceTypeId, isRequired }),
      });
      await requireApiResponse(response, labels.workerRequirementSaveError);
      window.location.reload();
    } catch (error) {
      setRequirementError(error instanceof Error ? error.message : labels.workerRequirementSaveError);
      setSavingRequirementFor(null);
    }
  }

  async function markAllRequirements(isRequired: boolean) {
    setSavingRequirementFor("__all__");
    setRequirementError("");
    try {
      for (const row of profile.competences) {
        const response = await fetch(`/api/plants/${plant}/competences/workers/${profile.worker.id}/requirements`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ competenceTypeId: row.competenceTypeId, isRequired }),
        });
        await requireApiResponse(response, labels.workerRequirementSaveError);
      }
      window.location.reload();
    } catch (error) {
      setRequirementError(error instanceof Error ? error.message : labels.workerRequirementSaveError);
      setSavingRequirementFor(null);
    }
  }
```

Add `import { requireApiResponse } from "@/lib/client-api";` to this file's imports (it currently has no client-api import).

Replace the "Competências" `<AppPanel>`'s header and cell grid — from `<h2 className="app-section-eyebrow">{labels.profileCompetencesTitle}</h2>` through the closing of the `.map()` grid (do not touch the `profile.competences.length === 0` catalog-empty branch) — with:

```typescript
        <div className="flex items-center justify-between gap-3">
          <h2 className="app-section-eyebrow">{labels.profileCompetencesTitle}</h2>
          {canEditRequirements && profile.competences.length > 0 ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">
                {labels.workerRequirementSummary
                  .replace("{marked}", String(profile.competences.filter((row) => row.isRequired).length))
                  .replace("{total}", String(profile.competences.length))}
              </span>
              <button type="button" disabled={savingRequirementFor !== null} onClick={() => markAllRequirements(true)} className="font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                {labels.workerRequirementMarkAll}
              </button>
              <button type="button" disabled={savingRequirementFor !== null} onClick={() => markAllRequirements(false)} className="font-semibold text-slate-600 hover:underline disabled:opacity-50">
                {labels.workerRequirementUnmarkAll}
              </button>
            </div>
          ) : null}
        </div>
        {requirementError ? <p className="mt-2 text-sm font-medium text-rose-600">{requirementError}</p> : null}
```

(Keep the `profile.competences.length === 0 ? (...) : (` branch exactly as it already reads in the file — this Step only replaces the `<h2>` line above it with the block shown above, plus threads the checkbox into each card, which Step 6 below handles inside the grid's `.map()`.)

- [ ] **Step 6: Wire the checkbox and "who/when" into each competence card**

Still inside `competence-worker-profile.tsx`'s cell grid `.map((row) => {...})`, replace the `<button>` card body — the one currently rendering `<span className="font-medium ...">{row.name}</span>` and the state badge inside a single clickable `<button>` — with a `<div>` wrapper whose name area stays clickable (opens the panel) and whose checkbox is a separate control (so clicking the checkbox does not also open the panel):

```typescript
                <div key={row.competenceTypeId} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <button
                    type="button"
                    onClick={() => setActiveCompetenceTypeId(row.competenceTypeId)}
                    className="flex items-center justify-between gap-2 text-left hover:opacity-80"
                  >
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatCompetenceCellText(row, labels)}
                    </span>
                  </button>
                  {canEditRequirements ? (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={row.isRequired}
                        disabled={savingRequirementFor !== null}
                        onChange={(event) => toggleRequirement(row.competenceTypeId, event.target.checked)}
                      />
                      {labels.workerRequirementCheckboxLabel}
                    </label>
                  ) : null}
                  {row.requirementSource && row.requirementSetAt ? (
                    <p className="text-xs text-slate-400">
                      {labels.workerRequirementSetByPrefix
                        .replace("{name}", row.requirementSource)
                        .replace("{date}", new Date(row.requirementSetAt).toLocaleDateString())}
                    </p>
                  ) : null}
                </div>
```

(This changes the grid item's root element from `<button key={...}>` to `<div key={...}>` — remove the old outer `<button key={row.competenceTypeId} ... onClick={...} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">` and its matching closing `</button>`, replacing them with the `<div>`/nested-`<button>` structure above.)

- [ ] **Step 7: Group the timeline by entryGroupId (§3.3)**

Backend — in `lib/services/competence-service.ts`:

Add `entryGroupId: string | null;` to the `TRAINING`, `ASSESSMENT`, and `AUTHORIZATION_GRANTED` variants of the `CompetenceHistoryEvent` union type (the `AUTHORIZATION_SUSPENDED`/`AUTHORIZATION_REACTIVATED`/`AUTHORIZATION_REVOKED` variants are left untouched — those are later events on the same authorization row, not part of "the entry" that was submitted together).

In `getWorkerProfile`'s history-building loop, add `entryGroupId: record.entryGroupId,` to the object pushed for each of those three event types (the `trainingRecords`/`assessments`/`authorizations` query `select` clauses already fetch the whole row via `findMany({ where: {...} })` with no `select`, so `entryGroupId` is already present on `record` — no query change needed, only the three `history.push({...})` object literals).

Shared frontend helper — create `lib/competence-history-grouping.ts`:

```typescript
export type GroupableHistoryEvent = { entryGroupId?: string | null };

export type CompetenceHistoryGroup<T> = { entryGroupId: string | null; events: T[] };

/**
 * §3.3: one submission (training + optional assessment + optional
 * authorization, sharing an entryGroupId) becomes one visual group; older
 * records without an entryGroupId — or later lifecycle events like a
 * suspension, which never carry one — stay their own single-event group, not
 * retroactively bundled into anything.
 */
export function groupCompetenceHistory<T extends GroupableHistoryEvent>(events: T[]): Array<CompetenceHistoryGroup<T>> {
  const groups: Array<CompetenceHistoryGroup<T>> = [];
  const groupByEntryId = new Map<string, CompetenceHistoryGroup<T>>();

  for (const event of events) {
    if (!event.entryGroupId) {
      groups.push({ entryGroupId: null, events: [event] });
      continue;
    }

    let group = groupByEntryId.get(event.entryGroupId);
    if (!group) {
      group = { entryGroupId: event.entryGroupId, events: [] };
      groupByEntryId.set(event.entryGroupId, group);
      groups.push(group);
    }
    group.events.push(event);
  }

  return groups;
}
```

Add `entryGroupHistoryLabel` to all 7 `competences: {` blocks in `lib/ui-language.ts` now (same insertion process as Task 15 Step 4 — do not wait for Task 15, this key is this task's own):

| key | en | pt | it | pl | de | ro | fr |
|---|---|---|---|---|---|---|---|
| `entryGroupHistoryLabel` | Entry | Entrada | Voce | Wpis | Eintrag | Înregistrare | Entrée |

Frontend rendering — in `components/feature/competence-cell-detail-panel.tsx`, add `entryGroupId: string | null;` to each of the `TRAINING`/`ASSESSMENT`/`AUTHORIZATION_GRANTED` members of the local `HistoryEventWire` union, and `import { groupCompetenceHistory } from "@/lib/competence-history-grouping";`. Replace the timeline's `{relevantHistory.map((event) => (...))}` with:

```typescript
                {groupCompetenceHistory(relevantHistory).map((group) => (
                  group.events.length > 1 ? (
                    <li key={group.entryGroupId} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.entryGroupHistoryLabel}</p>
                      <ol className="space-y-2">
                        {group.events.map((event) => (
                          <li key={`${event.type}-${event.id}`}>{/* same per-event body the old flat .map() rendered */}</li>
                        ))}
                      </ol>
                    </li>
                  ) : (
                    <li key={`${group.events[0].type}-${group.events[0].id}`}>{/* same per-event body the old flat .map() rendered */}</li>
                  )
                ))}
```

— keeping the existing per-event JSX body (the `<p className="font-semibold ...">` timeline label through the `AUTHORIZATION_REACTIVATED` branch) verbatim inside both the grouped and single-event `<li>` cases, only changing the outer wrapping and the `.map()` source from `relevantHistory` to `groupCompetenceHistory(relevantHistory)`. A single-event group (entryGroupId null, or a legacy record with only one row sharing an id) renders exactly as the old flat `<li>` did.

Apply the same `groupCompetenceHistory` import and rendering change to `components/feature/competence-worker-profile.tsx`'s history section (its `{profile.history.map((event) => (...))}` block), adding `entryGroupId: string | null` to whatever local type that file uses for history events (it currently inlines `profile.history`'s type from `CompetenceWorkerProfileView` directly rather than redeclaring a wire type, so no separate type edit is needed there beyond the backend change above).

- [ ] **Step 8: Type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "competence-cell-detail-panel|competence-worker-profile|competence-matrix-manager"`
Expected: no output.

- [ ] **Step 9: Manual verification in the browser**

Use the `run` skill (or `npm run dev:all`) to start the app, sign in as an `N3_SAFETY` user, open a plant's Competences matrix, click a MISSING cell for an enrolled worker, and confirm: (a) clicking "register" opens one form with three sections, Assessment and Authorization collapsed by default; (b) submitting Training alone creates the training and the cell shows "Aguarda avaliação" (or "Aguarda autorização" if the type doesn't require assessment); (c) reopening the same cell and expanding Assessment shows the "internal user / external evaluator" toggle, and choosing "internal user" requires picking someone from a select (not silently defaulting to yourself); (d) with Assessment filled in COMPETENT, the Authorization section becomes clickable and, once expanded and submitted together with Training and Assessment in one click, the cell shows VALID with one audit trail carrying the same entry, grouped as a single "Entry" in the timeline rather than three separate lines. Then open that worker's profile page directly and confirm: (e) each competence card shows a "Required for this worker" checkbox reflecting its current state; (f) toggling one checkbox reloads the page with the summary count updated and a "Marked by \<you\> on \<today\>" line under that card; (g) "Mark all" / "Unmark all" updates every card in one action; (h) the profile's own history section shows the same grouped entry, and any older training/assessment/authorization records from before this plan (no entryGroupId) still show individually. Stop the dev server when done.

- [ ] **Step 10: Commit**

```bash
cd c:\HSE\ma-hse
git add components/feature/competence-cell-detail-panel.tsx components/feature/competence-worker-profile.tsx lib/services/competence-service.ts lib/ui-language.ts lib/competence-history-grouping.ts
git commit -m "feat(competences): unified entry form, per-worker requirement checkboxes, and entryGroupId history grouping"
```

---

## Task 14: Rewrite grantAuthorization's segregation-of-duties check to use assertSegregationOfDuties

**Files:**
- Modify: `lib/services/competence-service.ts` (`grantAuthorization`)
- Test: `tests/unit/competence-service.test.ts`

**Interfaces:**
- Consumes: `assertSegregationOfDuties` (added in Task 11 Step 5).
- Produces: no signature change to `grantAuthorization`; only its internal segregation check changes.

- [ ] **Step 1: Rewrite the two failing/changing tests**

In `tests/unit/competence-service.test.ts`, inside `describe("CompetenceService.grantAuthorization", ...)`:

Find the test `"blocks granting when the actor also performed the linked practical assessment (segregation of duties, checked in the service)"` — leave it as-is (still valid: the linked `assessmentId` was authored by the actor, still blocked under the new rule).

Find the test `"(crit 1) blocks granting when the actor performed a competent assessment for this worker/type, even if assessmentId is omitted"` — replace it with two tests that describe the corrected behavior:

```typescript
  it("blocks granting when assessmentId is omitted and the actor performed the MOST RECENT competent assessment for this worker/type", async () => {
    transactionMock.competenceAssessment.findFirst.mockResolvedValue({ assessorUserId: "actor-1" });

    await expect(
      CompetenceService.grantAuthorization("plant-1", { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date(), assessmentId: undefined }, "actor-1"),
    ).rejects.toThrow(/Segregation of duties/);
  });

  it("(fix, item 4) does NOT block when the actor performed an OLDER competent assessment that is not the one actually supporting this authorization", async () => {
    // The most recent COMPETENT assessment — the one that actually supports
    // this grant per §5 step 7 — was done by someone else; an earlier
    // assessment by the actor for the same pair must no longer block them.
    transactionMock.competenceAssessment.findFirst.mockResolvedValue({ assessorUserId: "someone-else" });

    await expect(
      CompetenceService.grantAuthorization("plant-1", { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date(), assessmentId: undefined }, "actor-1"),
    ).resolves.toBeDefined();
  });
```

(These reuse whatever `beforeEach` setup already exists earlier in that describe block for `assertWorkerAndTypeInPlant`, `getCompetenceExpiringThresholdDays`, `getMedicalFitnessBlocksAuthorization`, `getAuthorizationSegregationOfDuties`, `trainingRecord.findFirst`, and `workerAuthorization.create` mocks — read the existing block's `beforeEach` before pasting these in, and align the two new tests' local mock overrides with whatever pattern the existing passing tests in that same describe block already use for those dependencies, since the exact mock object structure was established earlier in the file and must stay consistent.)

- [ ] **Step 2: Run to verify the new/changed tests fail**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "grantAuthorization"`
Expected: the "does NOT block" test FAILS (still throws under the current over-broad rule); the "blocks... MOST RECENT" test may pass or fail depending on exact old-vs-new query shape — confirm by reading the failure, don't assume.

- [ ] **Step 3: Replace the two old segregation blocks in grantAuthorization**

In `lib/services/competence-service.ts`, inside `grantAuthorization`, replace both of these blocks:

```typescript
      // Resolved from data, not from input.assessmentId: the field is optional, so the
      // same assessor who evaluated this worker could otherwise omit it and self-grant.
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
        if (blocking) {
          throw new CompetenceValidationError(
            "SEGREGATION_OF_DUTIES",
            "Segregation of duties: the user who performed a competent practical assessment for this worker and competence type cannot grant this authorization.",
          );
        }
      }

      // Additive, not a substitute for the data-driven check above: still validates
      // that a client-supplied assessmentId is in scope and, if segregation applies,
      // was not authored by this same actor.
      if (input.assessmentId) {
        const assessmentRecord = await tx.competenceAssessment.findFirst({
          where: {
            id: input.assessmentId,
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
          },
          select: { assessorUserId: true },
        });
        if (!assessmentRecord) {
          throw new CompetenceValidationError(
            "ASSESSMENT_NOT_FOUND",
            "The referenced assessment was not found for this worker and competence type in this plant.",
          );
        }
        if (segregationOfDuties && assessmentRecord.assessorUserId && assessmentRecord.assessorUserId === actorUserId) {
          throw new CompetenceValidationError(
            "SEGREGATION_OF_DUTIES",
            "Segregation of duties: the user who performed the referenced practical assessment cannot grant this authorization.",
          );
        }
      }
```

with:

```typescript
      // §4 (revised): compares the actor against the assessor of the
      // SPECIFIC supporting assessment — input.assessmentId if given, else
      // the most recent COMPETENT one — not "did the actor ever assess this
      // worker/type at all" (see assertSegregationOfDuties's own comment).
      if (input.assessmentId) {
        const assessmentExists = await tx.competenceAssessment.findFirst({
          where: { id: input.assessmentId, plantId, competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
          select: { id: true },
        });
        if (!assessmentExists) {
          throw new CompetenceValidationError(
            "ASSESSMENT_NOT_FOUND",
            "The referenced assessment was not found for this worker and competence type in this plant.",
          );
        }
      }
      if (segregationOfDuties) {
        await assertSegregationOfDuties(tx, {
          plantId,
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          assessmentId: input.assessmentId ?? null,
          actorUserId,
        });
      }
```

- [ ] **Step 4: Run to verify all grantAuthorization tests pass**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts -t "grantAuthorization"`
Expected: PASS.

- [ ] **Step 5: Run the full service test file**

Run: `cd c:\HSE\ma-hse && npx vitest run tests/unit/competence-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/services/competence-service.ts tests/unit/competence-service.test.ts
git commit -m "fix(competences): segregation of duties compares the supporting assessor, not the actor's assessment history"
```

---

## Task 15: Translate module error codes, sweep every route for the same fix, and add Task 13's UI strings

**Files:**
- Modify: `lib/client-api.ts`
- Modify: `app/api/plants/[plantCode]/competences/trainings/route.ts`
- Modify: `app/api/plants/[plantCode]/competences/assessments/route.ts`
- Modify: `app/api/plants/[plantCode]/competences/authorizations/route.ts`
- Modify: `app/api/plants/[plantCode]/competences/authorizations/[id]/suspend/route.ts`
- Modify: `app/api/plants/[plantCode]/competences/authorizations/[id]/revoke/route.ts`
- Modify: `app/api/plants/[plantCode]/competences/authorizations/[id]/reactivate/route.ts`
- Modify: `components/feature/competence-cell-detail-panel.tsx`
- Modify: `lib/ui-language.ts` (all 7 language blocks)

**Interfaces:**
- Produces: `ApiError` class (extends `Error`, adds `errorCode?: string`) exported from `lib/client-api.ts` — every existing `catch (error) { error instanceof Error ? ... }` call site across the app keeps working unchanged, since `ApiError instanceof Error` is `true`.

- [ ] **Step 1: Add ApiError to client-api.ts**

In `lib/client-api.ts`, add:

```typescript
export class ApiError extends Error {
  constructor(message: string, public readonly errorCode?: string) {
    super(message);
    this.name = "ApiError";
  }
}
```

Replace `requireApiResponse`'s two `throw new Error(...)` calls:

```typescript
export async function requireApiResponse<T>(response: Response, fallbackMessage: string) {
  const json = await parseApiResponse<T>(response);

  if (!json) {
    throw new ApiError(fallbackMessage);
  }

  if (!response.ok || !json.ok) {
    throw new ApiError(json.message ?? fallbackMessage, json.errorCode);
  }

  return json;
}
```

- [ ] **Step 2: Make every competence route that can throw CompetenceValidationError preserve its code**

In each of these six files, replace the `catch (error) { return fail("<ROUTE_LEVEL_CODE>", error instanceof Error ? error.message : "<fallback>", 422); }` block with a version that checks `CompetenceValidationError` first. Example for `trainings/route.ts`:

```typescript
import { CompetenceService, CompetenceValidationError } from "@/lib/services/competence-service";
```

```typescript
  } catch (error) {
    if (error instanceof CompetenceValidationError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("REGISTER_TRAINING_FAILED", error instanceof Error ? error.message : "Failed to register training", 422);
  }
```

Apply the same pattern (import `CompetenceValidationError` alongside `CompetenceService`, check it first in the catch block, keep the route's own fallback code/message/status for anything else) to:
- `assessments/route.ts` (fallback stays `"REGISTER_ASSESSMENT_FAILED"`)
- `authorizations/route.ts` (fallback stays `"GRANT_AUTHORIZATION_FAILED"`)
- `authorizations/[id]/suspend/route.ts` (fallback stays `"SUSPEND_AUTHORIZATION_FAILED"`)
- `authorizations/[id]/revoke/route.ts` (fallback stays `"REVOKE_AUTHORIZATION_FAILED"`)
- `authorizations/[id]/reactivate/route.ts` (fallback stays `"REACTIVATE_AUTHORIZATION_FAILED"`)

(`competences/entries/route.ts`, added in Task 12, already does this — it was written with the check from the start.)

- [ ] **Step 3: Map error codes to translated labels in the cell detail panel**

In `components/feature/competence-cell-detail-panel.tsx`, add near the top of the file (after the imports):

```typescript
import { ApiError, requireApiResponse } from "@/lib/client-api";

const ERROR_CODE_LABEL_KEYS: Partial<Record<string, keyof CompetencesUiDictionary>> = {
  SEGREGATION_OF_DUTIES: "errorSegregationOfDuties",
  TRAINING_LINK_REQUIRED: "errorTrainingLinkRequired",
  TRAINING_NOT_FOUND: "errorTrainingNotFound",
  ASSESSMENT_REQUIRED: "errorAssessmentRequired",
  ASSESSMENT_NOT_FOUND: "errorAssessmentNotFound",
  AUTHORIZATION_NOT_REQUIRED: "errorAuthorizationNotRequired",
  TRAINING_REQUIRED: "errorTrainingRequired",
  SUSPENDED_AUTHORIZATION_REQUIRES_REACTIVATION: "errorSuspendedRequiresReactivation",
  AUTHORIZATION_EXPIRED: "errorAuthorizationExpired",
  ENTRY_NOT_FOUND: "errorEntryNotFound",
};
```

(Remove the plain `import { requireApiResponse } from "@/lib/client-api";` line that's already there — Step 3 replaces it with the combined import above.)

Change the `submit` function's `catch` block from:

```typescript
    } catch (error) {
      setFormError(error instanceof Error ? error.message : labels.formError);
    } finally {
```

to:

```typescript
    } catch (error) {
      if (error instanceof ApiError && error.errorCode) {
        const labelKey = ERROR_CODE_LABEL_KEYS[error.errorCode];
        if (labelKey) {
          setFormError(labels[labelKey]);
          setSaving(false);
          return;
        }
      }
      setFormError(error instanceof Error ? error.message : labels.formError);
    } finally {
```

- [ ] **Step 4: Add every new dictionary key to all 7 languages**

In `lib/ui-language.ts`, for each of the 7 `competences: {` blocks (`en` ~line 340, `pt` ~line 1006, `it` ~line 1576, `pl` ~line 2146, `de` ~line 2716, `ro` ~line 3286, `fr` ~line 3856 — line numbers shift as earlier tasks in this plan edit the file; locate each block by its language's existing `competences: {` opening line, not by these numbers), add the following keys immediately before that block's closing `},`. The value column below gives the literal string for every language — copy the row matching each block's language.

| key | en | pt | it | pl | de | ro | fr |
|---|---|---|---|---|---|---|---|
| `entryFormOpenButton` | Register | Registar | Registra | Zarejestruj | Erfassen | Înregistrează | Enregistrer |
| `entryFormTrainingSectionTitle` | Training | Formação | Formazione | Szkolenie | Schulung | Formare | Formation |
| `entryFormAssessmentSectionTitle` | Practical assessment | Avaliação prática | Valutazione pratica | Ocena praktyczna | Praktische Bewertung | Evaluare practică | Évaluation pratique |
| `entryFormAuthorizationSectionTitle` | Authorization | Autorização | Autorizzazione | Upoważnienie | Genehmigung | Autorizație | Autorisation |
| `entryFormExpand` | Expand | Expandir | Espandi | Rozwiń | Erweitern | Extinde | Développer |
| `entryFormCollapse` | Collapse | Recolher | Comprimi | Zwiń | Reduzieren | Restrânge | Réduire |
| `entryFormContinuingNotice` | Completing the entry started on {date}. | A completar o registo iniciado em {date}. | Completamento della voce iniziata il {date}. | Uzupełnianie wpisu rozpoczętego {date}. | Vervollständigung des am {date} begonnenen Eintrags. | Se completează înregistrarea începută la {date}. | Complétion de l'entrée commencée le {date}. |
| `entryFormAssessorTypeLabel` | Assessor | Avaliador | Valutatore | Osoba oceniająca | Bewerter | Evaluator | Évaluateur |
| `entryFormAssessorTypeInternal` | App user | Utilizador da aplicação | Utente dell'applicazione | Użytkownik aplikacji | App-Benutzer | Utilizator al aplicației | Utilisateur de l'application |
| `entryFormAssessorTypeExternal` | External assessor | Avaliador externo | Valutatore esterno | Zewnętrzna osoba oceniająca | Externer Bewerter | Evaluator extern | Évaluateur externe |
| `entryFormAssessorUserLabel` | Select user | Selecionar utilizador | Seleziona utente | Wybierz użytkownika | Benutzer auswählen | Selectează utilizator | Sélectionner l'utilisateur |
| `entryFormAssessorUserPlaceholder` | Select a user | Selecione um utilizador | Seleziona un utente | Wybierz użytkownika | Bitte wählen | Selectați un utilizator | Sélectionnez un utilisateur |
| `entryFormAssessorNameLabel` | External assessor's name | Nome do avaliador externo | Nome del valutatore esterno | Imię i nazwisko osoby oceniającej | Name des externen Bewerters | Numele evaluatorului extern | Nom de l'évaluateur externe |
| `entryFormAuthorizationDisabledReason` | Complete a competent practical assessment first — the authorization section unlocks once it's registered. | Completa primeiro uma avaliação prática com resultado competente — a secção de autorização desbloqueia depois de registada. | Completa prima una valutazione pratica con esito competente — la sezione autorizzazione si sblocca dopo la registrazione. | Najpierw ukończ ocenę praktyczną z wynikiem pozytywnym — sekcja upoważnienia odblokuje się po jej zarejestrowaniu. | Schließen Sie zuerst eine praktische Bewertung mit dem Ergebnis „kompetent" ab — der Genehmigungsabschnitt wird danach freigeschaltet. | Completează mai întâi o evaluare practică cu rezultat competent — secțiunea de autorizare se deblochează după înregistrare. | Terminez d'abord une évaluation pratique avec un résultat compétent — la section autorisation se débloque une fois celle-ci enregistrée. |
| `errorSegregationOfDuties` | Segregation of duties: the person who performed the supporting practical assessment cannot grant this authorization. | Separação de funções: quem realizou a avaliação prática de suporte não pode conceder esta autorização. | Separazione dei compiti: chi ha effettuato la valutazione pratica di supporto non può concedere questa autorizzazione. | Rozdzielenie obowiązków: osoba, która przeprowadziła oceniającą ocenę praktyczną, nie może udzielić tego upoważnienia. | Funktionstrennung: Wer die zugrunde liegende praktische Bewertung durchgeführt hat, kann diese Genehmigung nicht erteilen. | Separarea atribuțiilor: persoana care a efectuat evaluarea practică de sprijin nu poate acorda această autorizație. | Séparation des tâches : la personne qui a réalisé l'évaluation pratique de soutien ne peut pas accorder cette autorisation. |
| `errorTrainingLinkRequired` | This competence requires training: link the passed training record before registering the assessment. | Esta competência exige formação: associa o registo de formação aprovado antes de registar a avaliação. | Questa competenza richiede formazione: collega il record di formazione superato prima di registrare la valutazione. | Ta kompetencja wymaga szkolenia: przed zarejestrowaniem oceny połącz zaliczony rekord szkolenia. | Diese Kompetenz erfordert eine Schulung: Verknüpfen Sie den bestandenen Schulungsnachweis, bevor Sie die Bewertung registrieren. | Această competență necesită formare: leagă înregistrarea de formare promovată înainte de a înregistra evaluarea. | Cette compétence nécessite une formation : associez l'enregistrement de formation réussi avant d'enregistrer l'évaluation. |
| `errorTrainingNotFound` | The referenced training record was not found for this worker and competence. | O registo de formação indicado não foi encontrado para este trabalhador e competência. | Il record di formazione indicato non è stato trovato per questo lavoratore e competenza. | Nie znaleziono wskazanego rekordu szkolenia dla tego pracownika i kompetencji. | Der angegebene Schulungsnachweis wurde für diesen Mitarbeiter und diese Kompetenz nicht gefunden. | Înregistrarea de formare indicată nu a fost găsită pentru acest lucrător și competență. | L'enregistrement de formation indiqué est introuvable pour ce collaborateur et cette compétence. |
| `errorAssessmentRequired` | This competence requires a competent practical assessment before an authorization can be granted. | Esta competência exige uma avaliação prática com resultado competente antes de conceder a autorização. | Questa competenza richiede una valutazione pratica con esito competente prima di concedere l'autorizzazione. | Ta kompetencja wymaga oceny praktycznej z wynikiem pozytywnym przed udzieleniem upoważnienia. | Diese Kompetenz erfordert eine kompetente praktische Bewertung, bevor eine Genehmigung erteilt werden kann. | Această competență necesită o evaluare practică competentă înainte de a putea fi acordată autorizația. | Cette compétence nécessite une évaluation pratique compétente avant qu'une autorisation puisse être accordée. |
| `errorAssessmentNotFound` | The referenced assessment was not found for this worker and competence. | A avaliação indicada não foi encontrada para este trabalhador e competência. | La valutazione indicata non è stata trovata per questo lavoratore e competenza. | Nie znaleziono wskazanej oceny dla tego pracownika i kompetencji. | Die angegebene Bewertung wurde für diesen Mitarbeiter und diese Kompetenz nicht gefunden. | Evaluarea indicată nu a fost găsită pentru acest lucrător și competență. | L'évaluation indiquée est introuvable pour ce collaborateur et cette compétence. |
| `errorAuthorizationNotRequired` | This competence type does not require a formal authorization. | Este tipo de competência não exige autorização formal. | Questo tipo di competenza non richiede un'autorizzazione formale. | Ten typ kompetencji nie wymaga formalnego upoważnienia. | Dieser Kompetenztyp erfordert keine formelle Genehmigung. | Acest tip de competență nu necesită o autorizație formală. | Ce type de compétence ne nécessite pas d'autorisation formelle. |
| `errorTrainingRequired` | This competence requires a passed training record before an authorization can be granted. | Esta competência exige um registo de formação aprovado antes de conceder a autorização. | Questa competenza richiede un record di formazione superato prima di concedere l'autorizzazione. | Ta kompetencja wymaga zaliczonego rekordu szkolenia przed udzieleniem upoważnienia. | Diese Kompetenz erfordert einen bestandenen Schulungsnachweis, bevor eine Genehmigung erteilt werden kann. | Această competență necesită o înregistrare de formare promovată înainte de a putea fi acordată autorizația. | Cette compétence nécessite un enregistrement de formation réussi avant qu'une autorisation puisse être accordée. |
| `errorSuspendedRequiresReactivation` | This worker has a suspended authorization for this competence — reactivate it explicitly before granting a new one. | Este trabalhador tem uma autorização suspensa para esta competência — reativa-a explicitamente antes de conceder uma nova. | Questo lavoratore ha un'autorizzazione sospesa per questa competenza — riattivala esplicitamente prima di concederne una nuova. | Ten pracownik ma zawieszone upoważnienie dla tej kompetencji — najpierw jawnie je przywróć, zanim udzielisz nowego. | Dieser Mitarbeiter hat eine ausgesetzte Genehmigung für diese Kompetenz — reaktivieren Sie diese ausdrücklich, bevor Sie eine neue erteilen. | Acest lucrător are o autorizație suspendată pentru această competență — reactiveaz-o explicit înainte de a acorda una nouă. | Ce collaborateur a une autorisation suspendue pour cette compétence — réactivez-la explicitement avant d'en accorder une nouvelle. |
| `errorAuthorizationExpired` | This authorization has already expired — grant a new one instead. | Esta autorização já expirou — concede uma nova em vez desta. | Questa autorizzazione è già scaduta — concedine una nuova al suo posto. | To upoważnienie już wygasło — udziel nowego zamiast tego. | Diese Genehmigung ist bereits abgelaufen — erteilen Sie stattdessen eine neue. | Această autorizație a expirat deja — acordă una nouă în locul ei. | Cette autorisation a déjà expiré — accordez-en une nouvelle à la place. |
| `errorEntryNotFound` | The referenced entry was not found for this worker and competence. | O registo indicado não foi encontrado para este trabalhador e competência. | La voce indicata non è stata trovata per questo lavoratore e competenza. | Nie znaleziono wskazanego wpisu dla tego pracownika i kompetencji. | Der angegebene Eintrag wurde für diesen Mitarbeiter und diese Kompetenz nicht gefunden. | Înregistrarea indicată nu a fost găsită pentru acest lucrător și competență. | L'entrée indiquée est introuvable pour ce collaborateur et cette compétence. |

- [ ] **Step 5: Type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "ui-language|competence-cell-detail-panel|client-api"`
Expected: no output.

- [ ] **Step 6: Run the unit test suite**

Run: `cd c:\HSE\ma-hse && npx vitest run`
Expected: all pass — `client-api.ts` has no dedicated unit test today, but nothing else in the suite constructs `Error` directly from `requireApiResponse`'s output in a way `instanceof Error` would fail on (an `ApiError` still satisfies `instanceof Error`).

- [ ] **Step 7: Commit**

```bash
cd c:\HSE\ma-hse
git add lib/client-api.ts lib/ui-language.ts components/feature/competence-cell-detail-panel.tsx app/api/plants/[plantCode]/competences
git commit -m "feat(competences): translate module error codes across all 7 languages"
```

---

## Task 16: Empty state for a worker with no marked requirements

**Files:**
- Modify: `components/feature/competence-worker-profile.tsx`
- Modify: `lib/ui-language.ts` (all 7 language blocks — 2 new keys)

**Interfaces:**
- Consumes: `profile.competences` (already available; the empty state fires when every row has `isRequired === false`).

- [ ] **Step 1: Add the two dictionary keys to all 7 languages**

In `lib/ui-language.ts`, add these two keys to each `competences: {` block (same insertion process as Task 15 Step 4):

| key | en | pt | it | pl | de | ro | fr |
|---|---|---|---|---|---|---|---|
| `workerRequirementEmptyTitle` | No competence marked as required yet | Ainda não foi marcada nenhuma competência como necessária | Nessuna competenza ancora contrassegnata come necessaria | Żadna kompetencja nie została jeszcze oznaczona jako wymagana | Noch keine Kompetenz als erforderlich markiert | Nicio competență nu a fost încă marcată ca necesară | Aucune compétence encore marquée comme nécessaire |
| `workerRequirementEmptyDescription` | Every cell for this worker shows "Not required" until someone who knows their duties marks one as required, below. | Todas as células deste trabalhador mostram "Não necessária" até alguém que conheça as suas funções marcar uma como necessária, abaixo. | Tutte le celle di questo lavoratore mostrano "Non necessaria" finché qualcuno che conosce le sue mansioni non ne contrassegna una come necessaria, qui sotto. | Wszystkie komórki tego pracownika pokazują "Niewymagane", dopóki ktoś znający jego obowiązki nie oznaczy poniżej jednej jako wymaganą. | Alle Zellen dieses Mitarbeiters zeigen „Nicht erforderlich", bis jemand, der seine Aufgaben kennt, unten eine als erforderlich markiert. | Toate celulele acestui lucrător arată „Nu este necesară" până când cineva care îi cunoaște atribuțiile marchează mai jos una ca necesară. | Toutes les cellules de ce collaborateur affichent « Non requise » jusqu'à ce que quelqu'un connaissant ses tâches en marque une comme requise, ci-dessous. |

- [ ] **Step 2: Add the empty-state block to CompetenceWorkerProfile**

In `components/feature/competence-worker-profile.tsx`, inside the "Competências" `<AppPanel>` (the one currently rendering `{profile.competences.length === 0 ? (...catalog empty...) : (...grid of cells...)}`), add a third branch for "catalog has types, but none marked required for this worker":

```typescript
        {profile.competences.length === 0 ? (
          <div className="app-empty mt-2 py-6 text-center" role="status">
            <p className="font-semibold text-slate-700">{labels.catalogEmptyTitle}</p>
            <p className="mt-1">{labels.catalogEmptyDescription}</p>
            {viewerRole === "N1_CORPORATE" || viewerRole === "N3_SAFETY" ? (
              <Link href={`/app/${plant}/admin`} className="mt-3 inline-block font-semibold text-emerald-700 hover:underline">
                {labels.catalogEmptyLink}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {profile.competences.every((row) => !row.isRequired) ? (
              <div className="app-empty mt-2 py-4 text-center" role="status">
                <p className="font-semibold text-slate-700">{labels.workerRequirementEmptyTitle}</p>
                <p className="mt-1 text-sm">{labels.workerRequirementEmptyDescription}</p>
              </div>
            ) : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profile.competences.map((row) => {
                const meta = STATE_META[row.state];
                const Icon = meta.icon;
                return (
                  <button
                    key={row.competenceTypeId}
                    type="button"
                    onClick={() => setActiveCompetenceTypeId(row.competenceTypeId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatCompetenceCellText(row, labels)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
```

This replaces the existing `) : (` ... `)}` branch (the one currently rendering just the grid) — keep the `profile.competences.length === 0` branch exactly as it was.

- [ ] **Step 3: Type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i competence-worker-profile`
Expected: no output.

- [ ] **Step 4: Manual verification**

Start the app (`run` skill or `npm run dev:all`), open the profile of a worker who has zero `CompetenceWorkerRequirement` rows (any newly enrolled worker, before Task 9's checkbox UI is used on them), and confirm the new empty-state message appears above the grid of (all "Not required") competence cards. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
cd c:\HSE\ma-hse
git add components/feature/competence-worker-profile.tsx lib/ui-language.ts
git commit -m "feat(competences): add empty state for a worker with no marked requirements"
```

---

## Task 17: Update the module spec

**Files:**
- Modify: `docs/modulo-competencias-autorizacoes.md`

- [ ] **Step 1: Update §3.2**

Replace §3.2's `CompetenceRequirement`/`CompetenceRequirementScope` Prisma snippet and its "Resolução" paragraph with the `CompetenceWorkerRequirement` model from Task 2 Step 1, and explain the reasoning:

```markdown
### 3.2 Requisito por trabalhador — o que resolve o cinzento

A matriz de requisitos por função/área/posto (v1.0) dependia de `CompetenceWorker.roleName` e `CompetenceWorker.areaId` estarem preenchidos para resolver. Na prática nunca estiveram — a maioria dos trabalhadores foi inscrita sem função nem área atribuída, o que deixava a resolução por regra a devolver sempre "Não necessária" em toda a planta. A matriz de regras é substituída por marcação direta, por trabalhador:

```prisma
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
  setBy            User?            @relation("CompetenceWorkerRequirementSetBy", fields: [setById], references: [id])

  @@unique([competenceWorkerId, competenceTypeId])
  @@index([plantId, isRequired])
}
```

**Resolução:** uma competência é exigida a um trabalhador se e só se existir uma linha `CompetenceWorkerRequirement` para esse par com `isRequired = true`. Sem linha, não é exigida — o cinzento é agora o estado inicial explícito de todo o par (trabalhador, competência), não o resultado de uma regra que nunca casou. `CompetenceWorker.roleName` mantém-se — continua a alimentar a coluna Função e o filtro da matriz — mas deixa de determinar requisitos.
```

- [ ] **Step 2: Update §3.7**

In §3.7's "Recalculado em três momentos" paragraph, replace "(b) na alteração da matriz de requisitos ou da função do trabalhador" with "(b) na marcação ou desmarcação de um requisito por trabalhador (`setWorkerCompetenceRequirement`) ou na alteração da função sincronizada de Medicina do Trabalho".

- [ ] **Step 3: Update §5, step 1**

Replace §5's pseudocode step 1:

```
  1. requisito = resolverRequisito(trabalhador, competência)
     se requisito == NÃO_EXIGIDA e não existe autorização ativa:
        → NOT_APPLICABLE
```

with:

```
  1. requisito = CompetenceWorkerRequirement(trabalhador, competência)
     se requisito não existe ou requisito.isRequired == false, e não existe NENHUM registo
     (nem formação, nem avaliação, nem autorização) para este par:
        → NOT_APPLICABLE
```

And in the "Notas de implementação" bullet list right below the pseudocode, replace the first bullet:

```
- O passo 1 tem uma exceção deliberada: se a competência deixou de ser exigida mas o trabalhador ainda tem autorização ativa, o estado real é mostrado, não cinzento. Esconder uma autorização ativa porque a função mudou é como se perdem autorizações que continuam legalmente válidas.
```

with:

```
- O passo 1 tem uma exceção deliberada, alargada a qualquer registo (não só a autorização ativa): se a competência não é exigida mas o trabalhador tem formação, avaliação ou autorização registada — mesmo sem estar ativa — o estado real é mostrado, não cinzento. Um trabalhador com formação aprovada e avaliação competente, sem requisito e sem autorização, tem de mostrar "Aguarda autorização", não "Não necessária" — esconder trabalho já feito é o pior resultado possível deste algoritmo.
```

- [ ] **Step 4: Update §2.3**

Append to the note under the segregation-of-duties parameter box in §2.3:

```markdown
> **Revisão (item 4).** A verificação compara o `assessorUserId` da avaliação de suporte concreta (a indicada por `assessmentId`, ou a avaliação competente mais recente na ausência de `assessmentId`) com quem concede — nunca "existe alguma avaliação competente feita pelo actor para este par", que bloqueava indevidamente sempre que o actor tivesse avaliado o mesmo trabalhador/competência em qualquer momento do passado, mesmo quando essa avaliação não era a que sustentava a autorização em causa.
```

- [ ] **Step 5: Update §3.4/§3.5/§3.6**

Add a new subsection right after §3.6 (Nível 3 — Autorização), before §3.7:

```markdown
### 3.6a Uma entrada, três níveis, uma submissão

`TrainingRecord`, `CompetenceAssessment` e `WorkerAuthorization` ganham `entryGroupId String?` (com `@@index([entryGroupId])` nos três). Quando as três secções do formulário unificado (§6.3) são preenchidas na mesma submissão, os três registos partilham o mesmo `entryGroupId`, atribuído em `CompetenceService.registerCompetenceEntry` dentro de uma única `prisma.$transaction()`. Completar depois — acrescentar avaliação ou autorização a uma formação já registada — reutiliza o `entryGroupId` existente em vez de criar um novo; o histórico agrupa por este campo, e registos anteriores sem `entryGroupId` continuam a aparecer individualmente.
```

- [ ] **Step 6: Update §6.2/§6.3**

In §6.2, remove any remaining reference to a requirement-matrix admin screen (the section as currently written does not describe one directly — confirm by rereading §6.2 before editing; if it only lists the matrix's own filters/columns, no change is needed there since `CompetenceWorker.roleName` still feeds the "Função" column and filter as noted in Task 17 Step 1's edit to §3.2).

In §6.3 ("Ficha individual do trabalhador"), append after the existing "Competências" bullet:

```markdown
Cada cartão de competência tem uma caixa de seleção "Necessária para este trabalhador" (`PATCH .../competences/workers/[id]/requirements`), que grava de imediato e recalcula a célula. Mostra por baixo quem marcou e quando (`CompetenceWorkerRequirement.setBy`/`setAt`). Um resumo acima da grelha ("X de Y competências marcadas como necessárias") e os botões "Marcar todas"/"Desmarcar todas" (implementados como N chamadas sequenciais ao mesmo endpoint, não um endpoint de lote novo) apoiam o arranque de um trabalhador recém-inscrito. Papéis de escrita: `N3_SAFETY` e `N4_SUPERVISOR`, mais `N0_ADMIN`/`N1_CORPORATE` por bypass do guard — os mesmos que podem registar formação e avaliação.

Um trabalhador sem nenhum requisito marcado mostra um aviso explícito acima da grelha ("Ainda não foi marcada nenhuma competência...") em vez de uma grelha silenciosamente cinzenta — é o estado normal de um trabalhador recém-inscrito, não um erro.
```

- [ ] **Step 7: Add the four decisions to §12's closed-decisions table**

Append four rows to the "Fechadas" table in §12:

```markdown
| 2.3-rev | Separação de funções compara o avaliador de suporte, não o histórico do actor | `assertSegregationOfDuties` resolve por `assessmentId` ou pela avaliação competente mais recente |
| 3.2-rev | Requisitos passam de regra por função/área/posto a marcação por trabalhador | `CompetenceWorkerRequirement`, backfill único a partir de `CompetenceRequirement` antes de a largar |
| 3.6a | Formação/avaliação/autorização partilham `entryGroupId` numa submissão única | `CompetenceService.registerCompetenceEntry`, uma `prisma.$transaction()` |
| 5-rev | NOT_APPLICABLE só quando não exigida E sem nenhum registo | Formação/avaliação registadas sem requisito já não ficam escondidas |
```

- [ ] **Step 8: Commit**

```bash
cd c:\HSE\ma-hse
git add docs/modulo-competencias-autorizacoes.md
git commit -m "docs(competences): update spec for per-worker requirements, unified entry, segregation fix"
```

---

## Task 18: Final verification

- [ ] **Step 1: Full type-check**

Run: `cd c:\HSE\ma-hse && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "competence|ui-language"`
Expected: no output (the pre-existing unrelated type errors documented in this repo's other sessions — e.g. `agent-audit-route.test.ts`'s `NextResponse<unknown> | undefined` warnings — are out of scope for this plan; confirm any remaining output is one of those, not a new one).

- [ ] **Step 2: Lint**

Run: `cd c:\HSE\ma-hse && npx eslint lib/services/competence-service.ts lib/services/competence-state-service.ts lib/services/competence-alert-service.ts lib/client-api.ts lib/ui-language.ts lib/validation/dtos.ts components/feature/competence-cell-detail-panel.tsx components/feature/competence-worker-profile.tsx app/api/plants/[plantCode]/competences app/(secure)/app/[plant]/admin/page.tsx`
Expected: no errors.

- [ ] **Step 3: Full unit test suite**

Run: `cd c:\HSE\ma-hse && npx vitest run`
Expected: all tests pass, including every new/rewritten file from this plan (`competence-state.test.ts`, `competence-service.test.ts`, `competence-worker-requirements-route.test.ts`, `competence-entries-route.test.ts`) and confirming `competence-requirement-resolution.test.ts` / `competence-requirements-route.test.ts` are gone, not skipped.

- [ ] **Step 4: Build**

Run: `cd c:\HSE\ma-hse && npm run build`
Expected: clean build, no type errors, no missing-import errors from the deleted `competence-requirement-manager.tsx` or the removed `CompetenceRequirement` Prisma types.

- [ ] **Step 5: Manual smoke test**

Using the `run` skill (or `npm run dev:all`), as an `N3_SAFETY` user: enroll a worker, mark two competences required from their profile (confirm the empty state disappears once the first one is marked), submit a full entry (training + assessment with an internal assessor + authorization) in one form, confirm the cell reads VALID, then try to grant an authorization for a different competence type as the same user who did the COMPETENT assessment for it and confirm the translated segregation-of-duties message appears (not raw English). Stop the dev server when done.

- [ ] **Step 6: Report to the user**

Summarize what changed, referencing this plan's file, and note that `scripts/backfill-competence-worker-requirements.ts` (Task 3) still needs to be run against any other environment (staging/production) before that environment's `drop_competence_requirement` migration (Task 7) is deployed — this plan only ran it against the local dev database.
