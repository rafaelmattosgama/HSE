# Regeneração do QR de reporte

A regeneração está desativada por defeito. A configuração do servidor é:

```dotenv
REPORT_QR_REGENERATION_ENABLED=false
```

Apenas o valor exato `true` permite regenerar. Uma variável ausente, vazia ou com
outro valor mantém o bloqueio. Não usar o prefixo `NEXT_PUBLIC_`.

## Comportamento

- O botão de regeneração de **reporte** fica desativado com uma mensagem explicativa.
- A API e a função de regeneração bloqueiam a operação antes de alterar tokens.
- A implantação e a alteração desta configuração não criam nem revogam tokens.
  Os QR atuais continuam a ser validados normalmente.
- Copiar, abrir, descarregar e imprimir o QR guardado no navegador continuam disponíveis.
- A regeneração de **quiosque** mantém-se disponível. As operações de regeneração
  requerem confirmação na interface e `regenerate: true` na API.
- A revogação explícita pela API (`revoke: true`) continua disponível para incidentes.
  Não cria outro token, mas invalida o QR desse tipo. Não é possível pedir revogação
  e regeneração em simultâneo, nem omitir ambas as ações.
- Quando permitida, a regeneração revoga os tokens anteriores do mesmo tipo e
  cria o novo token numa transação, com registo de auditoria sem o token em claro.

## Reativar mais tarde

1. Conservar o QR/link atual e planear a substituição dos exemplares distribuídos.
2. Definir `REPORT_QR_REGENERATION_ENABLED=true` no ambiente do servidor.
3. Reiniciar a aplicação com o novo ambiente. Em Docker Compose, recriar o serviço
   `app` para carregar o ficheiro de ambiente; um simples restart do contentor
   não atualiza as variáveis. Exemplo, a partir da pasta do projeto:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate app
   ```

4. Abrir a administração da planta e confirmar a regeneração pretendida.
   Ativar a configuração, por si só, não gera qualquer token.
5. Guardar e distribuir o novo QR. Os anteriores desse tipo deixam de funcionar.
6. Voltar a definir `false` e reiniciar/recriar a aplicação para bloquear novamente.

Não é necessária migração da base de dados. Não alterar `TOKEN_PEPPER`: isso
invalida os tokens existentes independentemente deste bloqueio.

## Cópia do QR atual

A base de dados guarda apenas o hash do token. O QR, token e link originais são
guardados no armazenamento local do navegador que os gerou. Noutro navegador,
ou após limpar esse armazenamento, a aplicação pode não apresentar o QR atual.
Conservar uma cópia do link ou da imagem; essa ausência não significa que o QR
distribuído tenha deixado de funcionar.

## Dados de desenvolvimento e testes

O `prisma/seed.ts` ignora a criação/reativação de tokens **REPORT** enquanto a
configuração estiver desativada, e também quando `NODE_ENV` ou `APP_ENV` forem
`production`. O `scripts/prepare-e2e.mjs` termina antes de aceder à base de dados
nessas condições. Para preparar estes tokens de demonstração, usar uma base de
dados de testes isolada, ambiente de desenvolvimento/teste e ativação explícita
da configuração. Nunca executar esses scripts contra a base de dados real.
