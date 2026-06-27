---
title: "Manual de Administracao"
subtitle: "MA HSE"
author: "MA HSE"
date: "25 de junho de 2026"
lang: "pt-PT"
toc: true
toc-depth: 3
numbersections: true
geometry: margin=22mm
colorlinks: true
---

<div class="cover">
  <div class="cover-brand">MA HSE</div>
  <h1 class="cover-title">Manual de Administracao</h1>
  <div class="cover-subtitle">MA HSE</div>
  <div class="cover-meta">
    <p><strong>Publico:</strong> Administradores e equipa tecnica</p>
    <p><strong>Data:</strong> 25 de junho de 2026</p>
    <p>Guia de administracao funcional, operacao local e configuracao.</p>
  </div>
</div>

<div class="page-break"></div>

# Manual de Administracao - MA HSE

Versao gerada por analise do projeto em 2026-06-25.

## 1. Objetivo

Este manual descreve a administracao funcional e tecnica do MA HSE. Inclui perfis, permissoes, configuracao de plantas, utilizadores, modulos, dados mestre, QR Codes, SLAs, alertas, notificacoes, contractors, saude ocupacional e operacao local.

Para instalacao e deploy detalhado em servidor Linux, consultar tambem `DEPLOY.md`.

## 2. Perfis e Permissoes

### N0_ADMIN

Administrador global.

Pode:

- gerir plantas;
- aceder a Settings;
- ativar/desativar modulos globalmente e por planta;
- gerir dados mestre globais e por planta;
- gerir utilizadores de niveis superiores e por planta;
- configurar destinatarios, layouts, riscos profissionais e listas;
- aceder aos dashboards e modulos operacionais.

### N1_CORPORATE

Perfil corporativo multi-planta.

Pode:

- aceder ao dashboard corporativo;
- aceder a plantas;
- validar comunicacoes;
- aprovar S-EWO;
- criar e gerir utilizadores N1/N2/N3 por planta;
- criar, reabrir e fechar comunicacoes/acoes quando autorizado;
- gerir alertas globais de repetibilidade.

### N2_PLANT_MANAGER

Gestor de planta.

Pode:

- consultar dashboards da planta;
- criar e consultar comunicacoes e acoes;
- criar e aprovar S-EWO;
- reabrir comunicacoes e acoes;
- aceder a inputs mensais;
- consultar administracao da planta conforme permissao.

Normalmente nao altera parametros administrativos sensiveis como SLA, QR tokens, destinatarios ou dados mestre.

### N3_SAFETY

Responsavel de seguranca da planta.

Pode:

- criar e consultar comunicacoes e acoes;
- validar comunicacoes;
- fechar comunicacoes manualmente;
- reabrir comunicacoes e acoes;
- administrar dados da planta;
- gerir SLA, alertas, QR tokens e destinatarios quando autorizado;
- criar utilizadores N4/N5/MEDICO na propria planta;
- criar S-EWO sem aprovacao final N2.

### N4_SUPERVISOR

Supervisor.

Pode:

- consultar e criar comunicacoes;
- consultar e criar acoes;
- fechar acoes com evidencia;
- consultar lista S-EWO;
- aceder a SMAT quando o modulo estiver ativo.

Nao valida comunicacoes, nao aprova S-EWO e nao reabre comunicacoes/acoes.

### N5_OPERATOR

Operador.

Pode:

- consultar e criar comunicacoes;
- consultar e criar acoes;
- fechar acoes com evidencia;
- consultar dashboards permitidos.

Nao acede a S-EWO API, validacao ou administracao.

### N6_QR_REPORTER

Reportador publico sem login.

Pode submeter comunicacoes por link/QR Code publico. Os tipos atualmente permitidos pelo codigo sao:

- Unsafe Act
- Unsafe Condition
- Near Miss
- First Aid
- 5S Improvement
- Improvement Suggestion

### MEDICO

Perfil medico.

Pode consultar comunicacoes, incluindo campos clinicos. Nao cria comunicacoes/acoes e nao acede a mutacoes administrativas ou S-EWO.

## 3. Arranque Local

### 3.1 Pre-requisitos

- Node.js 22+
- Docker Desktop
- npm

### 3.2 Comandos principais

Na pasta do projeto:

```powershell
cd C:\HSE\ma-hse
docker compose up -d
npm run dev:all
```

O `dev:all` inicia scheduler, aplicacao Next.js numa porta livre entre 3000 e 3020 e worker BullMQ.

### 3.3 Servicos locais

- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailpit SMTP: `localhost:1025`
- Mailpit UI: `http://localhost:8025`

### 3.4 Scripts uteis

- `npm run dev`: aplicacao em desenvolvimento.
- `npm run dev:all`: app, scheduler e worker.
- `npm run build`: build de producao.
- `npm run start`: servidor de producao.
- `npm run lint`: lint.
- `npm run db:migrate`: migrations Prisma em desenvolvimento.
- `npm run db:migrate:deploy`: migrations em deploy.
- `npm run db:seed`: dados seed.
- `npm run db:studio`: Prisma Studio.
- `npm run worker:dev`: worker BullMQ.
- `npm run scheduler:dev`: agenda jobs recorrentes.
- `npm run test:unit`: testes unitarios.
- `npm run test:e2e`: testes Playwright.

## 4. Administracao Global - Settings

A pagina `Settings` esta disponivel para N0_ADMIN.

### 4.1 Plantas

Permite criar, editar e ativar/inativar plantas.

Campos principais:

- codigo;
- nome;
- timezone;
- idioma padrao;
- estado ativo/inativo.

### 4.2 Idioma da planta

Define idioma padrao e timezone da planta. Este idioma influencia UI localizada, formularios publicos e dados localizados quando suportado.

### 4.3 Modulos globais e por planta

Existem toggles globais e toggles por planta para controlar a disponibilidade de:

- MAPA
- Validations
- Actions
- S-EWO
- SMAT
- Contractors
- Communications
- Monthly Inputs
- Occupational Health

Se um modulo estiver desligado globalmente ou por planta, pode desaparecer do menu mesmo para utilizadores com role adequada.

### 4.4 Dados mestre globais por planta

N0 pode gerir:

- areas;
- postos/locais de trabalho;
- equipamentos;
- trabalhadores;
- tipos de near miss;
- tipos de ato inseguro;
- tipos de condicao insegura;
- tipos de lesao;
- riscos profissionais.

Manter estes dados atualizados e essencial para qualidade dos dashboards e formularios.

### 4.5 Utilizadores

N0 pode criar e gerir utilizadores associados a plantas. Se for criada uma conta sem palavra-passe definida, o sistema gera palavra-passe temporaria, tenta enviar por email e exige troca no primeiro login.

### 4.6 Destinatarios e layouts

Settings permite configurar:

- destinatarios de relatorios S-EWO;
- destinatarios de alertas de comunicacoes de seguranca;
- layouts de relatorio.

## 5. Administracao da Planta

A pagina `Admin` dentro da planta concentra configuracoes locais.

### 5.1 SLA

Permite configurar prazos por prioridade:

- LOW;
- MEDIUM;
- HIGH.

Estes valores influenciam datas limite e acompanhamento de acoes.

### 5.2 Safety Days

Permite definir:

- data manual do ultimo acidente;
- recorde historico em dias;
- data de inicio do recorde historico.

Estes dados alimentam os paineis de dias sem acidente.

### 5.3 QR Token Manager

Permite gerir tokens publicos:

- REPORT;
- KIOSK.

Ao regenerar um token, o token anterior do mesmo tipo e revogado. O sistema apresenta:

- link publico completo;
- QR Code;
- opcao para abrir link;
- copiar link;
- guardar QR como imagem;
- imprimir QR.

Guardar e distribuir QR Codes apenas em locais aprovados. Se houver suspeita de uso indevido, regenerar o token.

### 5.4 Alertas de repetibilidade

Permite configurar regras de repetibilidade por planta. Estas regras apoiam notificacoes quando eventos semelhantes se repetem dentro de uma janela temporal.

### 5.5 Dados mestre da planta

Perfis autorizados podem gerir areas, locais e trabalhadores. N0 pode gerir tambem conjuntos adicionais, como equipamentos e tipos de ocorrencia.

### 5.6 Listas de destinatarios

As listas de destinatarios controlam para quem vao determinados relatorios e notificacoes. Devem ser revistas sempre que existirem alteracoes de equipa ou responsabilidades.

### 5.7 Utilizadores da planta

Administradores autorizados podem:

- criar utilizadores;
- definir nome, email, idioma e role;
- ativar/inativar utilizadores;
- alterar associacao de roles por planta.

Regras principais:

- N1 cria N1/N2/N3.
- N3 cria N4/N5/MEDICO na propria planta.
- N0 tem administracao global.

## 6. Gestao de Comunicacoes

### 6.1 Estados

Estados relevantes:

- `SUBMITTED`;
- `PENDING_VALIDATION`;
- `VALID_OPEN`;
- `ONGOING`;
- `CLOSED`.

Apenas comunicacoes em `VALID_OPEN`, `ONGOING` ou `CLOSED` contam para KPI.

### 6.2 Validacao

N1 e N3 validam comunicacoes. A validacao atualiza estado e regista auditoria do diferencial.

### 6.3 Fecho manual e reabertura

N1 e N3 podem fechar comunicacoes manualmente com motivo. N1, N2 e N3 podem reabrir comunicacoes/acoes quando autorizado.

### 6.4 Classificacao

Classificacoes tecnicas devem usar dados mestre corretos para permitir rankings e analise de tendencia.

## 7. Gestao de Acoes

### 7.1 SLA e prioridade

A prioridade determina prazos baseados no SLA configurado.

### 7.2 Evidencia obrigatoria

O fecho de acao exige comentario e evidencia. Esta regra melhora rastreabilidade e controlo CAPA.

### 7.3 Relacao com comunicacoes

Acoes abertas ligadas a comunicacoes podem colocar a comunicacao em estado `ONGOING`.

## 8. S-EWO

### 8.1 Catalogo de causas

O S-EWO usa catalogo versionado de causas. Administradores devem manter consistencia do catalogo e evitar alteracoes que prejudiquem comparabilidade historica.

### 8.2 Aprovacao

A aprovacao final e responsabilidade de perfis autorizados, normalmente N1/N2. Comentarios devem ser claros, sobretudo em rejeicoes.

### 8.3 Destinatarios

Listas de destinatarios S-EWO devem refletir quem precisa receber relatorios e notificacoes.

## 9. Contractors

### 9.1 Convites

No modulo `Contractors`, o administrador envia convite para o email da empresa externa. A empresa regista-se e acede ao portal.

### 9.2 Revisao

Administradores com permissao podem rever:

- dados da empresa;
- documentos da empresa;
- trabalhadores;
- documentos dos trabalhadores;
- validade documental;
- estado aprovado, pendente, rejeitado ou expirado.

### 9.3 Aprovacao

N3 Safety e N1 Corporate podem aprovar, conforme a regra implementada no dashboard.

## 10. Occupational Health

Administradores autorizados podem:

- adicionar trabalhadores;
- editar dados;
- importar Excel;
- exportar Excel/PDF;
- descarregar template;
- inativar trabalhadores.

Verificar regularmente exames vencidos ou proximos do vencimento.

## 11. Monthly Inputs e Environment Dashboard

### 11.1 Inputs mensais

Os inputs mensais alimentam dashboards e calculos como horas trabalhadas, indices e indicadores ambientais.

Administradores devem garantir que:

- o ano correto esta carregado;
- os meses estao preenchidos;
- indicadores ativos sao adequados;
- imports Excel foram validados apos processamento.

### 11.2 Indicadores customizados

O formulario permite ativar/desativar indicadores, editar labels, unidades, opcoes e distancias quando aplicavel. Alteracoes devem ser controladas para preservar comparabilidade historica.

## 12. MAPA

O modulo MAPA usa documentos, camadas e features. Para boa manutencao:

- garantir documentos atualizados;
- manter areas e postos corretamente posicionados;
- validar camadas visiveis;
- rever marcadores automaticos de incidentes.

## 13. Jobs, Filas e Email

A aplicacao usa BullMQ e Redis para jobs.

Handlers existentes incluem:

- digest semanal;
- relatorios mensal e anual;
- alertas de acoes em atraso;
- alertas repetitivos;
- notificacoes de S-EWO aprovado;
- notificacoes por email.

Em ambiente local, usar `npm run dev:all` ou iniciar `scheduler` e `worker` separadamente.

## 14. Storage e Anexos

Anexos, evidencias e fotos publicas sao guardados em storage compativel com S3, normalmente MinIO local ou S3 equivalente.

Para o formulario publico:

- maximo 5 fotos;
- maximo 5 MB por foto;
- maximo 20 MB total;
- formatos JPG, JPEG, PNG, WEBP, HEIC e HEIF.

## 15. Seguranca

### 15.1 Segredos

Proteger:

- `.env`;
- `.env.production`;
- `NEXTAUTH_SECRET`;
- `TOKEN_PEPPER`;
- credenciais de base de dados;
- credenciais S3/MinIO;
- SMTP;
- chaves de API.

Nao publicar ficheiros `.env` nem dumps reais.

### 15.2 TOKEN_PEPPER

Nao alterar `TOKEN_PEPPER` depois de gerar tokens QR, porque os tokens existentes deixam de validar.

### 15.3 Contas e palavras-passe

- Usar palavras-passe fortes.
- Inativar contas que ja nao devem aceder.
- Evitar partilha de contas.
- Trocar palavras-passe temporarias no primeiro acesso.

### 15.4 Rate limit

Rotas publicas por QR Code usam rate limit por IP e planta para reduzir abuso.

## 16. Observabilidade

Endpoints:

- `GET /api/health/live`
- `GET /api/health/ready`

O endpoint ready valida dependencias como base de dados, Redis e storage.

Logs usam logger estruturado com `pino`.

## 17. Backups

Antes de atualizacoes importantes:

1. Fazer backup SQL da base de dados.
2. Preservar volume/armazenamento de anexos.
3. Confirmar que o backup pode ser restaurado.

Exemplo de backup em producao esta documentado em `DEPLOY.md`.

## 18. Testes e Validacao

Antes de publicar alteracoes:

```powershell
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

Se algum teste falhar, corrigir antes de deploy.

## 19. Troubleshooting

### Aplicacao nao arranca

Verificar:

- Docker ativo;
- Postgres, Redis e MinIO saudaveis;
- `.env` correto;
- migrations aplicadas;
- porta livre.

### Login falha

Verificar:

- utilizador ativo;
- role associada;
- palavra-passe;
- `NEXTAUTH_SECRET`;
- URL configurada (`NEXTAUTH_URL`, `APP_URL`).

### QR Code deixou de funcionar

Possiveis causas:

- token regenerado;
- `TOKEN_PEPPER` alterado;
- planta inexistente/inativa;
- rota publica bloqueada;
- rate limit.

### Dashboard sem dados

Confirmar:

- comunicacoes validadas;
- periodo correto;
- inputs mensais preenchidos;
- horas trabalhadas existentes;
- modulos ativos.

### Upload falha

Verificar:

- MinIO/S3 disponivel;
- bucket configurado;
- credenciais corretas;
- limites de tamanho e formato.

