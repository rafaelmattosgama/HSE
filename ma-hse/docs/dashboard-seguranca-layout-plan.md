# Dashboard de Segurança — plano de implementação do layout em ecrã largo

> **Para executores:** SUB-SKILL OBRIGATÓRIA — usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** Pôr os indicadores de resultado do Dashboard de Segurança acima da dobra num
monitor de 1920px, movendo os três blocos de baixa densidade para uma coluna de contexto e
tornando as grelhas de KPIs fluidas.

**Arquitetura:** A página passa a ter duas colunas a partir de 1280px — fluxo principal com os
grupos de KPIs, coluna de contexto de 320px `sticky` com o contador de dias sem acidentes, a
pirâmide e a exposição. A coluna de contexto é escrita primeiro no DOM e reposicionada por
colocação explícita de grelha, para o responsivo funcionar sem JavaScript. Os componentes
colocados na coluna estreita passam a usar container queries em vez de breakpoints de viewport.

**Stack:** Next.js (App Router, componentes de servidor), React, Tailwind CSS v4,
vitest + jsdom + @testing-library/react.

**Spec:** `ma-hse/docs/dashboard-seguranca-layout-design.md`

## Constrangimentos globais

- Todos os comandos correm a partir de `ma-hse/` (não da raiz do repositório).
- Tailwind v4, sem ficheiro `tailwind.config`. Breakpoints por omissão: `sm` 640, `md` 768,
  `lg` 1024, `xl` 1280, `2xl` 1536. Não declarar breakpoints novos.
- Container queries são nativas do Tailwind v4 — não instalar `@tailwindcss/container-queries`.
- `tests/unit/safety-dashboard-kpi-groups.test.ts` **não pode ser editado**. É a rede de
  segurança da mudança de API. Se falhar, a implementação está errada.
- Testes unitários precisam de `// @vitest-environment jsdom` na primeira linha do ficheiro
  (`vitest.config.ts` tem `environment: "node"` global).
- Nenhum indicador pode desaparecer, duplicar ou passar a exigir interação para ser visto.
- Não alterar cálculos, consultas Prisma ou dados. Só layout e composição.
- O menu lateral da planta ocupa 240px e não se mexe.

---

### Task 1: Grelhas de KPIs fluidas

Torna as grelhas responsivas à largura disponível em vez de fixas em 4 colunas. Isolada e com
ganho visível por si só, mesmo que o resto do plano parasse aqui.

**Ficheiros:**
- Modificar: `components/feature/safety-dashboard-kpi-groups.tsx:92` e `:247`
- Criar: `tests/unit/safety-dashboard-kpi-layout.test.ts`

**Interfaces:**
- Consome: nada
- Produz: nada (só classes CSS)

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/unit/safety-dashboard-kpi-layout.test.ts`:

```ts
// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;

const baseMetrics = {
  validatedEvents: 2, injuries: 0, daysLost: 0, firstAids: 1,
  frequencyRate: 0, gravityRate: 0, firstAidRate: 13.3,
  nearMisses: 0, unsafeActs: 0, unsafeConditions: 0, rootCauses: 12,
  openActions: 24, overdueActions: 7, closedOnTimePercent: 82,
  unsafeActsClosedPercent: null, unsafeConditionsClosedPercent: null,
  pendingValidation: 1, openCommunications: 3, myOpenActions: 3,
  hoursWorked: 75243,
};

function renderGroups(extra: Record<string, unknown> = {}) {
  return render(createElement(SafetyDashboardKpiGroups, {
    locale: "en",
    periodLabel: "2026-01-01 - 2026-12-31",
    labels,
    detailed: true,
    showPendingValidationKpi: true,
    canViewOpenCommunications: true,
    metrics: baseMetrics,
    ...extra,
  } as never));
}

describe("layout fluido das grelhas de KPIs", () => {
  afterEach(cleanup);

  it("usa auto-fill em vez de um número fixo de colunas", () => {
    const { container } = renderGroups();
    const grids = container.querySelectorAll('[class*="auto-fill"]');
    expect(grids.length).toBeGreaterThanOrEqual(2);
  });

  it("não deixa nenhuma grelha de KPIs presa em xl:grid-cols-4", () => {
    const { container } = renderGroups();
    expect(container.querySelectorAll(".xl\\:grid-cols-4").length).toBe(0);
  });

  it("mantém o mínimo de 240px por cartão", () => {
    const { container } = renderGroups();
    const grid = container.querySelector('[class*="auto-fill"]');
    expect(grid?.className).toContain("minmax(240px,1fr)");
  });

  it("continua a mostrar todos os indicadores de resultado", () => {
    renderGroups();
    expect(screen.getByText(labels.kpiDaysLost)).toBeTruthy();
    expect(screen.getByText(labels.hoursWorked)).toBeTruthy();
  });
});
```

Nota sobre desenho de testes: afirmar classes CSS é normalmente frágil e evita-se. Aqui a
classe **é** o produto da tarefa, e o teste existe para impedir o regresso a um número fixo
de colunas. A quarta asserção garante que a mudança de classes não engoliu conteúdo.

- [ ] **Passo 2: Correr o teste e confirmar que falha**

```bash
npx vitest run tests/unit/safety-dashboard-kpi-layout.test.ts
```

Esperado: FALHA nos três primeiros testes — hoje as grelhas são `sm:grid-cols-2 xl:grid-cols-4`.

- [ ] **Passo 3: Implementar**

Em `components/feature/safety-dashboard-kpi-groups.tsx`, linha 92 (dentro de `KpiGroup`):

```diff
-      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
+      <div className="mt-4 grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">{children}</div>
```

E linha 247 (grelha do grupo Safety outcomes, que não passa por `KpiGroup`):

```diff
-        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
+        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
```

`auto-fill` com `minmax(240px,1fr)` desce sozinho a 1 coluna abaixo dos 240px, por isso o
`sm:grid-cols-2` deixa de ser preciso.

- [ ] **Passo 4: Correr os testes e confirmar que passam**

```bash
npx vitest run tests/unit/safety-dashboard-kpi-layout.test.ts tests/unit/safety-dashboard-kpi-groups.test.ts
```

Esperado: PASSA nos dois ficheiros. O segundo tem de passar **sem edição**.

- [ ] **Passo 5: Commit**

```bash
git add components/feature/safety-dashboard-kpi-groups.tsx tests/unit/safety-dashboard-kpi-layout.test.ts
git commit -m "feat(dashboard): grelhas de KPIs fluidas por auto-fill"
```

---

### Task 2: Prop de filtro de grupos

Permite à página renderizar um subconjunto de grupos, para pôr Exposição noutra coluna.

**Ficheiros:**
- Modificar: `components/feature/safety-dashboard-kpi-groups.tsx` (tipo, assinatura, render)
- Criar: `tests/unit/safety-dashboard-kpi-composition.test.ts`

**Interfaces:**
- Consome: Task 1 (grelhas fluidas)
- Produz:
  ```ts
  export type KpiGroupKey =
    | "outcomes" | "sifPsif" | "leading" | "exposure"
    | "actions" | "competences" | "fireEquipment";
  ```
  `SafetyDashboardKpiGroups` aceita mais duas props opcionais:
  `groups?: KpiGroupKey[]` (omissão: todos, pela ordem atual) e
  `testId?: string` (omissão: `"safety-kpi-groups"`).

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/unit/safety-dashboard-kpi-composition.test.ts`:

```ts
// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;

const baseMetrics = {
  validatedEvents: 2, injuries: 0, daysLost: 0, firstAids: 1,
  frequencyRate: 0, gravityRate: 0, firstAidRate: 13.3,
  nearMisses: 0, unsafeActs: 0, unsafeConditions: 0, rootCauses: 12,
  openActions: 24, overdueActions: 7, closedOnTimePercent: 82,
  unsafeActsClosedPercent: null, unsafeConditionsClosedPercent: null,
  pendingValidation: 1, openCommunications: 3, myOpenActions: 3,
  hoursWorked: 75243,
};

function renderGroups(extra: Record<string, unknown> = {}) {
  return render(createElement(SafetyDashboardKpiGroups, {
    locale: "en",
    periodLabel: "2026-01-01 - 2026-12-31",
    labels,
    detailed: true,
    showPendingValidationKpi: true,
    canViewOpenCommunications: true,
    metrics: baseMetrics,
    ...extra,
  } as never));
}

describe("composição por grupos", () => {
  afterEach(cleanup);

  it("renderiza todos os grupos quando a prop é omitida", () => {
    renderGroups();
    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiExposureScope })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiActionsCompliance })).toBeTruthy();
  });

  it("renderiza só a exposição quando pedida isoladamente", () => {
    renderGroups({ groups: ["exposure"] });
    expect(screen.getByRole("heading", { name: labels.kpiExposureScope })).toBeTruthy();
    expect(screen.getByText(labels.hoursWorked)).toBeTruthy();
    expect(screen.getByText(labels.plants)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeNull();
    expect(screen.queryByRole("heading", { name: labels.kpiActionsCompliance })).toBeNull();
  });

  it("omite a exposição quando pedidos os restantes grupos", () => {
    renderGroups({ groups: ["outcomes", "sifPsif", "leading", "actions", "competences", "fireEquipment"] });
    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiActionsCompliance })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: labels.kpiExposureScope })).toBeNull();
  });

  it("permite um identificador de teste próprio", () => {
    const { container } = renderGroups({ groups: ["exposure"], testId: "safety-kpi-context" });
    expect(container.querySelector('[data-testid="safety-kpi-context"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="safety-kpi-groups"]')).toBeNull();
  });

  it("junta os dois subconjuntos sem perder nem duplicar indicadores", () => {
    const todos = renderGroups();
    const totalCompleto = todos.container.querySelectorAll(".app-kpi-card").length;
    cleanup();

    const principal = renderGroups({ groups: ["outcomes", "sifPsif", "leading", "actions", "competences", "fireEquipment"] });
    const totalPrincipal = principal.container.querySelectorAll(".app-kpi-card").length;
    cleanup();

    const contexto = renderGroups({ groups: ["exposure"] });
    const totalContexto = contexto.container.querySelectorAll(".app-kpi-card").length;

    expect(totalPrincipal + totalContexto).toBe(totalCompleto);
  });
});
```

O último teste é o que interessa mesmo: prova que dividir os grupos por duas colunas não
perde nem duplica cartões. É a garantia automática do critério "nada sai" da spec.

- [ ] **Passo 2: Correr o teste e confirmar que falha**

```bash
npx vitest run tests/unit/safety-dashboard-kpi-composition.test.ts
```

Esperado: o primeiro teste passa (comportamento atual); os restantes falham, porque a prop
`groups` ainda não existe e o componente renderiza sempre tudo.

- [ ] **Passo 3: Implementar**

Em `components/feature/safety-dashboard-kpi-groups.tsx`, junto aos outros tipos do topo
(a seguir a `type Metric = {...}`):

```ts
export type KpiGroupKey =
  | "outcomes"
  | "sifPsif"
  | "leading"
  | "exposure"
  | "actions"
  | "competences"
  | "fireEquipment";

const ALL_KPI_GROUPS: KpiGroupKey[] = [
  "outcomes", "sifPsif", "leading", "exposure", "actions", "competences", "fireEquipment",
];
```

Na assinatura de `SafetyDashboardKpiGroups`, acrescentar às props desestruturadas
`groups` e `testId`, e ao tipo:

```ts
  groups?: KpiGroupKey[];
  testId?: string;
```

Logo a seguir às constantes derivadas (depois de `sifPsifCategories`), acrescentar:

```ts
  const visibleGroups = new Set<KpiGroupKey>(groups ?? ALL_KPI_GROUPS);
  const shows = (key: KpiGroupKey) => visibleGroups.has(key);
```

E no `return`, envolver cada grupo na condição respetiva, mantendo a ordem atual:

```diff
-    <div className="space-y-5" data-testid="safety-kpi-groups">
-      <section aria-labelledby="safety-outcomes-heading" className="space-y-4">
+    <div className="space-y-5" data-testid={testId ?? "safety-kpi-groups"}>
+      {shows("outcomes") ? <section aria-labelledby="safety-outcomes-heading" className="space-y-4">
```

fechando essa `<section>` com `</section> : null}`, e nos restantes seis grupos trocando a
condição existente pela conjunção com `shows(...)`:

```diff
-      {metrics.sifPsif ? <KpiGroup
+      {shows("sifPsif") && metrics.sifPsif ? <KpiGroup
```
```diff
-      {detailed ? <KpiGroup id="leading-indicators-heading"
+      {shows("leading") && detailed ? <KpiGroup id="leading-indicators-heading"
```
```diff
-      <KpiGroup id="exposure-scope-heading"
+      {shows("exposure") ? <KpiGroup id="exposure-scope-heading"
```
(fechar com `</KpiGroup> : null}`)
```diff
-      <KpiGroup id="actions-compliance-heading"
+      {shows("actions") ? <KpiGroup id="actions-compliance-heading"
```
(fechar com `</KpiGroup> : null}`)
```diff
-      {metrics.competences ? <KpiGroup
+      {shows("competences") && metrics.competences ? <KpiGroup
```
```diff
-      {metrics.fireEquipment ? <KpiGroup
+      {shows("fireEquipment") && metrics.fireEquipment ? <KpiGroup
```

A ordem dos blocos no ficheiro não muda — só as condições. É isso que mantém a asserção de
ordem DOM do teste existente (`exposure` antes de `actions`) a passar.

- [ ] **Passo 4: Correr os testes e confirmar que passam**

```bash
npx vitest run tests/unit/safety-dashboard-kpi-composition.test.ts tests/unit/safety-dashboard-kpi-groups.test.ts tests/unit/safety-dashboard-kpi-layout.test.ts
```

Esperado: PASSA nos três. `safety-dashboard-kpi-groups.test.ts` continua sem uma única edição.

- [ ] **Passo 5: Commit**

```bash
git add components/feature/safety-dashboard-kpi-groups.tsx tests/unit/safety-dashboard-kpi-composition.test.ts
git commit -m "feat(dashboard): permitir compor grupos de KPIs por subconjunto"
```

---

### Task 3: Contador de dias sem acidentes adaptado ao contentor

O componente divide-se em duas metades a partir de `lg:` (viewport 1024px). Dentro de uma
coluna de 320px num ecrã de 1920px o `lg:` continua ativo e parte o layout. Passa a reagir ao
contentor.

**Ficheiros:**
- Modificar: `components/feature/safety-days-dashboard.tsx:44` e `:47`
- Criar: `tests/unit/safety-days-container-layout.test.ts`

**Interfaces:**
- Consome: nada
- Produz: nada (só classes CSS)

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/unit/safety-days-container-layout.test.ts`:

```ts
// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDaysSpotlight } from "@/components/feature/safety-days-dashboard";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;

const summary = {
  currentDays: 442,
  recordDays: 823,
  lastAccidentDate: "2025-07-02",
  recordSource: "historical" as const,
  historicalRecordStartDate: "2019-01-01",
};

function renderSpotlight() {
  return render(createElement(SafetyDaysSpotlight, {
    plantName: "Valença - MAAP",
    summary: summary as never,
    labels,
  }));
}

describe("SafetyDaysSpotlight em coluna estreita", () => {
  afterEach(cleanup);

  it("divide-se pelo contentor, não pelo viewport", () => {
    const { container } = renderSpotlight();
    expect(container.querySelector('[class*="@md:grid-cols"]')).toBeTruthy();
    expect(container.querySelector('[class*="lg:grid-cols"]')).toBeNull();
  });

  it("declara-se como contentor de consulta", () => {
    const { container } = renderSpotlight();
    expect(container.querySelector('[class*="@container"]')).toBeTruthy();
  });

  it("continua a mostrar os três números", () => {
    const { container } = renderSpotlight();
    expect(container.textContent).toContain("442");
    expect(container.textContent).toContain("823");
    expect(container.textContent).toContain("381");
  });
});
```

- [ ] **Passo 2: Correr o teste e confirmar que falha**

```bash
npx vitest run tests/unit/safety-days-container-layout.test.ts
```

Esperado: FALHA nos dois primeiros testes — hoje a classe é `lg:grid-cols-[...]` e não há
`@container`.

- [ ] **Passo 3: Implementar**

Em `components/feature/safety-days-dashboard.tsx`, linha 44 (a `<section>` externa) e 47
(a grelha interna):

```diff
-    <section className="overflow-hidden rounded-2xl border border-teal-100 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
-      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
+    <section className="@container overflow-hidden rounded-2xl border border-teal-100 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
+      <div className="grid gap-0 @md:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
```

Na mesma grelha, a metade esquerda tem `min-h-[280px]`, que numa coluna de 320px desperdiça
altura. Trocar por um mínimo que só se aplica quando há largura:

```diff
-        <div className="relative min-h-[280px] bg-[radial-gradient(...)] p-6 sm:p-8">
+        <div className="relative @md:min-h-[280px] bg-[radial-gradient(...)] p-6 @md:p-8">
```

(manter o valor do `bg-[radial-gradient(...)]` exatamente como está no ficheiro — só as
classes `min-h-` e `sm:p-8` mudam).

`@md` corresponde a 448px de contentor: numa coluna de 320px fica empilhado, a toda a largura
fica lado a lado como hoje.

- [ ] **Passo 4: Correr os testes e confirmar que passam**

```bash
npx vitest run tests/unit/safety-days-container-layout.test.ts
```

Esperado: PASSA nos três.

- [ ] **Passo 5: Commit**

```bash
git add components/feature/safety-days-dashboard.tsx tests/unit/safety-days-container-layout.test.ts
git commit -m "feat(dashboard): contador de dias sem acidentes adaptado ao contentor"
```

---

### Task 4: Pirâmide de comunicações adaptada ao contentor

Mesmo problema: a pirâmide separa a banda do painel de percentagens a partir de `md:`
(viewport 768px). Numa coluna de 320px isso dá duas colunas de ~150px, ilegíveis.

**Ficheiros:**
- Modificar: `components/feature/safety-communication-pyramid.tsx` (a `<article>` de cada
  camada e o rodapé de notas)
- Criar: `tests/unit/pyramid-container-layout.test.ts`

**Interfaces:**
- Consome: nada
- Produz: nada (só classes CSS)

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/unit/pyramid-container-layout.test.ts`:

```ts
// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";

const labels = {
  fatal: "Fatal", seriousInjury: "Serious injury", minorInjury: "Minor injury",
  firstAid: "First aid", nearMiss: "Near miss",
  unsafeCondition: "Unsafe condition", unsafeAct: "Unsafe act",
};

function renderPyramid() {
  return render(createElement(SafetyCommunicationPyramid, {
    title: "Safety communication pyramid",
    counts: { fatal: 0, seriousInjury: 0, minorInjury: 0, firstAid: 1, nearMiss: 0, unsafeCondition: 0, unsafeAct: 0 },
    locale: "en",
    scopeLabel: "Valença - MAAP",
    periodLabel: "2026-01-01 - 2026-12-31",
    classificationRule: "regra",
    hierarchyLabel: "hierarquia",
    emptyLabel: "sem dados",
    helpLabel: "Help",
    labels,
  } as never));
}

describe("SafetyCommunicationPyramid em coluna estreita", () => {
  afterEach(cleanup);

  it("divide banda e métricas pelo contentor, não pelo viewport", () => {
    const { container } = renderPyramid();
    expect(container.querySelector('[class*="@md:grid-cols"]')).toBeTruthy();
    expect(container.querySelector('[class*="md:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.22fr)]"]')).toBeNull();
  });

  it("continua a mostrar todas as camadas", () => {
    const { container } = renderPyramid();
    for (const key of ["fatal", "seriousInjury", "minorInjury", "firstAid", "nearMiss"]) {
      expect(container.querySelector(`[data-testid="pyramid-band-${key}"]`)).toBeTruthy();
    }
  });
});
```

- [ ] **Passo 2: Correr o teste e confirmar que falha**

```bash
npx vitest run tests/unit/pyramid-container-layout.test.ts
```

Esperado: FALHA no primeiro teste.

- [ ] **Passo 3: Implementar**

Em `components/feature/safety-communication-pyramid.tsx`:

1. Acrescentar `@container` à `AppCard` que envolve a pirâmide (o elemento de topo do
   `return`), mantendo as classes que já lá estão.

2. Na `<article>` de cada camada:

```diff
-                className="grid min-w-0 grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.22fr)] md:items-stretch md:gap-3"
+                className="grid min-w-0 grid-cols-1 gap-1.5 @md:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.22fr)] @md:items-stretch @md:gap-3"
```

3. Na `<div>` da banda:

```diff
-                    className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-l-4 px-3 py-1.5 shadow-[0_6px_16px_rgba(15,23,42,0.08)] [clip-path:polygon(3%_0%,97%_0%,100%_100%,0%_100%)] md:w-[var(--pyramid-layer-width)] md:px-4"
+                    className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-l-4 px-3 py-1.5 shadow-[0_6px_16px_rgba(15,23,42,0.08)] [clip-path:polygon(3%_0%,97%_0%,100%_100%,0%_100%)] @md:w-[var(--pyramid-layer-width)] @md:px-4"
```

4. Na `<div>` que envolve a banda:

```diff
-                <div className="flex min-w-0 justify-center px-[var(--pyramid-mobile-inset)] md:px-0">
+                <div className="flex min-w-0 justify-center px-[var(--pyramid-mobile-inset)] @md:px-0">
```

5. No rodapé de notas:

```diff
-      <div className="mt-2 grid gap-1 text-[10px] leading-4 text-slate-600 sm:grid-cols-2 sm:gap-4">
+      <div className="mt-2 grid gap-1 text-[10px] leading-4 text-slate-600 @sm:grid-cols-2 @sm:gap-4">
```

Numa coluna de 320px a pirâmide fica na forma que hoje se vê em telemóvel — bandas
centradas e empilhadas, com as percentagens por baixo de cada uma. É legível e é o
comportamento já testado em `safety-communication-pyramid.test.ts`.

- [ ] **Passo 4: Correr os testes e confirmar que passam**

```bash
npx vitest run tests/unit/pyramid-container-layout.test.ts tests/unit/safety-communication-pyramid.test.ts
```

Esperado: PASSA nos dois. O segundo tem de passar **sem edição**.

- [ ] **Passo 5: Commit**

```bash
git add components/feature/safety-communication-pyramid.tsx tests/unit/pyramid-container-layout.test.ts
git commit -m "feat(dashboard): pirâmide de comunicações adaptada ao contentor"
```

---

### Task 5: Invólucro de duas colunas na página

Junta tudo: a página passa a compor as duas colunas.

**Ficheiros:**
- Modificar: `app/(secure)/app/[plant]/dashboards/page.tsx` (região do `return`, de
  `<SafetyDaysSpotlight` até ao fecho de `<SafetyDashboardKpiGroups`)

**Interfaces:**
- Consome: `KpiGroupKey`, props `groups` e `testId` da Task 2; `@container` das Tasks 3 e 4
- Produz: nada (é a folha da árvore)

- [ ] **Passo 1: Substituir a região do render**

A região atual é, por esta ordem: `<SafetyDaysSpotlight ... />`,
`<SafetyCommunicationPyramid ... />`, `<SafetyDashboardKpiGroups ... />`.

Passa a:

```tsx
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex flex-col gap-5 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-6">
          <SafetyDaysSpotlight {/* props exatamente como estão hoje */} />

          <SafetyCommunicationPyramid {/* props exatamente como estão hoje */} />

          <SafetyDashboardKpiGroups
            {/* mesmas props de metrics/locale/labels que hoje */}
            groups={["exposure"]}
            testId="safety-kpi-context"
          />
        </div>

        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <SafetyDashboardKpiGroups
            {/* mesmas props de metrics/locale/labels que hoje */}
            groups={["outcomes", "sifPsif", "leading", "actions", "competences", "fireEquipment"]}
          />
        </div>
      </div>
```

Pontos que não podem falhar:

- A coluna de contexto é o **primeiro** filho. Abaixo de 1280px o contentor é `flex-col`,
  portanto ela aparece em cima — que é a ordem pretendida nessas larguras.
- `xl:col-start-2 xl:row-start-1` e `xl:col-start-1 xl:row-start-1` põem-nas lado a lado a
  partir de 1280px, com a de contexto à direita apesar de vir primeiro no HTML.
- `min-w-0` na coluna principal é obrigatório: sem ele uma tabela ou gráfico largo rebenta a
  grelha em vez de encolher.
- `xl:items-start` impede que a coluna de contexto estique até à altura da principal.
- O invólucro da coluna **não** leva `@container`: o contador (Task 3) e a pirâmide (Task 4)
  declaram-se como contentores próprios e medem-se a si mesmos. Acrescentar outro aqui só
  introduzia contenção de layout sem ninguém a consumi-la.
- Os blocos que ficam de fora deste `div` — o formulário de filtros acima, e o `<section>`
  dos Top 5 e o `<CorporatePlantManager>` abaixo — **não se tocam**. Continuam à largura toda.
- As props de cada componente copiam-se tal e qual do código atual. Nenhuma muda de valor.

- [ ] **Passo 2: Verificar tipos e lint**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "^(app|components|lib)/"
npx eslint "app/(secure)/app/[plant]/dashboards/page.tsx" components/feature/safety-dashboard-kpi-groups.tsx
```

Esperado: nenhuma linha de saída em qualquer dos dois. (Os erros de `tsc` em `tests/` são
anteriores a este trabalho e não contam.)

- [ ] **Passo 3: Correr toda a bateria de testes unitários**

```bash
npm run test:unit
```

Esperado: tudo verde. Se `safety-dashboard-kpi-groups.test.ts` falhar, parar — a API quebrou.

- [ ] **Passo 4: Commit**

```bash
git add "app/(secure)/app/[plant]/dashboards/page.tsx"
git commit -m "feat(dashboard): duas colunas com coluna de contexto em ecrã largo"
```

---

### Task 6: Verificação visual

Nenhum teste automático diz se o dashboard ficou mais legível. Esta tarefa é obrigatória e
não se pode declarar o trabalho concluído sem ela.

**Ficheiros:** nenhum (verificação)

- [ ] **Passo 1: Arrancar a aplicação**

```bash
npm run dev
```

Abrir `/app/<planta>/dashboards` numa planta com dados.

- [ ] **Passo 2: Verificar a 1920px**

- Três secções de indicadores acima da dobra (hoje: nenhuma)
- 5 cartões por linha nas grelhas de KPIs
- Coluna de contexto fixa ao fazer scroll, sem sobrepor o cabeçalho
- Contador e pirâmide legíveis a 320px de largura

- [ ] **Passo 3: Verificar a 1440px e 1280px**

- Duas colunas, 3 e 2 cartões por linha respetivamente
- Nada sobreposto nem cortado
- O menu lateral da planta continua fixo e legível

- [ ] **Passo 4: Verificar a 1024px e abaixo de 768px**

- Coluna única; contador, pirâmide e exposição em cima, grupos por baixo
- Abaixo de 768px, idêntico ao atual

- [ ] **Passo 5: Verificar o caso sem dados**

Abrir o dashboard numa planta sem eventos no período. A coluna de contexto não pode ficar
muito mais alta que a principal nem deixar um buraco branco.

- [ ] **Passo 6: Commit final**

Só se algum ajuste for preciso nos passos anteriores. Caso contrário nada a commitar.

---

## Revisão do plano contra a spec

| Requisito da spec | Tarefa |
|---|---|
| Grelhas fluidas `auto-fill minmax(240px,1fr)` | 1 |
| Prop `groups` + `testId`, API pública intacta | 2 |
| Container query no contador | 3 |
| Container query na pirâmide | 4 |
| Duas colunas a partir de 1280px, contexto 320px sticky | 5 |
| Coluna de contexto primeiro no DOM | 5, Passo 1 |
| Filtros e zona de análise à largura toda | 5, Passo 1 |
| Teste existente passa sem edição | 1, 2, 5 (verificado em cada) |
| Verificação visual a cinco larguras | 6 |
| Risco: sticky aninhado | 6, Passo 2 |
| Risco: pirâmide a 320px | 4 e 6, Passo 2 |
| Risco: coluna de contexto mais alta | 6, Passo 5 |
