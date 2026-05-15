# Deploy MA HSE em Linux

Este guia sobe a aplicacao em Docker, aplica migrations Prisma e, quando
necessario, importa o dump SQL de dados (`dump_dados_desenvolvimento.sql`).

A configuracao de producao usa `docker-compose.prod.yml`. Por padrao, apenas a
aplicacao e publicada no host (`APP_PORT`, normalmente `3004`). Postgres, Redis
e MinIO ficam apenas na rede Docker.

## Pre-requisitos

- Servidor Linux com Docker Engine e Docker Compose plugin.
- Acesso SSH ao servidor.
- Repositorio da aplicacao.
- Ficheiro `.env.production` completo.
- Dump SQL, se aplicavel: `dump_dados_desenvolvimento.sql`.

## Sobre MinIO / S3

S3 e uma API de armazenamento de ficheiros. MinIO e um servidor compativel com
essa API que pode correr no teu proprio servidor. Nesta aplicacao, ele guarda
anexos, evidencias e ficheiros enviados pelos utilizadores.

Em producao podes usar MinIO local ou trocar por AWS S3, Wasabi, Backblaze ou
outro storage compativel. Se mudares de provider, ajusta `S3_ENDPOINT`,
`S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` e
`S3_FORCE_PATH_STYLE`.

## Preparar O Servidor

No servidor:

```bash
cd /opt
git clone <repo> ma-hse
cd /opt/ma-hse
cp .env.production.example .env.production
```

Editar `.env.production` e trocar todos os valores `CHANGE_ME_*`.

Gerar segredos:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Usa um valor para `NEXTAUTH_SECRET` e outro para `TOKEN_PEPPER`.

Importante: nao alterar `TOKEN_PEPPER` depois de gerar/importar tokens QR
publicos, porque os tokens existentes deixam de validar.

## Validar `.env.production`

O ficheiro `.env.production` deve estar dentro da pasta do projeto no servidor:

```bash
/opt/ma-hse/.env.production
```

Confirma que nao ha chaves duplicadas e que todas as chaves do exemplo existem:

```bash
grep -v '^\s*#' .env.production | grep -v '^\s*$' | cut -d= -f1 | sort | uniq -d

comm -23 \
  <(grep -v '^\s*#' .env.production.example | grep -v '^\s*$' | cut -d= -f1 | sort) \
  <(grep -v '^\s*#' .env.production | grep -v '^\s*$' | cut -d= -f1 | sort)
```

O primeiro comando deve nao imprimir nada. O segundo tambem deve nao imprimir
nada.

Variaveis obrigatorias principais:

```text
APP_PORT
NODE_ENV
APP_URL
NEXT_PUBLIC_APP_URL
NEXTAUTH_URL
NEXTAUTH_SECRET
TOKEN_PEPPER
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
DATABASE_URL
REDIS_URL
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
S3_ENDPOINT
S3_REGION
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET
S3_FORCE_PATH_STYLE
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
OPENAI_API_KEY
OPENAI_TRANSLATION_MODEL
OPENAI_BASE_URL
RATE_LIMIT_POINTS
RATE_LIMIT_WINDOW_SEC
SEED_DEFAULT_PASSWORD
```

Em producao, nao usar defaults de desenvolvimento como:

```text
NEXTAUTH_SECRET=dev-secret-1234567890
TOKEN_PEPPER=dev-pepper-1234567890123456
DATABASE_URL=postgresql://ehs:ehs@localhost:5433/ehs
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
```

A aplicacao bloqueia o runtime em producao se esses defaults forem usados.

## Build Das Imagens

```bash
cd /opt/ma-hse
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

## Primeira Subida Sem Importar Dump

Usa este fluxo se queres uma base vazia/seed local de exemplo.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis minio minio-init
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

Opcionalmente, para dados seed:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run db:seed
```

Nao executes seed se vais importar o dump de dados, porque o dump ja contem
utilizadores, plantas, roles, tokens e dados operacionais.

## Primeira Subida Com Importacao Do Dump SQL

Este e o fluxo recomendado quando vais importar
`dump_dados_desenvolvimento.sql`.

### 1. Copiar O Dump Para O Servidor

No servidor:

```bash
cd /opt/ma-hse
mkdir -p import backups
```

No teu computador:

```bash
scp dump_dados_desenvolvimento.sql <user>@<servidor>:/opt/ma-hse/import/
```

No servidor:

```bash
cd /opt/ma-hse
ls -lh import/dump_dados_desenvolvimento.sql
```

### 2. Subir Infraestrutura

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis minio minio-init
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Espera `postgres`, `redis` e `minio` ficarem `healthy`.

### 3. Aplicar Migrations

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
```

### 4. Preparar O Dump Para Importacao

O dump recebido e um dump de dados. Ele inclui tambem dados da tabela interna
`_prisma_migrations`. Como as migrations ja foram aplicadas no passo anterior,
esse bloco deve ser removido antes da importacao.

Gerar uma copia filtrada:

```bash
awk '
  /^COPY public\._prisma_migrations / { skip=1; next }
  skip && /^\\\.$/ { skip=0; next }
  !skip { print }
' import/dump_dados_desenvolvimento.sql > import/dump_dados_import.sql
```

### 5. Importar Dados

Importar na base criada pelas migrations:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < import/dump_dados_import.sql
```

Se este comando falhar, nao continues o deploy. Corrige a causa, recria a base
ou restaura backup, e repete migrations + import.

### 6. Validar Dados Importados

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select 'Plant' as table_name, count(*) from "Plant"
union all select 'User', count(*) from "User"
union all select 'Communication', count(*) from "Communication"
union all select 'Action', count(*) from "Action"
union all select 'SEWO', count(*) from "SEWO"
union all select 'PlantMonthlyInput', count(*) from "PlantMonthlyInput"
order by table_name;
SQL
```

Para o dump validado localmente, as contagens esperadas principais eram:

```text
Action: 30
Communication: 250
Plant: 20
PlantMonthlyInput: 104
SEWO: 4
User: 19
```

### 7. Agendar Jobs E Subir App

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

## Validacao Pos-Deploy

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -f http://localhost:${APP_PORT:-3004}/api/health/live
curl -f http://localhost:${APP_PORT:-3004}/api/health/ready
```

O endpoint `/api/health/ready` deve responder:

```json
{
  "ok": true,
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "storage": "ok"
  }
}
```

Testar login com um utilizador importado e trocar as senhas padrao quando
aplicavel.

## Reimportar Dump Em Ambiente Ja Inicializado

Se ja subiste app/seed/dados antes, nao importes por cima de uma base com dados:
vao ocorrer conflitos de chaves primarias e unicas.

Antes de reimportar em pre-producao ou antes do go-live:

```bash
cd /opt/ma-hse
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > backups/backup-before-reimport-$(date +%Y%m%d-%H%M%S).sql

docker compose --env-file .env.production -f docker-compose.prod.yml stop app worker
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
```

Depois repete os passos de preparacao/importacao do dump e volta a subir:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

Usa este procedimento apenas se tens certeza de que a base pode ser substituida.

## Deploy De Atualizacao

Para atualizar codigo sem reimportar dados:

```bash
cd /opt/ma-hse
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

Validar:

```bash
curl -f http://localhost:${APP_PORT:-3004}/api/health/ready
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 app worker
```

## Nginx Opcional

Se usares Nginx/HTTPS, podes manter a porta `3004` apenas local alterando o
compose para:

```yaml
ports:
  - "127.0.0.1:3004:3000"
```

Nesse caso, `APP_URL`, `NEXT_PUBLIC_APP_URL` e `NEXTAUTH_URL` devem apontar para
o dominio HTTPS final, por exemplo:

```text
https://hse.seudominio.com
```

## Firewall

Se nao houver Nginx na frente:

```bash
sudo ufw allow 3004/tcp
```

Se houver Nginx, publica apenas `80/443` e deixa a app restrita a
`127.0.0.1:3004`.

## Backups

Backup minimo antes de atualizacoes importantes:

```bash
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > backups/backup-ma-hse-$(date +%Y%m%d-%H%M%S).sql
```

Tambem preservar o volume `minio_data`, pois ele contem anexos/evidencias.

Para restaurar um backup SQL numa base vazia:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < backups/backup.sql
```

## Validacao Tecnica Feita Localmente

Antes de atualizar este guia, foi validado localmente:

- `prisma validate`: schema valido.
- Base temporaria criada com todas as migrations atuais.
- Importacao do dump `dump_dados_desenvolvimento.sql` passou apos remover o
  bloco `_prisma_migrations`.
- O dump contem dados para 59 tabelas publicas.
- Nao foram encontrados comandos `setval`/sequences no dump.

## Notas De Seguranca

- Nao publicar portas de Postgres, Redis, MinIO API ou console em producao.
- Usar senhas fortes para Postgres e MinIO.
- Usar SMTP real com TLS quando possivel.
- Trocar senhas de utilizadores importados apos o primeiro acesso.
- Proteger `.env.production`; ele contem segredos de producao.
- Nao versionar dumps reais nem `.env.production`.
- `npm audit` ainda reporta `nodemailer` via `next-auth` v4. O codigo nao usa
  as opcoes vulneraveis `name` ou `envelope.size`, mas a dependencia deve ser
  revista quando houver versao compativel do NextAuth/Auth.js.
