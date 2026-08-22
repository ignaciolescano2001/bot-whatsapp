#!/usr/bin/env bash
#
# Levanta todo el flujo de prueba de Twilio WhatsApp Sandbox con un solo
# comando: Postgres + Redis (Docker), el proceso bot/ (OpenAI + Supabase),
# el gateway Express (server.js), el panel (Next.js) y un túnel de ngrok.
#
# Uso:
#   ./scripts/dev-twilio.sh
#
# Ctrl+C detiene bot/, el gateway, el panel y ngrok. Postgres/Redis quedan
# corriendo en Docker (para pararlos: docker compose stop postgres redis).
#
# Requiere: docker, node, y ngrok ya autenticado (ngrok config add-authtoken).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

cd "$REPO_ROOT"

if ! ngrok config check >/dev/null 2>&1; then
  echo "Falta configurar el authtoken de ngrok. Corré:"
  echo "  ngrok config add-authtoken <TU_AUTHTOKEN>"
  echo "(lo sacás de https://dashboard.ngrok.com/get-started/your-authtoken)"
  exit 1
fi

echo "==> Levantando Postgres y Redis..."
docker compose up -d postgres redis

echo "==> Esperando a que Postgres y Redis estén listos..."
until docker compose exec -T postgres pg_isready -U botuser -d whatsapp_bot >/dev/null 2>&1; do sleep 1; done
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do sleep 1; done

PIDS=()

cleanup() {
  echo
  echo "==> Deteniendo bot/, gateway y ngrok..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

echo "==> Levantando bot/ (OpenAI + Supabase)..."
(cd "$REPO_ROOT/bot" && exec node --env-file="$REPO_ROOT/.env" ./node_modules/.bin/tsx watch src/index.ts) \
  > "$LOG_DIR/bot.log" 2>&1 &
PIDS+=("$!")

echo "==> Levantando el gateway Twilio (server.js) en :3000..."
(cd "$REPO_ROOT" && exec node --watch --env-file=.env server.js) \
  > "$LOG_DIR/server.log" 2>&1 &
PIDS+=("$!")

echo "==> Levantando el panel (dashboard) en :3001..."
(cd "$REPO_ROOT/panel" && exec ./node_modules/.bin/next dev -H 0.0.0.0 -p 3001) \
  > "$LOG_DIR/panel.log" 2>&1 &
PIDS+=("$!")

echo "==> Levantando ngrok..."
(exec ngrok http 3000 --log=stdout) > "$LOG_DIR/ngrok.log" 2>&1 &
PIDS+=("$!")

echo "==> Esperando la URL pública de ngrok..."
NGROK_URL=""
for _ in $(seq 1 30); do
  NGROK_URL="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.tunnels?.[0]?.public_url||"");}catch{console.log("")}})' \
    || true)"
  [ -n "$NGROK_URL" ] && break
  sleep 1
done

echo
echo "================================================================"
if [ -n "$NGROK_URL" ]; then
  echo "Webhook listo. Pegá esta URL (método POST) en Twilio:"
  echo "  ${NGROK_URL}/webhook/whatsapp"
else
  echo "No se pudo obtener la URL de ngrok, revisá $LOG_DIR/ngrok.log"
fi
echo "Panel (dashboard): http://localhost:3001"
echo "================================================================"
echo "Logs en vivo (Ctrl+C para detener todo):"
echo

tail -f "$LOG_DIR/bot.log" "$LOG_DIR/server.log" "$LOG_DIR/panel.log" "$LOG_DIR/ngrok.log" &
PIDS+=("$!")

wait
