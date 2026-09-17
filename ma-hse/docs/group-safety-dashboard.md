# Dashboard de Segurança — KPI de Grupo

## Implementação e análise de origem

Rota: `/app/corporate`. Segurança continua a área inicial; Ambiente usa `area=environment`.

A página anterior executava queries Prisma e cálculos diretamente em `page.tsx`. Usava `CorporatePlantManager` (cartões de fábricas, favoritos, rankings e `DashboardVisualizationStudio`), `GroupSafetyDaysBoard`, `RootCauseTopFiveCard`, `CommunicationPyramid`, `CorporateActionPlans` e `RepeatabilityAlertEditor`. O serviço `KpiService.getMonthlyKpis` existe para consultas mensais por fábrica, mas não era a fonte da página corporativa nem cobre intervalos, histórico e comparação homóloga.

A implementação nova mantém uma única fonte: `getGroupSafetyDashboard` faz as leituras autorizadas e `buildGroupSafetyPlant` transforma os registos em resumos serializáveis, sem nomes de trabalhadores ou descrições de ocorrências. `summarizeGroupSafety` agrega os mesmos resumos para Grupo ou uma fábrica. Todas as fórmulas de índices passam por `calculateSafetyRates`. As três vistas consomem este mesmo resultado, memorizado por âmbito. Não existem três endpoints nem três conjuntos de queries.

Os componentes antigos e respetivos endpoints não foram apagados. A nova página deixa de apresentar os favoritos e a grelha de fábricas. O editor de repetibilidade existente mantém-se recolhido no controlo operacional, apenas para N0/N1. Os gráficos novos suportam valores nulos sem os converter visualmente em zero e têm tabelas alternativas acessíveis. A pirâmide reutiliza **SafetyCommunicationPyramid**, incluindo cores, larguras fixas, níveis, contagens e percentagens da versão atual do dashboard de fábrica.

## Navegação, filtros e âmbito

- `view=executive|operational|risk`. Sem valor válido, abre Resumo executivo e normaliza o URL por History API.
- `plant=group` ou código de fábrica. Grupo é a seleção inicial. Um código indisponível apresenta mensagem e nenhum KPI; não muda silenciosamente para outro âmbito.
- Ano, mês e intervalo usam `resolveDashboardPeriod`, como anteriormente. Um intervalo completo tem prioridade sobre ano/mês.
- Troca de vista/âmbito usa `history.pushState` integrado com `useSearchParams`, sem fetch nem navegação RSC. A memória de cálculo não depende da vista.
- Aplicar filtros, limpar datas, ano atual, ligações entre áreas e histórico do navegador preservam vista e âmbito.
- O seletor de fábrica permite pesquisa por nome, navegação por teclado e fecho por Escape. Em mobile, a vista usa um `select` com etiqueta.
- Não se guardou a vista em localStorage: os mecanismos encontrados guardavam preferências por dashboard, **não por utilizador**. O pedido condiciona essa persistência à existência de mecanismo seguro por utilizador; mantém-se o URL como fonte de verdade.
- O detalhe da fábrica preserva o período; as ações usam o endpoint/página existente.

## Permissões

O layout autenticado e a página exigem sessão. As queries de fábricas, histórico e parâmetros usam o mesmo âmbito, calculado com `hasSafetyDashboardAccess`:

- N0/N1: âmbito global, como definido pelo avaliador existente.
- N2/N3/N4: mesmas vistas e indicadores, limitados às fábricas atribuídas e autorizadas. Suporta atribuições múltiplas.
- Os outros perfis mantêm a elegibilidade de leitura já definida no verificador de dashboards; não se criaram permissões de escrita.
- O link Group KPI no menu foi disponibilizado também a N4, sem mudar as permissões dos módulos operacionais.

A query corporativa anterior não aplicava filtro de fábrica. A nova fronteira aplica a autorização existente antes da leitura e serialização, em vez de confiar no parâmetro `plant` ou apenas ocultar dados na interface. Não foram alteradas atribuições de utilizadores, roles, endpoints de escrita nem configurações.

## Definições efetivas dos KPI

**Fator mantido: 1 000 000.** Era uma constante da página corporativa e do dashboard de fábrica; não foi identificada uma configuração de fator ou meta associada a estes indicadores.

| Indicador | Fonte e elegibilidade | Fórmula / denominador |
| --- | --- | --- |
| IF acidentes | `Communication.type=ACCIDENT`, estados VALID_OPEN, ONGOING ou CLOSED; `eventDatetime` no período | Acidentes totais ÷ horas positivas totais × 1 000 000 |
| Índice de gravidade | Soma de `Communication.lostDays` nos mesmos estados e período, preservando a soma anterior sobre comunicações elegíveis e o valor do fluxo de baixas | Dias perdidos totais ÷ horas positivas totais × 1 000 000 |
| IF primeiros socorros | `Communication.type=FIRST_AID`, mesmos estados e data de evento | Primeiros socorros totais ÷ horas positivas totais × 1 000 000 |
| IF quase acidentes | `Communication.type=NEAR_MISS`, mesmos estados e data de evento | Quase acidentes totais ÷ horas positivas totais × 1 000 000 |
| Número de acidentes / quase acidentes / primeiros socorros | Comunicações únicas da respetiva tipologia nos estados elegíveis | Contagem, sem denominador |
| Horas trabalhadas | `SafetyKpiMonthlyInput.hoursWorked`, ano/mês intersectados pelo período | Soma de valores finitos positivos; nunca média entre fábricas |
| Dias sem acidentes | Histórico elegível de ACCIDENT + `SAFETY_DAYS_CONFIG.manualLastAccidentDate` válido e não futuro | Dias UTC desde o último acidente de qualquer fábrica do âmbito até à data da consulta |
| Record do Grupo | União cronológica dos acidentes das fábricas do âmbito, incluindo datas manuais válidas | Maior intervalo sem acidentes no período de observação comum; reutiliza a convenção de dias de `buildSafetyDaysSummary` |
| Maior record individual | `buildSafetyDaysSummary` por fábrica, incluindo `historicalRecordDays` existente | Máximo dos records individuais, apresentado separadamente do record conjunto |
| Causas-raiz de quase acidentes | S-EWO por `analysisDate`, ligado a comunicação NEAR_MISS; `getSewoRootCauseLabels` | Contagem de classificações com nome; percentagem sobre todas as classificações com nome nesta categoria |
| Causas-raiz de acidentes/primeiros socorros | S-EWO ligado a ACCIDENT ou FIRST_AID; mesma regra de análise | Mesmo denominador de classificações; uma análise pode contribuir várias causas |
| Top 5 atos inseguros / tipos de quase acidente | Comunicações elegíveis UNSAFE_ACT / NEAR_MISS; relações `unsafeActType` / `nearMissType` | Contagem de eventos únicos por tipo; percentagem sobre todos os eventos elegíveis dessa tipologia, incluindo não classificados |
| Pirâmide | Estados SUBMITTED, PENDING_VALIDATION, VALID_OPEN, ONGOING, CLOSED; data do evento, ou data de comunicação para registos em validação | Contagens por taxonomia existente; percentagens sobre a soma apresentada nos sete níveis. Largura dos níveis não representa volume |
| Prioridades operacionais | `Action` em OPEN/ONGOING, dentro das fábricas autorizadas | Atrasadas por `dueDate` anterior à consulta; prioridade alta por HIGH. Pendências atuais, independentes do período dos eventos |

A pirâmide conserva os níveis de acidentes MINOR, SERIOUS e FATAL. Acidentes sem classificação compatível são assinalados separadamente, sem inventar uma nova classificação.

As análises S-EWO conservam o filtro de data e regras de estado da consulta corporativa anterior. A separação de causas usa a tipologia da comunicação associada; análises sem ligação ou de outra tipologia são contabilizadas numa nota de cobertura, não adivinhadas pelo texto livre. Os helpers existentes escolhem entre detalhes do template e seleções estruturadas sem somar ambas as representações.

## Comparação homóloga, rankings e histórico

O período homólogo aplica o deslocamento UTC de um ano já usado na página. Recolhem-se eventos e horas desse período para todos os quatro índices. As contagens só mostram comparação quando existem eventos ou horas no período anterior. Se o valor anterior for zero, a variação é absoluta e identificada; não se divide por zero. Aumento de quase acidentes é descrito de forma neutra, porque também pode refletir maior comunicação.

Rankings de IF excluem fábricas sem horas positivas. Rankings de contagens incluem todas as fábricas do âmbito, incluindo zero registos elegíveis. Empates são ordenados por nome; os extremos não implicam que o máximo/mínimo seja exclusivo.

O início da observação comum é a mais recente das referências iniciais por fábrica (criação ou primeira data de acidente conhecida). Antes dessa data não se presume cobertura de todas as fábricas. Records históricos manuais individuais não são usados como record do Grupo por falta de uma sequência conjunta comprovável. Se o âmbito tiver apenas uma fábrica, aplica-se o resumo individual existente, incluindo o record manual. A referência histórica é mostrada quando disponível.

## Dados incompletos e apresentação

- Sem denominador positivo: índice nulo, apresentado como **Sem dados**, nunca zero; fábrica excluída apenas do ranking de índices.
- Com algumas horas em falta: usa-se o numerador total e as horas positivas disponíveis, com aviso de possível incompletude e identificação das fábricas. Não se elimina silenciosamente o numerador dessas fábricas.
- O aviso de cobertura considera meses selecionados até ao mês da consulta; meses futuros não geram ausência de reporte. As tendências não mostram meses futuros e assinalam o mês atual como parcial.
- Intervalos parciais continuam a usar horas dos meses completos, sem criar um rateio diário inexistente.
- Ausência de eventos elegíveis significa contagem zero; não existe na aplicação uma certificação de que o reporte de eventos de cada fábrica está completo.
- Sem acidente conhecido: o contador usa o início da observação comum, com explicação. Sem fábricas: não apresenta KPI numéricos.
- Sem comparável homólogo: mostra aviso; sem meta: não inventa um objetivo nem declara cumprimento.
- Cada KPI mostra unidade, período, consulta e atualização das fontes quando disponível. Os contadores históricos são explicitamente atuais, não limitados ao filtro.
- PT/EN têm os novos textos completos; a navegação e âmbito estão traduzidos nas sete línguas. As restantes explicações seguem o fallback inglês já existente no dicionário.
- Existem estados de loading e erro na rota. Os gráficos incluem tabelas e estilos de traço; os estados não dependem apenas da cor.

## Ficheiros desta alteração

- `app/(secure)/app/corporate/page.tsx`
- `app/(secure)/app/corporate/loading.tsx`
- `app/(secure)/app/corporate/error.tsx`
- `app/(secure)/app/[plant]/layout.tsx` (apenas link Group KPI para N4)
- `components/feature/group-safety-dashboard.tsx`
- `lib/group-safety-dashboard.ts`
- `lib/services/group-safety-dashboard-service.ts`
- `lib/group-safety-ui.ts`
- `lib/ui-language.ts`
- `tests/unit/group-safety-dashboard.test.ts`
- `tests/unit/group-safety-dashboard-service.test.ts`
- `tests/unit/group-safety-dashboard-navigation.test.ts`
- `tests/unit/group-safety-dashboard-route.test.ts`
- `docs/group-safety-dashboard.md`

Não são parte desta alteração as remoções de componentes de competências/incêndio e as alterações de comunicação rápida que já existiam no workspace.

## Validação e reversão

Os testes cobrem agregação ponderada, estados elegíveis, horas nulas, ranking, intervalo parcial, comparação homóloga, classificações múltiplas, record conjunto versus individual, baseline manual, Grupo/fábrica, URLs, preservação de filtros, seletor compacto, histórico, ausência de pedidos ao alternar, âmbito N2/N3/N4 e ramo Ambiente. Também se executam os testes existentes de dias sem acidentes, acesso, causas-raiz e pirâmide.

Resultados da validação desta alteração:

- Vitest: **61 testes passaram, em 9 ficheiros** (os quatro `group-safety-dashboard*.test.ts`, `safety-days.test.ts`, `safety-dashboard-access.test.ts`, `sewo-root-causes.test.ts`, `safety-communication-pyramid.test.ts` e `environment-dashboard-route.test.ts`).
- ESLint: passou em todos os ficheiros TypeScript/TSX alterados e novos desta tarefa, sem erros nem avisos.
- `git diff --check`: passou.
- `tsc --noEmit`: continua a falhar em **68 erros de tipagem em testes unitários preexistentes**, fora dos ficheiros desta alteração; não foram reportados erros nos novos componentes, serviço, transformação, testes ou página.
- A validação de interação foi feita com Testing Library/jsdom. Não foi possível fazer inspeção visual num navegador real: a ferramenta de UI não disponibiliza apps ou browsers nesta sessão. Não foi feito login nem alterado qualquer registo para obter uma sessão de teste.

Não foram executadas migrações, seed, inserts, updates ou deletes de dados. Nenhuma configuração foi gravada. A alteração está confinada à apresentação, leitura e transformação do dashboard, traduções, acesso ao link e testes; pode ser revertida por controlo de versões sem restaurar a base de dados.
