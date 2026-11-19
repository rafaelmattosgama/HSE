# Modo demo local

O modo demo é uma instalação do MAx Safety **isolada, no próprio portátil**, com **dados fictícios**. Serve para:

- **apresentações** (por chamada ou em conferência), com um guião de visita a toda a plataforma;
- **formação** de novos utilizadores (Segurança, Corporate e Administrador), com guiões que incluem tarefas práticas.

É o mesmo código da aplicação, a correr com o ficheiro `.env.demo` e com contentores próprios. Não toca na base de dados de desenvolvimento nem em produção.

## Requisitos

- Docker Desktop a correr.
- Dependências instaladas (`npm install`).
- A porta 3100 livre, e as portas 5434, 6381, 9002 e 9003 livres para os contentores.

## Arrancar

```bash
npm run demo
```

1. Arranca os contentores `ma-hse-demo-*`: postgres em 5434, redis em 6381 e MinIO em 9002/9003, todos acessíveis só a partir do próprio portátil.
2. Aplica as migrações na base `ehs_demo`.
3. Na primeira vez, carrega os dados de demonstração (cerca de 1 minuto).
4. Abre a aplicação em **http://localhost:3100** e o worker das filas.

`Ctrl+C` para tudo. Os dados ficam guardados para a próxima vez.

A demo pode correr ao mesmo tempo que o `npm run dev:all`: usa portas, contentores e pasta de build (`.next-demo`) diferentes.

## Contas

Todas as contas usam a password **`Demo2026!`**. A página de login mostra-as; clicar numa preenche o formulário.

| Conta | Perfil | Guião |
|---|---|---|
| `demo.apresentacao@maxsafety.demo` | Corporate (N1) | Apresentação |
| `demo.seguranca@maxsafety.demo` | Segurança (N3), Demo Lisboa | Formação Segurança |
| `demo.corporate@maxsafety.demo` | Corporate (N1) | Formação Corporate |
| `demo.admin@maxsafety.demo` | Administrador (N0) | Formação Administrador |

Existem também contas de fundo por fábrica (`n2.demo-lis@maxsafety.demo`, `n4.…`, `n5.…`, e `n3.demo-opo@…`), com a mesma password. Servem de responsáveis e aprovadores nos dados e não têm guião.

## Dados de demonstração

O seed cria duas fábricas, **Demo Lisboa** e **Demo Porto**, com 12 meses de histórico até ao dia em que corre:

- cerca de 400 comunicações por fábrica, com a pirâmide completa, algumas por validar e códigos no formato real;
- cerca de 580 ações por fábrica, entre abertas, em curso, fechadas e em atraso;
- investigações S-EWO em vários estados, com causas;
- competências: 20 trabalhadores com autorizações válidas, a expirar, expiradas e uma suspensa;
- SCIE: 15 equipamentos, com inspeções em dia, em atraso e nunca feitas, e uma não conformidade aberta;
- horas trabalhadas e um ano anterior de KPI, para as comparações;
- 4 lições aprendidas na base de conhecimento (pesquisa por texto, sem embeddings).

Todos os nomes são fictícios ("Ana Demo Silva", "Bruno Teste Costa", …).

Na demo, **nenhum email sai do portátil**. Os envios são registados no log como `demo_email_suppressed` e os fluxos continuam como se o email tivesse sido enviado. As chaves de IA e de email estão vazias no `.env.demo`. O assistente funciona em modo simulado e a tradução automática e a extração de PDFs estão desligadas.

## Reiniciar

Para voltar aos dados iniciais, por exemplo entre duas formações:

- **na aplicação:** menu do utilizador → **Reiniciar demo**. Só aparece em modo demo e só funciona com as contas demo;
- **no terminal:** `npm run demo:reset`.

O reinício apaga tudo o que está na base `ehs_demo`, no redis e no bucket da demo, e volta a carregar os dados (cerca de 45 s). No fim, a sessão termina e volta-se ao login.

O comando `npm run demo:seed` volta a correr o seed sem apagar nada. É idempotente: só atualiza os dados demo.

## Fazer uma apresentação

1. `npm run demo` uns minutos antes. A primeira página demora a compilar; abrir o login uma vez chega para aquecer.
2. Opcional: `npm run demo:reset`, para partir dos dados iniciais.
3. Entrar com `demo.apresentacao@maxsafety.demo` e carregar em **Começar** na janela de boas-vindas.
4. Avançar com **Seguinte** ou com as setas do teclado.
5. Se alguém perguntar por um módulo, usar o **índice** no canto inferior esquerdo para saltar para essa secção.
6. Para repetir: menu do utilizador → **Reiniciar visita guiada**.

Os textos aparecem em português se a conta estiver em PT e em inglês em qualquer outra língua (mudar em Definições → língua).

## Dar uma formação

1. `npm run demo:reset` antes de cada sessão.
2. Cada formando entra com a conta do seu perfil (Segurança, Corporate ou Administrador).
3. Nos passos **Tarefa**:
   - o guião espera que o formando faça a tarefa e avança sozinho quando ela está feita;
   - se o formando sair da página destacada, a tarefa continua visível num cartão no canto inferior direito;
   - **Saltar tarefa** passa ao passo seguinte sem a fazer.
4. No fim, **Reiniciar demo** apaga o que foi criado durante a formação.

A demo corre num só portátil e todos os formandos partilham os mesmos dados. Para várias pessoas em simultâneo, cada uma usa o seu portátil.

## Segurança

- A aplicação **recusa arrancar** em modo demo se `APP_ENV=production`, se a base de dados não se chamar `ehs_demo` ou se não for local. O reinício volta a fazer estas verificações e confirma também que o redis e o S3 são locais antes de apagar o que quer que seja.
- **Nunca** aponte o `.env.demo` para dados reais nem copie dados de produção para a base `ehs_demo`.
- O `.env.demo` vai para o git porque só tem valores fictícios e locais. Não lhe acrescente chaves reais.

## Resolução de problemas

| Problema | Solução |
|---|---|
| `O Docker não está a correr` | Arrancar o Docker Desktop e voltar a correr `npm run demo`. |
| `A porta 3100 já está ocupada` | A demo já está a correr noutro terminal: use essa, ou pare-a com `Ctrl+C`. |
| Erro de porta 5434/6381/9002 ao arrancar os contentores | Outro programa usa a porta. Ver com `docker ps` e parar o que estiver a ocupá-la. |
| "Não foi possível reiniciar a demo" no menu | Correr `npm run demo:reset` no terminal para ver o erro completo. |
| A página fica em branco ou muito lenta na primeira visita | É a compilação inicial do Next.js; esperar e atualizar. |
| O guião não aparece | Pode já ter sido concluído: menu do utilizador → **Reiniciar visita guiada**. |
| Um passo do guião é saltado | O elemento que o passo destaca não está na página (por exemplo, um módulo desativado). Reiniciar a demo repõe a configuração inicial. |

Para apagar a demo por completo (contentores e dados):

```bash
docker compose -f docker-compose.demo.yml down -v
```

## Ficheiros

| Ficheiro | Função |
|---|---|
| `.env.demo`, `docker-compose.demo.yml` | Configuração e contentores da demo |
| `scripts/demo.mjs`, `scripts/demo-run.mjs`, `scripts/demo-env.mjs` | Comandos `npm run demo*` |
| `lib/demo-mode.ts` | Guarda de segurança, contas e fábricas demo |
| `prisma/demo-seed.ts`, `prisma/demo-data/*` | Dados de demonstração |
| `lib/demo-reset.ts`, `app/api/demo/reset/route.ts` | Reinício |
| `components/layout/demo-banner.tsx`, `components/layout/demo-accounts.tsx` | Faixa e contas no login |
| `components/onboarding/demo-scripts/*` | Textos dos guiões (PT/EN) |
| `components/onboarding/task-condition.ts`, `demo-script-index.tsx` | Passos de tarefa e índice |
