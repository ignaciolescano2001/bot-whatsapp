# agente-whatsapp

Bot de WhatsApp para **Barbería Don Isidoro** (Capilla del Monte, Córdoba, Argentina). Responde consultas de clientes y agenda turnos reales usando OpenAI + una agenda en Supabase, con un panel web para que el dueño supervise conversaciones y gestione horarios.

## Arquitectura

Tres componentes propios + Postgres (x2) + Redis, orquestados con Docker Compose:

- **Gateway raíz** (`server.js`, Express/CommonJS): recibe el webhook de Twilio en `POST /webhook/whatsapp`, responde `200` inmediato (Twilio tiene timeout corto) y encola el mensaje en Redis (`inbox`). Usa `lib/db.js` y `lib/redis.js`.
- **`bot/`** (Node + TypeScript, ESM): el "cerebro". `bot/src/index.ts` corre un loop infinito con `BRPOP inbox/outbox` sobre Redis.
  - `inbox` → `bot/src/whatsapp/handler.ts`: transcribe audio si aplica (`transcribe.ts`), guarda el mensaje en Postgres, si la conversación está en modo `AI` llama a `openai.ts` con el historial reciente (últimas 20 msgs / 8hs).
  - `openai.ts` corre un loop de tool-calling (hasta 4 pasos) con 4 tools: `consultar_disponibilidad`, `crear_turno`, `derivar_a_humano`, `notificar_peluquero`.
  - La respuesta se envía recién después de `BOT_REPLY_DELAY_MS` (~20s, no bloqueante) para que no se sienta instantánea/robótica.
  - `outbox` → mensajes tipeados a mano desde el panel (modo `HUMAN`), se envían tal cual por Twilio.
  - Agenda real: `bot/src/agenda.ts` contra `SUPABASE_DATABASE_URL` (slots de 30min, horarios hardcodeados, `horarios_fijos`, `excepciones_agenda`, `turnos`).
- **`panel/`** (Next.js 16 + React 19 + Tailwind v4): dashboard admin gateado por contraseña única (`panel/src/lib/auth.ts`, sesión con cookie firmada HMAC). Ver/tomar control de conversaciones (encola a `outbox`), gestionar turnos, horarios fijos y excepciones de agenda (cierres, ausencias, horario especial).

Transporte WhatsApp: **Twilio Sandbox** (`bot/src/twilio/client.ts`) es el canal actual/primario. **WhatsApp Cloud API de Meta** (`bot/src/cloudapi/client.ts`, webhook en `panel/src/app/api/whatsapp/webhook`) es un canal alternativo/legacy que sigue andando. Hay restos vestigiales de una integración Baileys previa (`data/auth/`, `bot/auth/`) que no se usan — no tocar.

### Dos bases de datos separadas
- `DATABASE_URL`: Postgres local (Docker) — `conversations`, `messages`, `connection_state`. Compartida por gateway, bot y panel.
- `SUPABASE_DATABASE_URL`: Postgres en Supabase — la agenda real (`turnos`, `horarios_fijos`, `peluqueros`, `servicios`, `excepciones_agenda`). Sin herramienta de migraciones; `db/excepciones_agenda.sql` es solo referencia manual de lo que se corrió a mano en Supabase.

### ⚠️ Lógica de agenda duplicada
`bot/src/agenda.ts` y `panel/src/lib/agenda-db.ts` (+ `panel/src/lib/slots.ts`) implementan la **misma lógica** de slots/excepciones por separado (el código en `agenda-db.ts` lo dice explícitamente: "idéntica a bot/src/agenda.ts"). Si cambiás la lógica de horarios/excepciones en un lado, replicá el cambio en el otro.

## Dónde vive el contenido que dice el bot

- `bot/src/system-prompt.ts` arma el prompt **en cada mensaje** (no es una constante estática): incluye la fecha de hoy y una tabla de los próximos 9 días, para evitar que el modelo alucine fechas.
- La fuente de verdad factual real en runtime son los archivos **`informacion-barberia/*.md`** (horarios, servicios, datos de contacto, preguntas frecuentes) — symlinkeados en `bot/informacion-barberia`. Para cambiar precios/horarios/FAQs del bot, editar estos archivos.
- `project.md` (raíz) es un documento de referencia extenso (persona, reglas, ejemplos de conversación) pensado para diseño/humanos — **no se carga en runtime**. No confundirlo con `informacion-barberia/`.

## Comandos

```bash
./scripts/dev-twilio.sh      # levanta todo: Postgres+Redis (Docker), bot (tsx watch),
                              # gateway, panel (:3001), túnel ngrok. Logs en .dev-logs/
```

Por paquete (`bot/` y `panel/`): `npm run dev`, `build`, `start`, `typecheck`. Raíz: `npm run dev` (`node --watch --env-file=.env server.js`).

Tests (sin framework, scripts standalone con `tsx`, assertions a mano, sin tocar DB real):
```bash
cd bot && npm run test:excepciones
cd panel && npm run test:excepciones
```

No hay linter configurado (sin ESLint/Prettier).

## Variables de entorno clave (ver `.env.example`)

- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL` (usar `gpt-4o` — `gpt-4o-mini` causó alucinaciones), `OPENAI_TRANSCRIBE_MODEL`.
- `SUPABASE_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL` (estas dos últimas solo si corrés bot/gateway fuera de Docker).
- `NOTIFY_WHATSAPP_JID` (celular del dueño), `BOT_REPLY_DELAY_MS` (default 20000).
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`.
- Cloud API de Meta (canal alternativo): `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TEMPLATE_OWNER_NOTIFICATION`.
- Panel (mandatorias): `PANEL_PASSWORD`, `PANEL_SESSION_SECRET`.

## Convenciones de commits

Mensajes en español, modo imperativo ("Agregar", "Arreglar", "Corregir"), línea corta + párrafo explicando el *por qué* / causa raíz (no solo el qué). Terminan con:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## Seguridad / producción

Antes de producción: sin secretos en código, sacar la exposición de puertos 5432/6379 (solo debug local), tener en cuenta las limitaciones del auth de contraseña única del panel, y validar la autenticidad del webhook (firma de Twilio/Meta). Detalle completo en `README.md`.

## Pendientes conocidos

Soporte de imágenes/stickers, manejo de mensajes de grupo, WebSockets en vez de polling en el panel, cancelación/reagendado de turnos por el bot.

## Otros docs

- `README.md` — guía completa de setup y arquitectura.
- `DEPLOY.md` — deploy a Railway.
- `project.md` — persona y reglas de negocio extendidas (referencia, no runtime).
- `informacion-barberia/LEEME.md` — cómo editar el contenido que usa el bot.
## el servidor de produccion 

se accede con: ssh agente-whatsapp "<comando>"
Reglas:
- Nunca ejecutar un comando en el servidor sin explicarme antes qué hace
- Nunca tocar nada de /etc/ssh/. Si hace falta, me avisás y lo hago yo
- Nunca borrar volúmenes de Docker
- Después de cada cambio, verificar con un comando y mostrarme la salida
- Si algo falla, parar y avisar. No intentar arreglarlo por tu cuenta