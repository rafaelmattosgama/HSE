# MA HSE MVP (Multi-Plant EHS)

MVP EHS com foco em Saude e Seguranca do Trabalho para organizacao multi-planta.
Stack: Next.js App Router + TypeScript, Prisma + PostgreSQL, NextAuth, BullMQ + Redis, MinIO (S3), SMTP (Mailpit), Tailwind + UI components, next-intl, Vitest + Playwright.

## Principais capacidades entregues

- Comunicacoes: Unsafe Act, Unsafe Condition, Near Miss, First Aid, Accident.
- Validacao N3 para entrada em KPI.
- Plano de Acoes (CAPA) com SLA por prioridade e evidencia obrigatoria para fechamento.
- Dashboards por data do evento considerando apenas comunicacoes validadas.
- S-EWO com RCA, catalogo de causas versionado e aprovacao N2.
- Rotas publicas por QR token fixo por planta:
  - `GET /r/[plantCode]/report?t=TOKEN`
  - `POST /r/[plantCode]/report?t=TOKEN`
  - `GET /r/[plantCode]/kiosk?t=TOKEN`
- Notificacoes (dashboard + email) e estrutura de jobs agendados (digest, relatorios, overdue, alertas repetitivos).
- Auditoria detalhada de entidades criticas.
- Gestao de usuarios por planta:
  - N1 cria N1/N2/N3.
  - N3 cria N4/N5/MEDICO na propria planta.
  - Se senha nao for informada no cadastro: sistema gera senha temporaria, envia por e-mail e exige troca no primeiro login.

## Decisao BullMQ vs pg-boss

Foi escolhido **BullMQ + Redis** porque:

- facilita retry/backoff e processamento concorrente de filas;
- simplifica jobs recorrentes por timezone de planta;
- atende melhor os cenarios de escalonamento e notificacao do MVP.

## Estrutura

```text
app/
  (auth)/login
  (secure)/app/[plant]/*
  (secure)/app/corporate
  (public)/r/[plantCode]/report
  (public)/r/[plantCode]/kiosk
  api/*
prisma/
  schema.prisma
  migrations/
  seed.ts
jobs/
  queues.ts
  worker.ts
  scheduler.ts
  handlers/*
lib/
  auth, rbac, services, validation, rate-limit, i18n
messages/
  pt/it/en/pl/de/ro/fr
tests/
  unit
  e2e
```

## Requisitos

- Node.js 22+
- Docker Desktop
- npm

## Setup local

1. Instalar dependencias:

```bash
npm install
```

2. Copiar env:

```bash
cp .env.example .env
```

3. Subir infraestrutura local:

```bash
docker compose up -d
```

Servicos:

- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailpit SMTP: `localhost:1025`
- Mailpit UI: `http://localhost:8025`

4. Aplicar migrations e seed:

```bash
npm run db:migrate
npm run db:seed
```

5. Rodar app + worker (recomendado):

```bash
npm run dev:all
```

`dev:all` executa:
- scheduler (uma vez, para registrar jobs recorrentes),
- app Next.js em porta livre entre `3000-3020`,
- worker BullMQ em paralelo.

Se preferir, rode apenas o app:

```bash
npm run dev
```

Ou rode tudo em terminais separados:

```bash
npm run scheduler:dev
npm run worker:dev
npm run dev -- --port 3000
```

## Scripts

- `npm run dev` - app em desenvolvimento (porta 3000 por default)
- `npm run dev:all` - scheduler + app (porta livre) + worker
- `npm run build` - build de producao
- `npm run start` - servidor de producao
- `npm run lint` - lint
- `npm run db:generate` - prisma generate
- `npm run db:migrate` - prisma migrate dev
- `npm run db:seed` - seed
- `npm run db:studio` - prisma studio
- `npm run worker:dev` - workers BullMQ
- `npm run scheduler:dev` - agenda jobs recorrentes
- `npm run test:unit` - Vitest
- `npm run test:e2e` - Playwright smoke

## Usuarios seed

Senha padrao: valor de `SEED_DEFAULT_PASSWORD` (default `ChangeMe123!`).

- `corporate@ma-hse.local` (N1, cross-plant)
- `manager.pl01@ma-hse.local` (N2, PL01)
- `manager.pl02@ma-hse.local` (N2, PL02)
- `safety.pl01@ma-hse.local` (N3, PL01)
- `safety.pl02@ma-hse.local` (N3, PL02)
- `supervisor.pl01@ma-hse.local` (N4, PL01)
- `supervisor.pl02@ma-hse.local` (N4, PL02)
- `operator.pl01@ma-hse.local` (N5, PL01)
- `operator.pl02@ma-hse.local` (N5, PL02)
- `doctor.pl01@ma-hse.local` (MEDICO, PL01)
- `doctor.pl02@ma-hse.local` (MEDICO, PL02)
- N6 nao usa login/email no MVP; acesso por QR token (`/r/*`).

### Provisionamento de senha para novos usuarios

- Cadastro com senha informada:
  - usuario recebe essa senha e `forcePasswordChange=false`.
- Cadastro sem senha:
  - para usuario novo (ou sem hash anterior), o sistema gera senha temporaria;
  - tenta enviar por e-mail via SMTP/Mailpit;
  - marca `forcePasswordChange=true`;
  - bloqueia acesso ao `/app/*` ate concluir troca em `/change-password`.
- Se o envio SMTP falhar, a API retorna a senha temporaria para compartilhamento manual seguro.

## Tokens QR seed (texto puro para teste)

- `pl01-report-seed-token`
- `pl01-kiosk-seed-token`
- `pl02-report-seed-token`
- `pl02-kiosk-seed-token`

Uso:

- `http://localhost:<porta>/r/pl01/report?t=pl01-report-seed-token`
- `http://localhost:<porta>/r/pl01/kiosk?t=pl01-kiosk-seed-token`

Quando usar `npm run dev:all`, veja a porta no log:
- `[dev:all] APP_URL=http://localhost:300X`

No banco os tokens sao salvos **somente como hash** (`sha256(token + pepper)`).

### QR Token Manager (Admin)

Na tela `Plant Admin`, o bloco `QR Token Manager` agora:

- regenera token `REPORT` ou `KIOSK` (revogando o token ativo anterior do mesmo tipo);
- mostra o **link publico completo** ja montado;
- renderiza o **QR Code** correspondente;
- permite:
  - abrir o link;
  - copiar o link;
  - salvar QR como imagem (`.png`);
  - imprimir QR.

## RBAC implementado (estado atual do codigo)

- N1 Corporate:
  - Acesso total em todos endpoints por planta (bypass corporate no guard).
  - Aprova S-EWO, valida comunicacoes, fecha/reabre comunicacao/acao.
  - Cria e vincula usuarios N1/N2/N3 por planta.
- N2 Plant Manager:
  - Le/Cria comunicacoes e acoes na planta.
  - Le/Cria S-EWO e aprova S-EWO (`/sewo/[id]/approval`).
  - Reabre comunicacao/acao.
  - Nao altera parametros admin (SLA, alert rules, QR, recipients, master data).
- N3 Safety:
  - Le/Cria comunicacoes e acoes na planta.
  - Valida comunicacao (`/communications/[id]/validate`).
  - Fecha comunicacao manualmente (`/communications/[id]/manual-close`).
  - Reabre comunicacao/acao.
  - Admin da planta: master data, recipients, SLA, alert rules, QR tokens.
  - Cria e vincula usuarios N4/N5/MEDICO na propria planta.
  - Le/Cria S-EWO (sem aprovacao final N2).
- N4 Supervisor:
  - Le/Cria comunicacoes e acoes; fecha acao com evidencia.
  - Le lista de S-EWO.
  - Nao valida comunicacao, nao aprova S-EWO, nao reabre acao/comunicacao.
- N5 Operator:
  - Le/Cria comunicacoes e acoes; fecha acao com evidencia.
  - Nao acessa S-EWO API, nem validacao/admin.
- N6 QR Reporter:
  - Sem sessao/login.
  - Acesso apenas por token fixo em `/r/[plantCode]/report` e `/r/[plantCode]/kiosk`.
  - Pode submeter apenas `UNSAFE_ACT`, `UNSAFE_CONDITION`, `NEAR_MISS`.
- MEDICO:
  - Le comunicacoes (incluindo campos clinicos).
  - Nao cria comunicacao/acao e nao acessa admin/S-EWO mutacoes.

Observacao importante:
- As paginas server-rendered em `/app/[plant]/*` hoje validam autenticacao + escopo de planta no layout.
- As restricoes finas por role estao principalmente nos Route Handlers (`/api/plants/*`).

## Regras de negocio chave implementadas

- Todos os registros operacionais com `plantId`.
- KPI conta apenas comunicacoes em `VALID_OPEN`, `ONGOING`, `CLOSED`.
- Validacao N3 atualiza estado e audita diff.
- Fechamento manual de comunicacao por N1/N3 com motivo e auditoria.
- Reabertura por N1/N2/N3.
- Fechamento de acao exige comentario + evidencia.
- Acoes abertas vinculadas podem colocar comunicacao em `ONGOING`.

## Observabilidade e seguranca

- Logger estruturado com `pino`.
- Health endpoints:
  - `GET /api/health/live`
  - `GET /api/health/ready` (DB + Redis + S3)
- Validacao de payload com `zod`.
- Rate limit em rotas `/r/*` por IP+planta.
- Sessao protegida com NextAuth + adapter Prisma.

## Testes

- Unit (Vitest): auth config, RBAC, regras de workflow, hashing token, regra N6.
- E2E smoke (Playwright): login screen e fluxo publico `/r/.../report`.

## Observacoes

- O modulo de Ambiente nao esta incluÃ­do neste MVP inicial.
- Integracoes com RH nao foram implementadas (input manual).
- O endpoint publico `GET /r/...` retorna HTML de uso direto no navegador com `POST` no mesmo path para submissao.
