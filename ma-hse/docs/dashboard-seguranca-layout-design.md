# Dashboard de Segurança — redesenho do layout em ecrã largo

Spec de desenho. Decidida em sessão de brainstorming a 2026-09-17.
Âmbito: `/app/<planta>/dashboards`. Ambiente e Group KPI ficam para ciclos seguintes,
replicando o padrão que sair daqui.

## Problema

O dashboard tinha um limite de largura (`max-w-7xl`, 1280px) que deixava margens vazias
enormes em monitores de 1920px. Esse limite foi removido nas rotas de dashboard
(`components/layout/dashboard-width.tsx`, `lg:max-w-none`), mas o resultado não melhorou a
leitura: as grelhas de KPIs estão fixas em `xl:grid-cols-4`, por isso os mesmos quatro
cartões passaram a ocupar ~390px cada em vez de ~233px. Mais espaço branco dentro de cada
cartão, zero indicadores adicionais no ecrã.

O problema real não é a largura do contentor. É a combinação de:

1. grelhas com número de colunas fixo, que não reagem à largura disponível;
2. dois blocos de baixa densidade — o contador de dias sem acidentes (~340px de altura para
   um número) e a pirâmide de comunicações (~380px) — que empurram todos os indicadores de
   resultado para baixo da dobra.

## Objetivo

Um utilizador que abre o dashboard num monitor de 1920px vê os indicadores de resultado
(eventos validados, acidentes, IF, índice de gravidade, dias perdidos, primeiros socorros,
IF de primeiros socorros, % SIF/PSIF) **antes da dobra**, sem scroll.

### Critérios de sucesso

- A 1920px, pelo menos três secções completas de indicadores ficam acima da dobra
  (hoje: nenhuma).
- A 1920px, as grelhas de KPIs mostram 5 cartões por linha (hoje: 4).
- Nenhum indicador hoje visível deixa de existir ou passa a exigir interação para ser visto.
- Abaixo de 1024px o comportamento é idêntico ao atual.

## Decisões tomadas

| Decisão | Escolha | Nota |
|---|---|---|
| Prioridade da primeira vista | Indicadores de resultado | Dashboard de reporte e acompanhamento mensal, não de alerta operacional |
| Conteúdo | Nada sai, só reorganiza | Os ~25 cartões atuais mantêm-se todos visíveis |
| Layout | Duas colunas: resultados à esquerda, contexto à direita | |
| Coluna de contexto | Contador + pirâmide + exposição | Os três blocos de menor densidade |
| Limiar das duas colunas | 1280px (`xl`) | Ver "Compromisso aceite" |

### Compromisso aceite

A 1280–1440px a coluna de contexto **reduz** o número de cartões por linha, porque o menu
lateral da planta já consome 240px:

| Ecrã | Hoje | Depois |
|---|---|---|
| 1280 | 4 cartões de 233px | 2 cartões de 306px |
| 1366 | 4 de 254px | 2 de 349px |
| 1440 | 4 de 273px | 3 de 253px |
| 1920 | 4 de 390px | 5 de 245px |

Isto foi apresentado com os números acima e aceite: em portátil, ter o contador e a pirâmide
sempre à vista vale mais do que ter quatro cartões por linha. O ganho principal do redesenho
é vertical (~700px de conteúdo de baixa densidade saem do fluxo), não horizontal.

## Layout alvo

Largura de conteúdo = `largura do ecrã − 48 (margens) − 240 (menu da planta) − 24 (gap)`.

### ≥ 1280px — duas colunas

```
┌──────┬────────────────────────────────────┬──────────────┐
│ menu │ Filtros (largura total)            │              │
│ 240  ├────────────────────────────────────┼──────────────┤
│      │ Resultados        (5 por linha)    │  442 dias    │
│      │ Leading           (5 por linha)    │  Pirâmide    │
│      │ Ações             (5 por linha)    │  Exposição   │
│      │ Competências · Incêndio            │  ↑ sticky    │
├──────┴────────────────────────────────────┴──────────────┤
│ Top 5 causas · atos · condições · quase acidentes        │
└──────────────────────────────────────────────────────────┘
```

Coluna de contexto: 320px, `sticky` no topo. Filtros e a zona de análise (Top 5,
`CorporatePlantManager`) atravessam as duas colunas.

### 1024–1280px — coluna única

Contador como faixa fina no topo, depois pirâmide, exposição e os grupos de KPIs. As grelhas
continuam fluidas: a 1200px dá 3 cartões por linha, contra os 4 mais estreitos de hoje.

### < 1024px — inalterado

Comportamento atual, 2 cartões por linha.

## Estrutura de componentes

### Decomposição de `SafetyDashboardKpiGroups`

O componente renderiza hoje sete grupos empilhados num único `space-y-5`, o que impede pôr
um grupo isolado noutro sítio da página.

Só **um** grupo muda de sítio: Exposição. Extrair os sete para componentes separados seria
refactor grande sem retorno. Em vez disso, `SafetyDashboardKpiGroups` ganha uma prop
opcional de filtro:

```ts
type KpiGroupKey =
  | "outcomes" | "sifPsif" | "leading" | "exposure"
  | "actions" | "competences" | "fireEquipment";

groups?: KpiGroupKey[];   // omissão: todos, pela ordem atual
testId?: string;          // omissão: "safety-kpi-groups"
```

**A API pública não muda** — sem a prop, o componente renderiza exatamente o que renderiza
hoje. É isso que permite ao teste existente passar sem edição, incluindo a asserção de que
"Exposição" precede "Ações" no DOM.

A página compõe renderizando o componente duas vezes: na coluna principal com
`groups={["outcomes","sifPsif","leading","actions","competences","fireEquipment"]}`, na
coluna de contexto com `groups={["exposure"]}` e um `testId` próprio para não duplicar o
identificador.

### Ordem no DOM

A coluna de contexto é escrita **primeiro** no HTML, a principal a seguir.

- Abaixo de 1280px o contentor é `flex-col`: o contexto aparece em cima, os grupos por baixo —
  aproximadamente a ordem atual.
- A partir de 1280px, `xl:grid xl:grid-cols-[minmax(0,1fr)_320px]` com colocação explícita:
  contexto em `xl:col-start-2 xl:row-start-1`, principal em `xl:col-start-1 xl:row-start-1`.

Um só render, sem JavaScript e sem markup duplicado.

### Container queries

`SafetyDaysSpotlight` e `SafetyCommunicationPyramid` têm layouts internos presos a
breakpoints de *viewport* (`lg:grid-cols-[...]`). Dentro de uma coluna de 320px num ecrã de
1920px, `lg:` continua ativo e parte-os.

Correção: a coluna de contexto é marcada `@container` e os breakpoints internos destes dois
componentes passam de `lg:` para `@md:`. Passam a adaptar-se ao espaço que têm, não ao
tamanho do ecrã. O Tailwind v4 suporta isto de origem, sem plugin.

### Grelhas fluidas

Em `KpiGroup` e nas secções equivalentes:

```
- sm:grid-cols-2 xl:grid-cols-4
+ grid-cols-[repeat(auto-fill,minmax(240px,1fr))]
```

Dá 5 por linha a 1920px e degrada sozinho para 2–3 em portátil, sem breakpoints a manter.
O mínimo de 240px é a largura a que os cartões já são legíveis hoje a 1280px (233px).

## Ficheiros

| Ficheiro | Alteração |
|---|---|
| `app/(secure)/app/[plant]/dashboards/page.tsx` | invólucro de duas colunas, composição dos grupos |
| `components/feature/safety-dashboard-kpi-groups.tsx` | decomposição em grupos exportados, grelha fluida |
| `components/feature/safety-days-dashboard.tsx` | layout interno por container query |
| `components/feature/safety-communication-pyramid.tsx` | layout interno por container query |
| `components/layout/dashboard-width.tsx` | sem alteração — já fornece o `lg:max-w-none` |
| `tests/unit/safety-dashboard-kpi-groups.test.ts` | **sem alteração** (é a rede de segurança) |
| `tests/unit/safety-dashboard-kpi-composition.test.ts` | novo |

## Testes

Desenvolvimento por testes, com o padrão já usado no projeto: `vitest`, `// @vitest-environment jsdom`,
`@testing-library/react`.

1. `safety-dashboard-kpi-groups.test.ts` passa **sem qualquer edição**. Se exigir edição, a
   decomposição quebrou a API e está errada.
2. `safety-dashboard-kpi-composition.test.ts` (novo): cada grupo exportado renderiza os seus
   cartões isoladamente. É o que autoriza a página a colocá-los em colunas diferentes.
3. `safety-communication-pyramid.test.ts` passa sem edição.

### Limite conhecido

O `jsdom` não tem motor de layout: nenhum teste automático confirma que o dashboard ficou
mais legível. Os testes protegem o conteúdo (nada desapareceu, nada duplicou); o layout
verifica-se a olho.

**Verificação visual obrigatória** antes de dar o trabalho por concluído, na app a correr:

- 1920px — três secções de indicadores acima da dobra, 5 cartões por linha, coluna de
  contexto fixa no scroll
- 1440px — 3 cartões por linha, duas colunas, sem sobreposição
- 1280px — 2 cartões por linha, duas colunas, contador e pirâmide legíveis a 320px
- 1024px — coluna única, contador em faixa, ordem correta
- < 768px — idêntico ao atual

## Fora de âmbito

- Dashboard de Ambiente e Group KPI (ciclos seguintes, replicando este padrão)
- Remover, fundir ou acrescentar indicadores
- Alterar cálculos, consultas ou dados
- Redesenhar o `KpiCard` em si (tipografia, ícones, estados)

## Riscos

| Risco | Mitigação |
|---|---|
| `sticky` aninhado: o menu da planta já é `md:sticky` e a coluna de contexto passa a ser outro | Verificar na app; qualquer `overflow:hidden` num ascendente quebra o `sticky` |
| Pirâmide ilegível a 320px | Container query com fallback para versão vertical compacta; validar a 1280px |
| Coluna de contexto mais alta que a principal em plantas com poucos dados | `self-start` e conteúdo de altura natural; verificar com planta sem dados |
| Regressão de densidade a 1280px | Aceite explicitamente (ver "Compromisso aceite") |
