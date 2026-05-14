# Deploy MA HSE em Linux

Este guia sobe a aplicacao em Docker sem expor banco, Redis ou MinIO no host.
A unica porta publicada por padrao e a `3004`.

## O que e MinIO / S3

S3 e uma API de armazenamento de ficheiros criada pela AWS. MinIO e um servidor
compativel com essa API que pode rodar no teu proprio servidor. Nesta aplicacao,
ele guarda anexos, evidencias e ficheiros enviados pelos utilizadores. O codigo
fala com uma API S3; em producao podes usar MinIO local ou trocar por AWS S3,
Wasabi, Backblaze ou outro storage compativel.

## Preparar ambiente

No servidor:

```bash
cd /opt
git clone <repo> ma-hse
cd ma-hse
cp .env.production.example .env.production
```

Editar `.env.production` e trocar todos os valores `CHANGE_ME_*`.

Gerar segredos:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Usar um valor para `NEXTAUTH_SECRET` e outro para `TOKEN_PEPPER`.
Nao alterar `TOKEN_PEPPER` depois de gerar tokens QR publicos, porque os tokens
existentes deixam de validar.

## Subir primeira vez

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis minio minio-init
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

Validar:

```bash
curl http://localhost:3004/api/health/live
curl http://localhost:3004/api/health/ready
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Se o firewall estiver ativo e nao houver Nginx na frente:

```bash
sudo ufw allow 3004/tcp
```

## Deploy de atualizacao

```bash
cd /opt/ma-hse
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tasks run --rm scheduler
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app worker
```

## Nginx opcional

Se usares Nginx/HTTPS, podes manter a porta `3004` apenas local alterando o
compose para:

```yaml
ports:
  - "127.0.0.1:3004:3000"
```

Nesse caso, `APP_URL`, `NEXT_PUBLIC_APP_URL` e `NEXTAUTH_URL` devem apontar para
o dominio HTTPS final, por exemplo `https://hse.seudominio.com`.

## Backup minimo

Antes de atualizacoes importantes:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-ma-hse.sql
```

Tambem preservar o volume `minio_data`, pois ele contem os anexos.

## Notas de seguranca

- Nao publicar portas de Postgres, Redis, MinIO API ou console em producao.
- Usar senhas fortes para Postgres e MinIO.
- Usar SMTP real com TLS quando possivel.
- Remover utilizadores seed ou trocar todas as senhas apos o primeiro acesso.
- Proteger `.env.production`; ele contem segredos de producao.
- `npm audit` ainda reporta `nodemailer` via `next-auth` v4. O codigo nao usa
  as opcoes vulneraveis `name` ou `envelope.size`, mas a dependencia deve ser
  revista quando houver versao compativel do NextAuth/Auth.js.
