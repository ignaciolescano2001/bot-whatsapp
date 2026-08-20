# Agente de WhatsApp (local)

Agente de atención al cliente por WhatsApp que corre 100% en tu máquina vía
Docker. Se conecta a un número real de WhatsApp con la **WhatsApp Cloud API**
de Meta (API oficial, no WhatsApp Web ni Twilio) y responde con OpenAI.
Incluye un panel web local para ver conversaciones, intervenir a mano y
togglear cada chat entre modo **IA** y modo **Humano**.

## Arquitectura

Cuatro servicios en contenedores separados, orquestados con `docker-compose`:

- **postgres** — única fuente de verdad: conversaciones, mensajes y último
  estado conocido de la conexión con Meta.
- **redis** — solo se usa como cola de mensajes (`inbox`/`outbox`). El panel
  encola ahí los mensajes entrantes que le llegan por webhook de Meta y los
  salientes que un humano escribe desde el composer; el bot los saca y
  responde.
- **bot** — proceso Node que consume las colas de Redis, llama al LLM y
  contesta por la Cloud API. Es el servicio crítico: si el panel se cae, el
  bot sigue respondiendo.
- **panel** — dashboard Next.js en `localhost:3000`. Recibe el webhook de
  Meta (`/api/whatsapp/webhook`), lo encola en Redis, y lee de Postgres con
  polling cada 2 segundos (sin WebSockets).

## Requisitos

- WSL2 + Docker instalados y corriendo.
- El proyecto tiene que vivir en el filesystem de WSL (`~/...`), **no** en
  `/mnt/c/...`, o el hot reload dentro de los contenedores no funciona.
- Una cuenta de OpenAI con **facturación activa** (sin eso, la API devuelve
  401/429 aunque la key sea válida). El costo con `gpt-4o-mini` es de
  centavos de dólar por mes en uso normal.
- Una app de Meta con el producto **WhatsApp** configurado
  (developers.facebook.com), con:
  - Un número de teléfono verificado (`WHATSAPP_PHONE_NUMBER_ID`).
  - Un token de acceso permanente (`WHATSAPP_CLOUD_API_TOKEN`) — el token
    temporal de prueba de Meta expira cada 24hs, no sirve para dejar el bot
    corriendo.
  - El **App Secret** de la app (`WHATSAPP_APP_SECRET`), para validar la
    firma de cada webhook.
  - Una URL pública que apunte a `/api/whatsapp/webhook` del panel (Meta
    necesita poder pegarle desde internet — en local hace falta un túnel
    tipo `ngrok` o similar mientras development).

## Arranque

1. Copiá `.env.example` a `.env` y completá `OPENAI_API_KEY`, las variables
   `WHATSAPP_*` con los datos de tu app de Meta, y `PANEL_PASSWORD` /
   `PANEL_SESSION_SECRET` (esta última generala con `openssl rand -hex 32`):
   ```bash
   cp .env.example .env
   ```

2. Levantá la base y la cola primero, y esperá a que estén healthy:
   ```bash
   docker compose up -d postgres redis
   docker compose ps   # esperar "healthy" en ambos
   ```

3. Levantá el bot y el panel:
   ```bash
   docker compose up bot
   ```
   En otra terminal:
   ```bash
   docker compose up panel
   ```
   Abrí `http://localhost:3000`. Mientras el token no sea válido o todavía
   no llegó ningún webhook, vas a ver una pantalla de estado en vez del
   dashboard.

4. En el panel de Meta for Developers, configurá el webhook apuntando a
   `https://<tu-url-pública>/api/whatsapp/webhook`, con el mismo
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` que pusiste en `.env`, y suscribite al
   campo `messages`. Meta hace un `GET` de verificación una sola vez al
   guardar la URL.

5. Mandale un mensaje de WhatsApp al número conectado. Cuando llega el
   primer webhook, el panel pasa solo al dashboard, sin recargar.

## Personalizar el bot

El "cerebro" del bot es `bot/src/system-prompt.ts`. Ahí se define la
personalidad y las reglas de respuesta. Editalo para adaptarlo a tu negocio —
con el bot corriendo en modo `dev` (`tsx watch`), los cambios se aplican solos.

## Uso del panel

- Lista de conversaciones a la izquierda (más reciente arriba), con badge
  **IA** (verde) o **HUMANO** (ámbar) y hora relativa del último mensaje.
- Panel de conversación a la derecha, con burbujas: mensajes del cliente a la
  izquierda, respuestas del bot o de un humano a la derecha.
- Toggle **Modo: IA / Modo: Humano** por conversación. En modo IA el input
  queda deshabilitado (responde el bot). En modo Humano se habilita el
  composer: lo que escribís se guarda al instante y se encola para que el bot
  lo mande por WhatsApp.
- Botón **Borrar** con confirmación (borra la conversación y todos sus
  mensajes).

## Troubleshooting

- **"El token de la Cloud API no es válido o no está configurado":**
  revisá `WHATSAPP_CLOUD_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en `.env`.
  Si usaste el token temporal de prueba de Meta, tené en cuenta que expira
  cada 24hs — generá uno permanente desde la app de Meta.
- **"Token válido, esperando el primer mensaje":** todavía no llegó ningún
  webhook. Confirmá que la URL configurada en Meta apunta a
  `/api/whatsapp/webhook`, que es accesible públicamente (revisá el túnel
  si estás en local), y que la app está suscripta al campo `messages`.
- **Error 401 "Invalid signature" en el webhook:** el `WHATSAPP_APP_SECRET`
  en `.env` no coincide con el de la app de Meta.
- **Error de OpenAI 401 o 429:** revisá que `OPENAI_API_KEY` esté bien seteada
  en `.env` y que la cuenta de OpenAI tenga facturación activa.
- **El panel no levanta o no recarga en caliente:** confirmá que el proyecto
  vive en el filesystem de WSL (no en `/mnt/c/...`) y que el volumen anónimo
  `/app/node_modules` sigue presente en `docker-compose.yml` para los
  servicios `bot` y `panel`. Sin ese volumen, el bind mount tapa el
  `node_modules` instalado dentro de la imagen y el contenedor arranca sin
  dependencias.

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
   las rutas salvo `/login`, `/api/auth/login` y el webhook de Meta (que se
   valida con su propia firma, no con esta sesión). La sesión es una cookie
   `httpOnly` firmada con HMAC-SHA256, vence a los 30 días. No hay múltiples
   usuarios ni roles — si el negocio necesita eso a futuro, conviene migrar a
   algo como BetterAuth o Auth.js. Para producción, sumale igual TLS a nivel
   de reverse proxy — esta auth no reemplaza HTTPS.
4. El endpoint `/api/whatsapp/webhook` valida la firma de cada request contra
   `WHATSAPP_APP_SECRET` — no lo desactives ni lo dejes sin `App Secret`
   configurado en producción, o cualquiera podría inyectar mensajes falsos.

## Mejoras pendientes (fuera de scope v1)

- Soporte de mensajes de imagen y sticker (hoy se ignoran; audio ya se
  transcribe).
- Manejo de mensajes de grupos (hoy se ignoran).
- WebSockets en vez de polling para el panel.
- Deploy a un servidor en la nube (el proyecto está pensado para que esto sea
  fácil después, gracias a la separación en servicios).
