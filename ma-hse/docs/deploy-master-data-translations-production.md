# Deploy de traduções de Master Data em produção

Este procedimento é para o repositório MA-HSE e não elimina volumes nem dados. O deploy documentado é manual, usa a branch `main`, o ficheiro `docker-compose.prod.yml` e os serviços Compose `postgres`, `redis`, `minio`, `minio-init`, `app`, `worker` e `migrate`.

SHA de aplicação validado localmente: `6ed1c9675e125a6d7740d99147db20579e2546d3`.

> Antes de usar este SHA no servidor, rever e versionar o diff operacional que acompanha este documento (`.gitignore`, `docker-compose.prod.yml` e `playwright.config.ts`). Se esse diff for commitado, o SHA do deploy deve ser o novo commit descendente e deve substituir o SHA acima em todos os comandos.

## 1. Pré-requisitos e atualização do código

Execute em PowerShell no diretório do projeto:

```powershell
$TargetSha = '6ed1c9675e125a6d7740d99147db20579e2546d3'
$Compose = @('--env-file', '.env.production', '-f', 'docker-compose.prod.yml')

git fetch origin --prune
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
git branch --show-current
git status --short --branch
```

O SHA devolvido deve ser `$TargetSha`, ou um commit descendente explicitamente aprovado que inclua o diff operacional. Confirme que o Compose contém a proteção para passwords MinIO iniciadas por hífen:

```powershell
Select-String -LiteralPath docker-compose.prod.yml -SimpleMatch 'mc alias set -- local'
```

Não prossiga se o comando não devolver uma linha.

## 2. Validar variáveis sem mostrar valores

As variáveis obrigatórias para este fluxo são `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `REDIS_URL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ENDPOINT`, `S3_BUCKET`, `TRANSLATION_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_TRANSLATION_MODEL`, `APP_ENV` e `DEPLOY_VERSION`.

```powershell
$Required = @(
  'POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','DATABASE_URL','REDIS_URL',
  'MINIO_ROOT_USER','MINIO_ROOT_PASSWORD','S3_ENDPOINT','S3_BUCKET',
  'TRANSLATION_PROVIDER','OPENAI_API_KEY','OPENAI_TRANSLATION_MODEL',
  'APP_ENV','DEPLOY_VERSION'
)
$EnvMap = @{}
foreach ($Line in Get-Content -LiteralPath .env.production) {
  if ($Line -match '^\s*#' -or $Line -notmatch '=') { continue }
  $Pair = $Line -split '=', 2
  $EnvMap[$Pair[0].Trim()] = $Pair[1]
}
foreach ($Name in $Required) {
  [pscustomobject]@{ Name = $Name; Present = -not [string]::IsNullOrWhiteSpace([string]$EnvMap[$Name]) }
}
if ($EnvMap['TRANSLATION_PROVIDER'] -ne 'openai') { throw 'TRANSLATION_PROVIDER must be openai' }
if ($EnvMap['DEPLOY_VERSION'] -ne $TargetSha) { throw 'DEPLOY_VERSION must match the approved SHA' }
```

`DATABASE_URL` deve apontar para `postgres:5432` dentro de Docker. A password incluída na URL deve ser percent-encoded quando contiver caracteres reservados.

## 3. Backup lógico antes da autenticação

```powershell
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupName = "ma-hse-pre-master-data-$Stamp.dump"
New-Item -ItemType Directory -Path backups -Force | Out-Null

docker compose @Compose exec -T postgres sh -lc 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=9 --file=/tmp/ma-hse-pre-master-data.dump'
docker compose @Compose exec -T postgres pg_restore --list /tmp/ma-hse-pre-master-data.dump | Select-Object -First 5
docker compose @Compose cp postgres:/tmp/ma-hse-pre-master-data.dump ".\backups\$BackupName"
docker compose @Compose exec -T postgres rm -- /tmp/ma-hse-pre-master-data.dump

$Backup = Get-Item -LiteralPath ".\backups\$BackupName"
if ($Backup.Length -le 0) { throw 'Backup is empty' }
Get-FileHash -Algorithm SHA256 -LiteralPath $Backup.FullName
git check-ignore backups
```

## 4. Alinhar a password efetiva do role PostgreSQL

Este comando lê a password de `.env.production`, escapa-a para SQL e envia-a por stdin; não coloca o valor no comando nem o imprime:

```powershell
$Role = [string]$EnvMap['POSTGRES_USER']
$Database = [string]$EnvMap['POSTGRES_DB']
$Password = [string]$EnvMap['POSTGRES_PASSWORD']
$EscapedRole = $Role.Replace('"', '""')
$EscapedPassword = $Password.Replace("'", "''")
$Sql = "ALTER ROLE `"$EscapedRole`" WITH LOGIN PASSWORD '$EscapedPassword';"
$Sql | docker compose @Compose exec -T postgres psql --username=$Role --dbname=$Database --set=ON_ERROR_STOP=1

docker compose @Compose exec -T app npx prisma migrate status
docker compose @Compose exec -T worker npx prisma migrate status
```

## 5. Teste sanitizado do provider OpenAI

Execute antes de iniciar o backfill. O resultado tem de ser HTTP 200. `insufficient_quota` exige regularizar a quota associada a `OPENAI_API_KEY`; não execute o backfill completo enquanto persistir.

```powershell
$ProviderCheck = @'
const base=(process.env.OPENAI_BASE_URL||"https://api.openai.com/v1").replace(/\/$/,"");
const response=await fetch(`${base}/responses`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_TRANSLATION_MODEL,input:"Return the single word OK.",max_output_tokens:16})});
let body={}; try { body=await response.json(); } catch {}
console.log(JSON.stringify({status:response.status,errorType:body?.error?.type??null,errorCode:body?.error?.code??null}));
process.exitCode=response.ok?0:1;
'@
$ProviderCheck | docker compose @Compose exec -T app node --input-type=module
```

## 6. Build, evidência do SHA e migrações

```powershell
docker compose @Compose build --pull --no-cache app worker

docker image inspect ma-hse-app:latest --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String -SimpleMatch "DEPLOY_VERSION=$TargetSha"
docker image inspect ma-hse-worker:latest --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String -SimpleMatch "DEPLOY_VERSION=$TargetSha"
docker run --rm --entrypoint test ma-hse-app:latest -f /app/scripts/backfill-master-data-translations.ts
docker run --rm --entrypoint test ma-hse-worker:latest -f /app/scripts/backfill-master-data-translations.ts

docker compose @Compose run --rm --no-deps app npx prisma migrate status
docker compose @Compose run --rm --no-deps app npm run db:migrate:deploy
docker compose @Compose run --rm --no-deps app npx prisma migrate status
```

## 7. Recriar serviços sem tocar no PostgreSQL

```powershell
docker compose @Compose up -d --force-recreate --no-deps app worker
docker compose @Compose up -d --force-recreate minio minio-init
docker compose @Compose ps -a

Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3004/api/health/live
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3004/api/health/ready
docker compose @Compose logs --since=10m app worker postgres
```

Confirme `healthy` para a app, `running` para o worker, zero ciclos de restart e ausência de `Authentication failed`, `password authentication failed`, `P1000`, erros Redis, erros storage e erros OpenAI.

## 8. Backfill real

Confirme primeiro se `PT11` existe. Se não existir, substitua por um código real de planta pequeno:

```powershell
'SELECT code FROM "Plant" ORDER BY code;' | docker compose @Compose exec -T postgres psql --username=$Role --dbname=$Database --no-align --tuples-only --set=ON_ERROR_STOP=1

docker compose @Compose exec -T app npm run db:backfill-master-data-translations -- --plant=PT11 --redetect-source-language --batch-size=20
```

O comando limitado deve terminar com `done=true`, `errors=0` e exit code 0. Só depois execute o global:

```powershell
docker compose @Compose exec -T app npm run db:backfill-master-data-translations -- --redetect-source-language --batch-size=100
```

Não use `--dry-run`. Aguarde o resumo final e exija `errors=0`.

## 9. Validação final da base

```powershell
$ValidationSql = @'
SELECT count(*) AS total FROM "MasterDataTranslation";
SELECT locale, count(*) FROM "MasterDataTranslation" GROUP BY locale ORDER BY locale;
SELECT "entityType", "field", count(*) FROM "MasterDataTranslation" GROUP BY "entityType", "field" ORDER BY "entityType", "field";
SELECT status, "isManual", count(*) FROM "MasterDataTranslation" GROUP BY status, "isManual" ORDER BY status, "isManual";
SELECT count(*) AS duplicate_groups FROM (SELECT 1 FROM "MasterDataTranslation" GROUP BY "entityType", "entityId", "field", locale HAVING count(*) > 1) d;
'@
$ValidationSql | docker compose @Compose exec -T postgres psql --username=$Role --dbname=$Database --set=ON_ERROR_STOP=1

docker compose @Compose exec -T app npx prisma migrate status
docker compose @Compose exec -T worker npx prisma migrate status
docker compose @Compose ps -a
```

O total deve ser superior a zero, `duplicate_groups` deve ser zero, não devem existir falhas finais e as linhas manuais devem manter os valores anteriores.

## 10. Rollback sem eliminar volumes

Não reverta migrações nem restaure a base automaticamente. Para voltar apenas à imagem/código anterior:

```powershell
$PreviousSha = '<SHA_ANTERIOR_APROVADO>'
git fetch origin --prune
git checkout $PreviousSha
# Atualizar DEPLOY_VERSION em .env.production para $PreviousSha sem substituir as restantes variáveis.
docker compose @Compose build --pull app worker
docker compose @Compose up -d --force-recreate --no-deps app worker
docker compose @Compose ps -a
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3004/api/health/ready
```

O backup lógico fica em `backups/`. Qualquer restauro requer aprovação explícita e uma janela de manutenção. Nunca use `docker compose down -v`, `docker volume rm` ou `prisma migrate reset`.
