# Rollout controlado do agente interno

Este documento define o plano tecnico e operacional para ativar o agente interno em staging e, depois, em producao. O objetivo e permitir uma ativacao reversivel, auditavel e limitada a utilizadores autorizados.

## Estado atual

O agente e controlado por variaveis server-side:

| Variavel | Default recomendado | Nota |
| --- | --- | --- |
| `AGENT_ENABLED` | `false` em producao | Feature flag principal. Quando `false`, a UI nao aparece e o endpoint bloqueia antes de mock, OpenAI, tools e confirmations. |
| `AGENT_MOCK_MODE` | `false` em producao | Quando `true`, usa runner mock e nao chama OpenAI. |
| `OPENAI_API_KEY` | vazio ate ativacao real | Deve existir apenas server-side. Nunca usar `NEXT_PUBLIC`. |
| `OPENAI_AGENT_MODEL` | `gpt-5.4-mini` | Modelo do agente real. |
| `AGENT_RATE_LIMIT_ENABLED` | `true` | Ativa o rate limit para roles nao isentas. |
| `AGENT_RATE_LIMIT_WINDOW_SECONDS` | `60` | Janela do rate limit. |
| `AGENT_RATE_LIMIT_MAX_REQUESTS` | `20` | Pedidos por janela para roles nao isentas. |
| `AGENT_MAX_MESSAGE_CHARS` | `4000` | Limite de tamanho do input. Aplica-se tambem a N0, N1 e N3. |
| `AGENT_REQUEST_TIMEOUT_MS` | `30000` | Timeout do agente real. |
| `AGENT_MAX_TOOL_CALLS` | `8` | Limite de tools por request no agente real. |
| `AGENT_MAX_OUTPUT_CHARS` | `4000` | Limite da resposta final. |

Roles autorizadas a usar o agente:

- `N0_ADMIN`
- `N1_CORPORATE`
- `N3_SAFETY`

`N2_PLANT_MANAGER` e roles inferiores nao devem ver nem usar o agente.

Por decisao de produto, `N0_ADMIN`, `N1_CORPORATE` e `N3_SAFETY` estao isentas de rate limit. Continuam sujeitas a autenticacao, RBAC, isolamento por planta, confirmations, limite de tamanho de mensagem e guardrails do agente real.

## Configuracao por ambiente

### Desenvolvimento local com mock

Usar para validar UI, RBAC, plant isolation, confirmations e audit sem custos OpenAI.

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
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-5.4-mini
```

Arranque local:

```powershell
npm run dev
```

### Staging fase 1: mock controlado

Usar para validar integracao da app e acessos reais sem OpenAI.

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=true
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-5.4-mini
AGENT_RATE_LIMIT_ENABLED=true
AGENT_RATE_LIMIT_WINDOW_SECONDS=60
AGENT_RATE_LIMIT_MAX_REQUESTS=20
AGENT_MAX_MESSAGE_CHARS=4000
AGENT_REQUEST_TIMEOUT_MS=30000
AGENT_MAX_TOOL_CALLS=8
AGENT_MAX_OUTPUT_CHARS=4000
```

Validar que:

- O chat aparece apenas em rotas de planta para `N0_ADMIN`, `N1_CORPORATE` e `N3_SAFETY`.
- O chat nao aparece em `/app/all/...`.
- `N2_PLANT_MANAGER` e inferiores nao veem o chat e nao conseguem usar `POST /api/agent`.
- Confirmations persistentes funcionam apos restart do processo.
- Audit logs registam os eventos com `requestId`.

### Staging fase 2: agente real

Ativar apenas depois da fase mock estar validada.

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=false
OPENAI_API_KEY=<server-side-secret>
OPENAI_AGENT_MODEL=gpt-5.4-mini
AGENT_RATE_LIMIT_ENABLED=true
AGENT_RATE_LIMIT_WINDOW_SECONDS=60
AGENT_RATE_LIMIT_MAX_REQUESTS=20
AGENT_MAX_MESSAGE_CHARS=4000
AGENT_REQUEST_TIMEOUT_MS=30000
AGENT_MAX_TOOL_CALLS=8
AGENT_MAX_OUTPUT_CHARS=4000
```

Antes de usar:

- Confirmar que a API key esta configurada apenas no servidor.
- Confirmar billing e quota OpenAI.
- Confirmar que os logs nao incluem prompt completo, resposta completa, env vars, API key ou stack traces.
- Confirmar mensagens seguras para quota, auth, timeout e erros genericos.

### Producao antes da ativacao

Manter o agente desligado ate haver aprovacao explicita.

```env
AGENT_ENABLED=false
AGENT_MOCK_MODE=false
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-5.4-mini
AGENT_RATE_LIMIT_ENABLED=true
AGENT_RATE_LIMIT_WINDOW_SECONDS=60
AGENT_RATE_LIMIT_MAX_REQUESTS=20
AGENT_MAX_MESSAGE_CHARS=4000
AGENT_REQUEST_TIMEOUT_MS=30000
AGENT_MAX_TOOL_CALLS=8
AGENT_MAX_OUTPUT_CHARS=4000
```

Com esta configuracao:

- A UI de chat nao aparece.
- `POST /api/agent` bloqueia antes de chamar OpenAI, mock, tools ou confirmations.
- Nao ha custo OpenAI associado ao agente.

### Producao ativada

Ativar apenas apos a checklist de pre-producao estar completa.

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=false
OPENAI_API_KEY=<server-side-secret>
OPENAI_AGENT_MODEL=gpt-5.4-mini
AGENT_RATE_LIMIT_ENABLED=true
AGENT_RATE_LIMIT_WINDOW_SECONDS=60
AGENT_RATE_LIMIT_MAX_REQUESTS=20
AGENT_MAX_MESSAGE_CHARS=4000
AGENT_REQUEST_TIMEOUT_MS=30000
AGENT_MAX_TOOL_CALLS=8
AGENT_MAX_OUTPUT_CHARS=4000
```

## Ativar, desativar e alternar modo

Para desativar rapidamente:

```env
AGENT_ENABLED=false
```

Depois reiniciar o servico e validar:

- A UI desaparece.
- `POST /api/agent` devolve erro seguro.
- Nao ha chamadas OpenAI.
- Nao ha execucao de tools.

Para ativar mock mode:

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=true
```

Para voltar ao agente real:

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=false
OPENAI_API_KEY=<server-side-secret>
```

## Validar OpenAI API

Validacao recomendada em staging real:

1. Confirmar que `OPENAI_API_KEY` esta definida apenas server-side.
2. Confirmar que billing e quota estao ativos na conta OpenAI.
3. Abrir a app como uma role autorizada numa plant valida.
4. Executar `kpis` no chat.
5. Confirmar resposta normal do agente.
6. Confirmar audit logs com o mesmo `requestId` para endpoint e resposta.

Erros esperados devem ser seguros:

- Quota ou billing: `A conta OpenAI API nao tem quota ou billing disponivel.`
- Timeout: `O agente demorou demasiado a responder. Tenta novamente.`
- Too many tool calls: `O agente precisou de demasiadas operacoes para concluir este pedido. Tenta reformular.`
- Erro generico: `Nao foi possivel processar o pedido do agente.`

Nao deve aparecer no cliente:

- API key.
- Env vars.
- Stack trace.
- Payload completo sensivel.
- Prompt ou resposta completa do modelo.

## Verificar audit logs

Rotas esperadas:

- Plant scope: `/app/<plant>/admin/agent-audit`
- Global/all-plants: apenas para `N0_ADMIN` e `N1_CORPORATE`, se a app disponibilizar a navegacao global.

Validar que a listagem mostra apenas resumo seguro:

- timestamp
- userId ou identificador seguro
- plantCode
- role
- eventType
- toolName, quando existir
- confirmationId, quando existir
- requestId
- result
- resumo truncado/seguro

Validar acesso:

- `N0_ADMIN`: pode ver logs globais ou por plant.
- `N1_CORPORATE`: pode ver logs globais ou por plant.
- `N3_SAFETY`: pode ver apenas logs da sua plant.
- `N2_PLANT_MANAGER` e inferiores: sem acesso.

Eventos a procurar durante smoke tests:

- request recebido
- resposta normal
- erro seguro
- tool chamada
- tool executada
- tool bloqueada por RBAC
- confirmation criada
- confirmation confirmada
- confirmation cancelada
- confirmation expirada
- rate limit aplicado, quando aplicavel a roles nao isentas
- mensagem bloqueada por tamanho excessivo
- agente desativado
- timeout
- limite de tool calls
- resposta truncada
- erro OpenAI quota/auth/generico

## Verificar rate limit e limites

O rate limit esta ativo por configuracao, mas as roles atualmente autorizadas ao agente (`N0_ADMIN`, `N1_CORPORATE`, `N3_SAFETY`) estao isentas por requisito de produto. Ainda assim, validar:

- Requests normais continuam a passar.
- Mensagem com mais de `AGENT_MAX_MESSAGE_CHARS` e bloqueada com erro seguro.
- O bloqueio por tamanho nao chama OpenAI, mock, tools nem confirmations.
- Audit log contem evento de mensagem demasiado longa com `requestId`.
- Testes automatizados cobrem o caminho de rate limit para roles nao isentas.

Se no futuro forem autorizadas roles nao isentas, validar manualmente que pedidos acima de `AGENT_RATE_LIMIT_MAX_REQUESTS` dentro de `AGENT_RATE_LIMIT_WINDOW_SECONDS` devolvem:

```text
Demasiados pedidos ao agente. Tenta novamente dentro de alguns segundos.
```

## Verificar confirmations

Smoke test de confirmation:

1. Pedir `fecha a acao ACT-1`.
2. Confirmar que a acao nao fecha diretamente.
3. Confirmar que e criada uma pending confirmation persistente.
4. Confirmar que a UI mostra `Confirmar` e `Cancelar`.
5. Clicar `Cancelar`.
6. Confirmar que nada foi fechado.
7. Repetir `fecha a acao ACT-1`.
8. Clicar `Confirmar`.
9. Confirmar que a acao executa pelo fluxo real.
10. Confirmar que duplo clique nao executa duas vezes.
11. Confirmar audit logs de created/cancelled/confirmed com o mesmo `requestId` por fluxo.

Tambem validar apos restart do processo:

1. Criar uma pending confirmation.
2. Reiniciar o servico.
3. Confirmar a mesma pending confirmation dentro do prazo.
4. Confirmar que o payload foi carregado da base de dados e nao do frontend.

## Checklist de pre-producao

- [ ] Migrations aplicadas.
- [ ] `npx prisma validate` executado com sucesso.
- [ ] `npx prisma migrate deploy` executado no ambiente alvo.
- [ ] Testes unitarios do agente executados.
- [ ] Testes unitarios de audit route executados.
- [ ] `npx next build` executado com sucesso.
- [ ] `AGENT_ENABLED=false` definido por defeito em producao ate ativacao explicita.
- [ ] `AGENT_MOCK_MODE=false` definido em producao.
- [ ] `OPENAI_API_KEY` configurada apenas server-side.
- [ ] Billing OpenAI confirmado.
- [ ] Quota OpenAI confirmada.
- [ ] Audit logs acessiveis apenas a roles autorizadas.
- [ ] `N2_PLANT_MANAGER` e inferiores sem acesso ao agente.
- [ ] `N3_SAFETY` limitado a sua plant nos audit logs.
- [ ] `/app/all/...` nao expoe chat nem logs a roles sem controlo adequado.
- [ ] Confirmations persistentes testadas.
- [ ] Mensagens de erro nao expoem stack traces, env vars ou API keys.
- [ ] Rollback documentado e testado em staging.

Comandos recomendados antes de producao:

```powershell
npx prisma validate
npx prisma migrate deploy
npx vitest run tests/unit/agent-access.test.ts tests/unit/agent-security-route.test.ts tests/unit/agent-tools-security.test.ts tests/unit/agent-confirmations.test.ts tests/unit/agent-mock-agent.test.ts tests/unit/agent-audit-route.test.ts
npx next build
```

## Smoke tests manuais

Executar em staging antes de producao:

1. Abrir a app como `N3_SAFETY` numa plant valida.
2. Confirmar que o chat aparece.
3. Pedir `lista acoes abertas`.
4. Confirmar resposta limitada a plant atual.
5. Pedir `kpis`.
6. Confirmar resposta normal.
7. Pedir `fecha a acao ACT-1`.
8. Confirmar que pede confirmacao.
9. Clicar `Cancelar`.
10. Confirmar que nada foi fechado.
11. Repetir `fecha a acao ACT-1`.
12. Clicar `Confirmar`.
13. Confirmar que a acao fecha pelo fluxo real.
14. Verificar audit logs do fluxo.
15. Entrar como `N2_PLANT_MANAGER`.
16. Confirmar que o chat nao aparece.
17. Confirmar que `POST /api/agent` bloqueia se chamado diretamente.
18. Testar `/app/all/...`.
19. Confirmar que o chat nao aparece.
20. Confirmar que logs globais nao sao expostos a `N3_SAFETY` ou roles inferiores.

Comandos uteis no chat:

```text
lista acoes abertas
lista comunicacoes
kpis
fecha a acao ACT-1
```

## Rollback

Rollback rapido:

1. Definir:

```env
AGENT_ENABLED=false
```

2. Reiniciar o servico.
3. Confirmar que a UI desaparece.
4. Confirmar que `POST /api/agent` devolve erro seguro.
5. Confirmar audit de agente desativado.
6. Confirmar que nao ha chamadas OpenAI.
7. Confirmar que tools e confirmations nao executam.

Rollback de modo real para mock em staging:

```env
AGENT_ENABLED=true
AGENT_MOCK_MODE=true
```

Usar apenas em staging ou ambientes controlados. Em producao, preferir desligar com `AGENT_ENABLED=false` se houver incidente.

## Criterios para producao

O rollout pode avancar para producao apenas quando:

- Staging mock passou.
- Staging real passou.
- Smoke tests passaram para `N3_SAFETY`, `N2_PLANT_MANAGER`, `/app/all/...` e audit logs.
- Confirmations persistentes foram validadas.
- Guardrails foram validados.
- OpenAI billing/quota foram confirmados.
- Plano de rollback foi testado.
- Responsavel operacional sabe desativar o agente via `AGENT_ENABLED=false`.
