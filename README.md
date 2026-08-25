# Agente de WhatsApp — Barbería Don Isidoro

Bot de atención y reserva de turnos por WhatsApp para una barbería, con un
panel web de administración. El bot responde con OpenAI, conoce el negocio
por los archivos en `informacion-barberia/`, y puede consultar y reservar
turnos reales contra la agenda (con horarios fijos, excepciones puntuales y
disponibilidad por peluquero). El panel deja ver conversaciones, intervenir a
mano, y gestionar la agenda (turnos, horarios fijos y excepciones).

## Arquitectura

- **postgres** — conversaciones y mensajes del bot (`DATABASE_URL`).
- **Supabase (Postgres)** — la agenda del negocio: `turnos`, `horarios_fijos`,
  `peluqueros`, `servicios` y `excepciones_agenda` (`SUPABASE_DATABASE_URL`).
  Es una base aparte, sin herramienta de migraciones; el esquema de
  `excepciones_agenda` está documentado en [`db/excepciones_agenda.sql`](./db/excepciones_agenda.sql).
- **redis** — cola de mensajes (`inbox`/`outbox`) entre el gateway de Twilio,
  el bot y el panel.
- **server.js** — gateway Express que recibe el webhook de **Twilio WhatsApp
  Sandbox** (`/webhook/whatsapp`), responde `200` al instante (Twilio tiene
  timeout corto) y encola el mensaje en Redis.
- **bot/** — proceso Node/TypeScript que consume la cola, arma el contexto
  (system prompt + info de la barbería + herramientas de agenda), llama a
  OpenAI y contesta por Twilio. Es el servicio crítico: si el panel se cae,
  el bot sigue respondiendo.
- **panel/** — dashboard Next.js. Muestra conversaciones (con toggle IA /
  Humano por chat), y las vistas de agenda: turnos del día, agenda semanal,
  horarios fijos y excepciones (cierres, ausencias, horarios especiales).
  Login por contraseña única.

## Requisitos

- Node.js y Docker (para Postgres y Redis en local).
- Una cuenta de OpenAI con **facturación activa** (`OPENAI_API_KEY`).
- Un proyecto de **Supabase** con las tablas de agenda ya creadas
  (`turnos`, `horarios_fijos`, `peluqueros`, `servicios`,
  `excepciones_agenda`).
- Una cuenta de **Twilio** con el WhatsApp Sandbox activado
  (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`) — ver
  console.twilio.com → Messaging → Try it out → WhatsApp.
- Para desarrollo local, un túnel público hacia el gateway (`ngrok` o
  similar) — Twilio necesita poder pegarle al webhook desde internet.
- `ngrok` instalado y autenticado si usás `scripts/dev-twilio.sh` (ver
  Arranque más abajo).

## Arranque rápido

1. Copiá `.env.example` a `.env` y completá `OPENAI_API_KEY`,
   `SUPABASE_DATABASE_URL`, las variables `TWILIO_*`, y `PANEL_PASSWORD` /
   `PANEL_SESSION_SECRET` (esta última generala con `openssl rand -hex 32`):
   ```bash
   cp .env.example .env
   ```

2. Con Docker corriendo, un solo comando levanta todo el flujo de
   prueba (Postgres, Redis, `bot/`, el gateway Twilio y el panel) y un túnel
   de ngrok:
   ```bash
   ./scripts/dev-twilio.sh
   ```
   Al final imprime la URL pública que hay que pegar en Twilio (**Sandbox
   Configuration → When a message comes in**, método `POST`) y la URL del
   panel (`http://localhost:3001`). `Ctrl+C` detiene todo salvo
   Postgres/Redis (`docker compose stop postgres redis` para pararlos
   también).

3. Sumá tu número al sandbox de Twilio (mandándole el código `join <palabra>`
   por WhatsApp al número del sandbox) y escribile al bot.

Alternativa manual, servicio por servicio: `docker compose up -d postgres
redis`, luego `npm run dev` en `bot/`, `node --watch --env-file=.env
server.js` en la raíz, y `npm run dev` en `panel/`.

## Personalizar el bot

- **Personalidad y reglas de respuesta:** `bot/src/system-prompt.ts`.
- **Info del negocio** (horarios, servicios y precios, preguntas frecuentes,
  datos de contacto) que el bot usa como contexto: los `.md` en
  `informacion-barberia/`.
- Con el bot corriendo en modo dev (`tsx watch`), los cambios se aplican
  solos.

## Uso del panel

- **Conversaciones:** lista a la izquierda con badge **IA** / **HUMANO** por
  chat; toggle para pasar el control a un humano (habilita el composer,
  encola la respuesta para que el bot la mande por WhatsApp).
- **Turnos:** vista del día y agenda semanal por peluquero, con detalle y
  alta manual de turnos.
- **Horarios fijos:** franjas habituales de atención por día.
- **Excepciones:** cierres puntuales (feriados), ausencias de un peluquero, u
  horarios especiales para una fecha concreta — el bot las respeta al
  consultar disponibilidad.

## Tests

Cada lado (`bot/` y `panel/`) tiene un script standalone que ejercita las
funciones puras de resolución de excepciones y generación de slots, sin
tocar la base real:

```bash
cd bot && npm run test:excepciones
cd panel && npm run test:excepciones
```

## Troubleshooting

- **El bot no contesta:** revisá los logs de `bot/` — confirmá que
  `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_WHATSAPP_NUMBER` están
  bien seteadas y que Redis está healthy (`docker compose ps`).
- **Twilio no llega al webhook:** confirmá que la URL del sandbox apunta a
  `<tu-túnel>/webhook/whatsapp` (método `POST`) y que el túnel sigue activo.
- **Error de OpenAI 401 o 429:** revisá `OPENAI_API_KEY` y que la cuenta
  tenga facturación activa.
- **El bot no ve la agenda / turnos:** revisá `SUPABASE_DATABASE_URL` y que
  las tablas de agenda existan en ese proyecto de Supabase.
- **El panel no levanta o no recarga en caliente (vía Docker):** confirmá que
  el proyecto vive en el filesystem de WSL (no en `/mnt/c/...`) y que el
  volumen anónimo `/app/node_modules` sigue presente en
  `docker-compose.yml` para los servicios `bot` y `panel`.

## ⚠️ Seguridad — bloqueante para producción

1. Ninguna credencial va en el código. Todo por variables de entorno. `.env`,
   `data/` y `backups/` están en `.gitignore`.
2. Los puertos de Postgres (5432) y Redis (6379) están expuestos en
   `docker-compose.yml` **solo para poder inspeccionarlos en local**. Antes de
   desplegar en un servidor, sacá esos `ports` — los servicios deben hablarse
   únicamente por la red interna de Docker.
3. **El panel tiene autenticación por contraseña única** (pensada para un solo
   admin, el dueño del negocio). Se configura con `PANEL_PASSWORD` y
   `PANEL_SESSION_SECRET` en `.env` — sin esas dos variables el panel no deja
   entrar a nadie. El middleware (`panel/src/middleware.ts`) protege todas
   las rutas salvo `/login`, `/api/auth/login` y el webhook de WhatsApp (que
   se valida por su cuenta, no con esta sesión). La sesión es una cookie
   `httpOnly` firmada con HMAC-SHA256, vence a los 30 días. No hay múltiples
   usuarios ni roles — si el negocio necesita eso a futuro, conviene migrar a
   algo como BetterAuth o Auth.js. Para producción, sumale igual TLS a nivel
   de reverse proxy — esta auth no reemplaza HTTPS.
4. Validá siempre la autenticidad de los webhooks entrantes en producción
   (firma de Twilio, o `WHATSAPP_APP_SECRET` si se usa la Cloud API de Meta)
   — sin eso, cualquiera podría inyectar mensajes falsos.

## Deploy

Ver [`DEPLOY.md`](./DEPLOY.md) para una guía de referencia (Railway con
Postgres y Redis administrados). Escrita para la variante con WhatsApp Cloud
API — si el deploy final usa Twilio, ajustá las variables de entorno y el
servicio del gateway (`server.js`) según corresponda.

## Mejoras pendientes

- Soporte de mensajes de imagen y sticker (hoy se ignoran; audio ya se
  transcribe).
- Manejo de mensajes de grupos (hoy se ignoran).
- WebSockets en vez de polling para el panel.
- Cancelación y reprogramación de turnos desde el bot (hoy solo lo gestiona
  una persona del local).
