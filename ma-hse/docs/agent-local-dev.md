# Agent local dev

Este guia valida o agente interno em modo mock/dev, sem chamadas ao OpenAI.

## Ativar mock mode

Crie ou edite `.env.local` na raiz do projeto:

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=true
AGENT_RATE_LIMIT_ENABLED=true
AGENT_RATE_LIMIT_WINDOW_SECONDS=60
AGENT_RATE_LIMIT_MAX_REQUESTS=20
AGENT_MAX_MESSAGE_CHARS=4000
AGENT_REQUEST_TIMEOUT_MS=30000
AGENT_MAX_TOOL_CALLS=8
AGENT_MAX_OUTPUT_CHARS=4000
```

O ficheiro `.env.local` e ignorado pelo Git. O schema de ambiente em `lib/env.ts` converte as strings `true` para booleanos. `AGENT_ENABLED=true` expõe o agente para roles autorizadas; `AGENT_MOCK_MODE=true` faz o endpoint `/api/agent` usar o runner mock.

Roles autorizadas inicialmente:

- `N0_ADMIN`
- `N1_CORPORATE`
- `N3_SAFETY`

Estas roles nao estao sujeitas ao rate limit do agente, mas continuam sujeitas a RBAC, isolamento por planta, confirmations e `AGENT_MAX_MESSAGE_CHARS`.

## Iniciar o projeto

Com os servicos locais disponiveis, arranque a app:

```powershell
npm run dev:all
```

Ou, se base de dados/Redis/S3 ja estiverem ativos:

```powershell
npm run dev
```

Abra a aplicacao, faca login com um utilizador com acesso a uma planta e aceda a uma rota de planta, por exemplo:

```text
/app/pl01/dashboards
```

O chat nao deve aparecer em rotas agregadas:

```text
/app/all/communications
```

## Comandos de teste no chat

Execute estes comandos no chat:

```text
lista acoes abertas
lista comunicacoes
kpis
fecha a acao ACT-123
```

Se `ACT-123` nao existir na base local, use um numero/codigo de acao aberta devolvido por `lista acoes abertas`. O mock interpreta `ACT-123` como a acao com `sequenceNumber = 123` na planta atual.

## Comportamento esperado

- Com `AGENT_MOCK_MODE=true`, `/api/agent` nao chama OpenAI.
- Com `AGENT_ENABLED=false`, o chat nao aparece e `/api/agent` nao executa mock, OpenAI nem tools.
- Com `AGENT_ENABLED=true`, o chat aparece apenas em rotas de planta e apenas para roles autorizadas.
- `AGENT_RATE_LIMIT_ENABLED=true` ativa o limitador do endpoint antes de mock, OpenAI, tools e confirmations para roles nao isentas.
- `AGENT_RATE_LIMIT_WINDOW_SECONDS` define a janela do limite; `AGENT_RATE_LIMIT_MAX_REQUESTS` define pedidos por janela; `AGENT_MAX_MESSAGE_CHARS` bloqueia prompts demasiado longos.
- Com `AGENT_MOCK_MODE=false`, `AGENT_REQUEST_TIMEOUT_MS`, `AGENT_MAX_TOOL_CALLS` e `AGENT_MAX_OUTPUT_CHARS` limitam tempo de execucao, numero de tools e tamanho da resposta final do agente real.
- Se a mensagem exceder `AGENT_MAX_MESSAGE_CHARS`, o endpoint responde com erro amigavel e nao chama mock, OpenAI nem tools.
- A UI continua a usar o mesmo endpoint `/api/agent`.
- O frontend envia apenas `plantCode`, `message` ou `confirmationId`/`confirmationAction`.
- `userId`, `role`, `plantId` e permissoes sao sempre resolvidos no backend.
- As tools usam o `plantId` resolvido no backend e ignoram qualquer tentativa de mudar planta via prompt ou input de tool.
- Em `/app/all/...`, o chat nao aparece.
- Em `/app/<plant>/...`, o chat aparece e usa a `plantCode` da rota.
- `fecha a acao <codigo>` nao fecha diretamente: cria uma pending confirmation.
- A UI mostra `Confirmar` e `Cancelar`.
- `Confirmar` executa a acao pelo fluxo real de confirmation.
- `Cancelar` cancela a confirmation e uma tentativa posterior de confirmar fica bloqueada.
- Duplo clique nao deve executar duas vezes, porque a UI desativa os botoes enquanto o pedido esta em curso e o backend marca a confirmation como executada antes de chamar a acao.
- Erros publicos nao devem expor stack traces, detalhes internos, env vars ou API keys.

## Voltar ao agente real

Edite `.env.local`:

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=false
```

Configure a chave/modelos do agente real no ambiente do servidor e reinicie a app. Nao coloque chaves no frontend nem em ficheiros versionados.
