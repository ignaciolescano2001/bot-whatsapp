#!/usr/bin/env bash
#
# Backup del Postgres local (conversaciones, mensajes y estado del bot).
# NO incluye los turnos reales: esos viven en Supabase (SUPABASE_DATABASE_URL
# en .env), fuera del volumen Docker que respalda este script.
#
# Uso:
#   ./scripts/backup-db.sh
#
# Restaurar un dump:
#   gunzip -c backups/whatsapp_bot-<timestamp>.sql.gz | \
#     docker compose exec -T postgres psql -U botuser -d whatsapp_bot
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

POSTGRES_USER="${POSTGRES_USER:-botuser}"
POSTGRES_DB="${POSTGRES_DB:-whatsapp_bot}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

echo "Generando backup de ${POSTGRES_DB}..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT_FILE"

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "Backup listo: $OUT_FILE ($SIZE)"

find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete
