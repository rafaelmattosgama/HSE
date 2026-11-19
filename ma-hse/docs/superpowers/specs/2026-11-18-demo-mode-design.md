# Modo demo local: desenho

Data: 2026-11-18 · Estado: aprovado pelo utilizador em conversa (partes 1–3)

## 1. Objetivo

Um modo de demonstração do MAx Safety para:

- **Apresentação:** demonstrar o software numa call ou numa conferência.
- **Formação:** treinar novos utilizadores dos perfis Segurança (N3), Corporate (N1) e Admin (N0) com tarefas práticas.

A demo corre **localmente no portátil do responsável**, isolada da produção e dos dados de desenvolvimento. Os guiões estão em **português e inglês**.

Fora do âmbito, para já:

- pacote para outras pessoas correrem sem o ambiente de desenvolvimento;
- outras línguas;
- guiões para N2, N4, N5 e N6;
- demo dentro da produção.

O desenho deve permitir acrescentar estes pontos mais tarde sem refazer nada.

## 2. Execução e isolamento

- **`npm run demo`** (script `scripts/demo.mjs`):
  1. Arranca um compose próprio, `docker-compose.demo.yml`, com o projeto `ma-hse-demo`, volumes próprios e portas 5434 (postgres pgvector), 6381 (redis) e 9002/9003 (minio).
  2. Se a base de dados estiver vazia, aplica as migrações e corre a carga de dados de demonstração.
  3. Arranca a app (porta 3100) e o worker com o ficheiro `.env.demo`.
- **`.env.demo`:**
  - versionado sem segredos, só com valores locais;
  - `DEMO_MODE=true`, `DATABASE_URL` apontado para `ehs_demo` na porta 5434, `APP_URL=http://localhost:3100`;
  - `AGENT_ENABLED=true` e `AGENT_MOCK_MODE=true`;
  - `INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER=disabled` e `TRANSLATION_PROVIDER=disabled`;
  - sem `SMTP_GATEWAY_API_KEY`, `OPENAI_API_KEY` nem `ANTHROPIC_API_KEY`.
- **Guarda de segurança** (`lib/demo-mode.ts`, validada em `lib/env.ts`): com `DEMO_MODE=true`, a aplicação **não arranca** em nenhum destes casos:
  - `APP_ENV=production`;
  - o nome da base de dados em `DATABASE_URL` não é `ehs_demo`;
  - o host da base de dados não é local (`localhost`/`127.0.0.1`).
- **Efeitos de `DEMO_MODE`** (interruptores, sem alterar as regras de acesso):
  - **Faixa fixa "DEMONSTRAÇÃO – dados fictícios"** em todas as páginas autenticadas e no login.
  - **Envio de email:** `sendViaSmtpGateway` não envia e regista `demo_email_suppressed` (destinatário em hash, assunto). Resolve-se como sucesso, para os fluxos se comportarem como em produção.
  - **Página de login:** mostra a lista de contas demo e a password comum.
  - **Menu do utilizador:**
    - "Reiniciar demo";
    - "Iniciar apresentação" e "Iniciar formação", que relançam o guião.

## 3. Dados de demonstração

- **Script:** `prisma/demo-seed.ts`, determinístico. Os IDs são estáveis, com o `stableUuid` já existente em `seed.ts`. **Todas as datas são relativas à data em que o script corre**, por isso os dados estão sempre "frescos".
- **Duas fábricas:**
  - "Demo Lisboa" (`demo-lis`);
  - "Demo Porto" (`demo-opo`).

  Ambas com fuso Europe/Lisbon e língua pt.
- **Master data por fábrica:**
  - áreas;
  - linhas, postos e equipamentos;
  - departamentos;
  - trabalhadores fictícios (nomes inventados);
  - tipos de catálogo.
- **Cerca de 12 meses de histórico por fábrica:**
  - comunicações de todos os tipos e estados (o volume deve dar uma pirâmide credível);
  - ações abertas, fechadas e em atraso;
  - S-EWO em DRAFT, IN_APPROVAL, APPROVED e CLOSED;
  - competências e autorizações (válidas, a expirar e expiradas);
  - extintores com inspeções (em dia e em atraso);
  - histórico de KPI mensal;
  - 3–5 registos aprovados na base de conhecimento, sem PDF real.
- **Anexos:**
  - algumas imagens e PDFs em `demo/assets/`, versionados e sem dados reais;
  - são carregados no minio da demo.
- **Utilizadores** (password comum `Demo2026!`, só local):

  | Utilizador | Perfil | Guião |
  |---|---|---|
  | `demo.apresentacao@maxsafety.demo` | N1 | Apresentação |
  | `demo.admin@maxsafety.demo` | N0 | Formação Admin |
  | `demo.corporate@maxsafety.demo` | N1 | Formação Corporate |
  | `demo.seguranca@maxsafety.demo` | N3, Demo Lisboa | Formação Segurança |

  Todos com `mustChangePassword=false`.
- **Reiniciar** (`npm run demo:reset`, e o botão do menu através de `POST /api/demo/reset`):
  1. `TRUNCATE` de todas as tabelas públicas, exceto `_prisma_migrations`, com `RESTART IDENTITY CASCADE`;
  2. `FLUSHALL` no redis da demo;
  3. limpeza do bucket da demo;
  4. novo `demo-seed`.
  - Alvo: menos de 30 s.
  - A rota só existe com `DEMO_MODE` (devolve 404 nos outros casos) e passa pela guarda da secção 2.
  - Depois do reinício, a sessão volta ao login.

## 4. Guiões

- **Motor:** é o existente (`components/onboarding/*`, `driver.js`), com três extensões.
  1. **Passo de tarefa:** `OnboardingStep` ganha `completeWhen?: { route?: string (padrão com *), element?: string (seletor que tem de aparecer) }`.
     - O botão "Seguinte" fica desativado até a condição se verificar.
     - O progresso avança automaticamente quando a condição se cumpre.
     - Há um botão "Saltar tarefa".
  2. **Guiões nomeados:** além do guião por perfil (FIRST_LOGIN), o `onboarding-config.ts` passa a ter guiões identificados:
     - `demo-presentation`;
     - `demo-training-n3`;
     - `demo-training-n1`;
     - `demo-training-n0`.

     Em `DEMO_MODE`, o guião do utilizador demo arranca automaticamente no primeiro login e pode ser relançado pelo menu.
  3. **Índice:** um painel com as secções do guião (por exemplo "Dashboards", "Comunicações", "S-EWO"), para saltar diretamente para uma delas. Serve sobretudo à apresentação.
- **Textos:**
  - ficam em `components/onboarding/demo-scripts/<guião>.ts`, com `{ pt, en }` por passo;
  - a língua segue a do utilizador, com fallback para en;
  - o utilizador revê os textos.
- **Âncoras:**
  - os elementos usados pelos passos recebem atributos `data-onboarding="..."`, como no padrão atual;
  - não se usam seletores de classes CSS.
- **Conteúdo** (resumo; o detalhe fica no plano):
  - **Apresentação** (15–20 passos):
    1. dashboard da fábrica e pirâmide;
    2. comunicação (QR público e registo);
    3. validação;
    4. S-EWO e RCA;
    5. ações e alertas;
    6. competências;
    7. SCIE;
    8. base de conhecimento e assistente;
    9. dashboard corporativo e relatórios.
  - **Formação Segurança (N3):**
    1. criar uma comunicação;
    2. validá-la;
    3. criar uma ação;
    4. fechar a ação;
    5. abrir e preencher um S-EWO;
    6. registar uma competência;
    7. registar uma inspeção a um extintor;
    8. ler os alertas.
  - **Formação Corporate (N1):**
    1. comparar fábricas;
    2. aprovar um S-EWO;
    3. gerar um relatório corporativo;
    4. histórico de KPI.
  - **Formação Admin (N0):**
    1. criar uma fábrica;
    2. criar um utilizador;
    3. ativar e desativar módulos;
    4. master data;
    5. destinatários de alertas;
    6. base de conhecimento.

## 5. Erros e casos-limite

- **Elemento de um passo não encontrado:** o motor já espera pelo elemento (`waitForOnboardingElement`). Se o tempo esgotar, mostra o passo centrado, sem âncora, e permite avançar.
- **Utilizador sai da página a meio de uma tarefa:** o guião guarda o passo, como hoje. Ao voltar, retoma.
- **Reinício falha a meio:** a rota devolve erro e o botão sugere `npm run demo:reset` no terminal. O seed é idempotente e pode voltar a correr.
- **Docker parado:** `npm run demo` falha com uma mensagem clara a pedir para arrancar o Docker Desktop.

## 6. Testes

- **Unitários:**
  - guarda do `DEMO_MODE` (recusa base de dados não-demo, produção e host remoto);
  - supressão de email;
  - rota de reset (404 sem `DEMO_MODE`);
  - avaliação de `completeWhen`;
  - resolução dos guiões nomeados;
  - **cada guião tem texto pt e en em todos os passos**.
- **Seed:** teste de integração opcional, que corre o `demo-seed` numa base temporária e verifica as contagens mínimas por fábrica.
- **Manual (utilizador):** percorrer cada guião em `npm run demo`.

## 7. Ficheiros principais

| Tipo | Ficheiros |
|---|---|
| Novos | `docker-compose.demo.yml`, `.env.demo`, `scripts/demo.mjs`, `scripts/demo-reset.ts`, `prisma/demo-seed.ts`, `demo/assets/*`, `lib/demo-mode.ts`, `app/api/demo/reset/route.ts`, `components/layout/demo-banner.tsx`, `components/onboarding/demo-scripts/*` |
| Alterados | `lib/env.ts`, `lib/services/smtp-gateway-client.ts`, `components/onboarding/{onboarding-types,onboarding-config,onboarding-tour,onboarding-provider}.tsx/ts`, `components/layout/user-menu.tsx`, a página de login e os layouts autenticados (faixa); os atributos `data-onboarding` em várias páginas; `package.json` (scripts `demo` e `demo:reset`) |
