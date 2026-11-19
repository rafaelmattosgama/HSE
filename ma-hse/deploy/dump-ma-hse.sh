#!/usr/bin/env bash
# =============================================================================
# dump-ma-hse: READ-ONLY export of the MAx Safety production data.
#
# What it does:
#   1. pg_dump (custom format) of the PostgreSQL database.
#   2. Optional (--with-files): copy of the attachments bucket in MinIO.
#   3. Writes the files to EXPORT_DIR, owned by the user who called sudo,
#      plus a SHA-256 checksum file.
#
# What it never does: it does not stop, restart, migrate or rebuild any
# container, and it does not write to the database or to MinIO. pg_dump only
# reads (one consistent snapshot); "mc mirror" only reads from the bucket and
# writes to the local export folder.
#
# Installation (server administrator, once):
#   sudo install -o root -g root -m 0750 deploy/dump-ma-hse.sh /usr/local/sbin/dump-ma-hse
#   # Allow one user to run only this command (visudo -f /etc/sudoers.d/dump-ma-hse):
#   #   <user> ALL=(root) NOPASSWD: /usr/local/sbin/dump-ma-hse, /usr/local/sbin/dump-ma-hse --with-files
#
# Usage:
#   sudo /usr/local/sbin/dump-ma-hse               # database only
#   sudo /usr/local/sbin/dump-ma-hse --with-files  # database + attachments
#
# Then, from the developer PC:
#   scp <user>@<server>:/var/backups/ma-hse-export/<file> .
#
# The export contains personal and health data (GDPR): transfer it only over
# SSH/scp, never by email, and delete it when it is no longer needed.
# =============================================================================
set -euo pipefail
umask 077

APP_DIR="/opt/ma-hse"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
EXPORT_DIR="/var/backups/ma-hse-export"
KEEP_EXPORTS=3          # older exports are deleted
MIN_FREE_MB=2048        # refuse to start below this free space
LOCK_FILE="/run/lock/dump-ma-hse.lock"

log() { printf '[dump-ma-hse] %s\n' "$*"; }
fail() { printf '[dump-ma-hse] ERRO: %s\n' "$*" >&2; exit 1; }

# --- Arguments: only "--with-files" is accepted --------------------------------
WITH_FILES=0
case "${1:-}" in
  "") ;;
  --with-files) WITH_FILES=1 ;;
  *) fail "argumento desconhecido: $1 (use apenas --with-files)" ;;
esac
[[ $# -le 1 ]] || fail "demasiados argumentos"

[[ $EUID -eq 0 ]] || fail "correr com sudo"

# --- One run at a time ----------------------------------------------------------
exec 9>"$LOCK_FILE"
flock -n 9 || fail "ja existe uma exportacao em curso"

cd "$APP_DIR" || fail "pasta $APP_DIR nao encontrada"
[[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || fail "$ENV_FILE ou $COMPOSE_FILE em falta em $APP_DIR"
DC=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# Database name and user from the compose environment (defaults as in compose).
PG_USER="$(sed -n 's/^POSTGRES_USER=//p' "$ENV_FILE" | tail -n1 | tr -d '"'"'"'')"
PG_DB="$(sed -n 's/^POSTGRES_DB=//p' "$ENV_FILE" | tail -n1 | tr -d '"'"'"'')"
PG_USER="${PG_USER:-ehs}"
PG_DB="${PG_DB:-ehs}"
[[ "$PG_USER" =~ ^[A-Za-z0-9_]+$ && "$PG_DB" =~ ^[A-Za-z0-9_]+$ ]] || fail "POSTGRES_USER/POSTGRES_DB invalidos"

# The postgres container must already be running: this script never starts it.
"${DC[@]}" ps --status running --services | grep -qx postgres || fail "o container postgres nao esta a correr"

# --- Output folder and free space -------------------------------------------------
install -d -o root -g root -m 0755 "$EXPORT_DIR"
FREE_MB="$(df -Pm "$EXPORT_DIR" | awk 'NR==2 {print $4}')"
[[ "$FREE_MB" -ge "$MIN_FREE_MB" ]] || fail "espaco livre insuficiente em $EXPORT_DIR (${FREE_MB} MB)"

STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$EXPORT_DIR/ehs-prod-$STAMP.dump"
FILES_ARCHIVE="$EXPORT_DIR/minio-prod-$STAMP.tgz"
SUM_FILE="$EXPORT_DIR/ehs-prod-$STAMP.sha256"
TMP_DIR=""

cleanup() {
  local status=$?
  [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"
  if [[ $status -ne 0 ]]; then
    rm -f "$DUMP_FILE.partial" "$FILES_ARCHIVE.partial"
    log "exportacao falhou; ficheiros parciais removidos"
  fi
}
trap cleanup EXIT

# --- 1. Database (read-only snapshot) -------------------------------------------
log "a exportar a base de dados $PG_DB ..."
"${DC[@]}" exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner --no-privileges \
  > "$DUMP_FILE.partial"
[[ -s "$DUMP_FILE.partial" ]] || fail "o dump ficou vazio"
mv "$DUMP_FILE.partial" "$DUMP_FILE"
log "base de dados: $(du -h "$DUMP_FILE" | cut -f1)"

# --- 2. Attachments (optional, read-only mirror) ----------------------------------
if [[ $WITH_FILES -eq 1 ]]; then
  log "a copiar os anexos do MinIO ..."
  TMP_DIR="$(mktemp -d "$EXPORT_DIR/.minio-$STAMP.XXXXXX")"
  # Runs the one-off mc container from the compose file without starting or
  # recreating any other service (--no-deps). It only reads from the bucket.
  "${DC[@]}" run --rm --no-deps -T -v "$TMP_DIR:/out" --entrypoint sh minio-init -c \
    'mc alias set -- prod http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
     mc mirror --quiet prod/"${S3_BUCKET:-ehs-attachments}" /out'
  tar -czf "$FILES_ARCHIVE.partial" -C "$TMP_DIR" .
  mv "$FILES_ARCHIVE.partial" "$FILES_ARCHIVE"
  rm -rf "$TMP_DIR"; TMP_DIR=""
  log "anexos: $(du -h "$FILES_ARCHIVE" | cut -f1)"
fi

# --- 3. Checksums, ownership and retention ----------------------------------------
( cd "$EXPORT_DIR" && sha256sum "$(basename "$DUMP_FILE")" \
    $([[ $WITH_FILES -eq 1 ]] && basename "$FILES_ARCHIVE") ) > "$SUM_FILE"

OWNER="${SUDO_USER:-root}"
for file in "$DUMP_FILE" "$SUM_FILE" $([[ $WITH_FILES -eq 1 ]] && echo "$FILES_ARCHIVE"); do
  chown "$OWNER": "$file"
  chmod 0400 "$file"
done

# Keep only the newest KEEP_EXPORTS exports (dump + checksum + attachments).
mapfile -t OLD_STAMPS < <(ls -1t "$EXPORT_DIR"/ehs-prod-*.dump 2>/dev/null \
  | tail -n +"$((KEEP_EXPORTS + 1))" | sed -E 's#.*/ehs-prod-(.*)\.dump#\1#')
for old in "${OLD_STAMPS[@]}"; do
  rm -f "$EXPORT_DIR/ehs-prod-$old.dump" "$EXPORT_DIR/ehs-prod-$old.sha256" "$EXPORT_DIR/minio-prod-$old.tgz"
  log "exportacao antiga removida: $old"
done

log "concluido:"
ls -lh "$DUMP_FILE" "$SUM_FILE" $([[ $WITH_FILES -eq 1 ]] && echo "$FILES_ARCHIVE")
log "lembrete: contem dados pessoais e de saude; transferir so por scp e apagar quando ja nao for necessario."
