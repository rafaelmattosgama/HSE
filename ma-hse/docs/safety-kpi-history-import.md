# Importação de KPI históricos de Segurança

## Objetivo e fonte canónica

`SafetyKpiHistory` guarda totais mensais históricos por planta. A chave canónica é `plantId + year + month`, protegida por uma restrição única na base de dados.

O dashboard resolve cada mês como uma unidade completa:

1. se existir informação live em `PlantMonthlyInput` ou em comunicações válidas para a planta/mês, usa a informação live;
2. na ausência de informação live, usa `SafetyKpiHistory`;
3. nunca soma as duas fontes para a mesma planta/mês.

Os dashboards de planta e do grupo somam horas, acidentes, dias perdidos e restantes contagens. As taxas são sempre recalculadas a partir dos totais agregados:

- `Frequency Rate = Accidents / Hours Worked × 1 000 000`;
- `Gravity Rate = Lost Days / Hours Worked × 1 000 000`.

As taxas existentes no Excel são preservadas apenas para comparação e auditoria. Não são a fonte das taxas apresentadas.

## Ficheiro suportado

O primeiro template suportado é um `.xlsx`, com máximo de 10 MB e uma folha chamada `KPI_Import`.

Cabeçalhos obrigatórios:

`Plant`, `Year`, `Month`, `Hours Worked`, `Employees`, `Accidents`, `Lost Days`, `Serious Injury`, `Minor Injury`, `First Aids`, `Near Miss`, `Unsafe Condition`, `Unsafe Act`, `Frequency Rate (Source)`, `Gravity Rate (Source)` e `Source`.

O cabeçalho `Notes` é opcional. A leitura ignora maiúsculas/minúsculas, espaços nas extremidades e espaços repetidos. Linhas vazias são ignoradas. Valores numéricos podem ser números Excel ou texto numérico.

`Plant` é associado ao código da planta sem distinguir maiúsculas de minúsculas. `Year` e `Month` são inteiros; o mês deve estar entre 1 e 12. Horas e dias perdidos aceitam decimal não negativo. Empregados e todas as contagens aceitam apenas inteiros não negativos. Um mês com acidentes ou dias perdidos não pode ter zero horas.

## Fluxo de importação

Em **Admin > Importar KPI históricos**:

1. selecionar o ficheiro;
2. usar **Pré-visualizar**;
3. rever o resumo e cada linha;
4. selecionar a estratégia de conflito disponível;
5. usar **Confirmar importação**.

A pré-visualização cria o lote e as linhas de auditoria, mas não escreve registos em `SafetyKpiHistory`. Cada linha recebe um estado:

- `NEW`: válida e ainda inexistente;
- `EXISTS_DB`: já existe a mesma planta/ano/mês;
- `DUPLICATE_FILE`: a chave aparece mais de uma vez no ficheiro;
- `INVALID`: erro de estrutura, valor, planta ou permissão.

`SKIP` ignora registos existentes. `REPLACE` substitui-os e está limitado a N0/N1. Duplicados dentro do ficheiro e linhas inválidas nunca são importados. O commit volta a verificar plantas, permissões e conflitos dentro de uma transação. Um segundo commit do mesmo lote devolve o resultado anterior e não cria duplicados.

O lote guarda hash SHA-256, nome original, utilizador, planta quando o lote abrange uma só planta, contagens, timestamps, metadados e resultado por linha. Nesta versão o Excel original não é guardado no MinIO; o hash e o conteúdo normalizado de cada linha asseguram rastreabilidade sem duplicar ficheiros potencialmente sensíveis.

## Permissões

- N0 e N1 podem importar para qualquer planta e usar `REPLACE`;
- N3 pode importar apenas para as plantas a que está associado e apenas com `SKIP`;
- utilizadores sem estes perfis não veem o importador no Admin e as linhas sem autorização falham na pré-validação/commit.

## API

- `POST /api/safety-kpi-history/import/preview` — multipart com o campo `file`;
- `POST /api/safety-kpi-history/import/commit` — JSON `{ "batchId": "...", "conflictStrategy": "SKIP" | "REPLACE" }`;
- `GET /api/safety-kpi-history/import/batches` — últimos lotes visíveis ao utilizador;
- `GET /api/safety-kpi-history/import/batches/:batchId` — detalhe auditável do lote;
- `GET /api/plants/:plantCode/safety-kpis?year=2026&compareTo=2025` — meses canónicos, agregado anual e comparação homóloga.

Todas as rotas exigem sessão. As rotas respeitam RBAC por planta e devolvem o envelope JSON padrão da aplicação.

## Operação e deploy

A alteração de esquema está em `prisma/migrations/20261007150000_add_safety_kpi_history/migration.sql`. No deploy normal, executar `prisma migrate deploy` antes de disponibilizar a nova versão da aplicação.

Validação recomendada:

```powershell
npx.cmd prisma validate
npx.cmd vitest run tests/unit/safety-kpi-history-excel.test.ts tests/unit/safety-kpi-history-validation.test.ts tests/unit/safety-kpi-history-aggregation.test.ts tests/unit/safety-kpi-history-rbac.test.ts tests/unit/safety-kpi-history-service.test.ts tests/unit/group-safety-dashboard.test.ts
npm.cmd run build
```

Depois do deploy, importar primeiro um ficheiro pequeno em pré-visualização, confirmar que nenhuma linha foi escrita antes do commit, concluir o lote e comparar o ano no dashboard da planta e no dashboard de grupo. O teste automatizado de aceitação gera 53 linhas equivalentes a 2022–maio de 2026 e verifica todos os totais de controlo e as taxas recalculadas.
