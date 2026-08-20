# Deploy a Railway

Guía para llevar `bot` y `panel` a Railway, con Postgres y Redis
administrados. El resultado es la URL pública que necesita el webhook de
WhatsApp Cloud API.

## 0. Antes de empezar

- Repo en GitHub (Railway se conecta a un repo; `git push` primero).
- Los `Dockerfile` de `bot/` y `panel/` ya son multi-stage: por defecto
  Railway construye el último stage (`prod`) sin que haya que configurar
  nada extra. El stage `dev` es solo para `docker compose` local.

## 1. Crear el proyecto y los plugins de datos

1. En [railway.app](https://railway.app), **New Project** → **Empty
   Project**.
2. **+ New** → **Database** → **Add PostgreSQL**.
3. **+ New** → **Database** → **Add Redis**.

Estos dos reemplazan a los contenedores `postgres`/`redis` de
`docker-compose.yml` — no hace falta correrlos vos.

## 2. Servicio `panel` (web, con URL pública)

1. **+ New** → **GitHub Repo** → elegí este repo.
2. En **Settings** del servicio:
   - **Root Directory**: `panel`
   - **Networking** → **Generate Domain** (puerto `3000`) — esto te da la
     URL pública (`https://<algo>.up.railway.app`).
3. En **Variables**, agregá:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   PANEL_PASSWORD=<elegí una contraseña>
   PANEL_SESSION_SECRET=<openssl rand -hex 32>
   WHATSAPP_APP_SECRET=<de developers.facebook.com>
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=<el mismo que vas a poner en Meta>
   NODE_ENV=production
   ```
   Las referencias `${{Postgres.DATABASE_URL}}` y `${{Redis.REDIS_URL}}`
   apuntan a los plugins creados en el paso 1 — Railway las resuelve solo,
   no hace falta copiar strings de conexión a mano.

## 3. Servicio `bot` (worker, sin URL pública)

1. **+ New** → **GitHub Repo** → mismo repo otra vez (Railway permite
   varios servicios sobre el mismo repo).
2. En **Settings** del servicio:
   - **Root Directory**: dejalo vacío (raíz del repo) — el `Dockerfile`
     del bot necesita el contexto de build en la raíz para poder copiar
     `informacion-barberia/`.
   - **Build** → **Dockerfile Path**: `bot/Dockerfile`
   - **Networking**: no generes dominio — este servicio no escucha HTTP,
     solo consume las colas de Redis.
3. En **Variables**:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   OPENAI_API_KEY=<tu key>
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
   SUPABASE_DATABASE_URL=<la de agenda/turnos>
   NOTIFY_WHATSAPP_JID=<número de Ignacio en E.164>
   WHATSAPP_CLOUD_API_TOKEN=<permanente, no el temporal de 24hs>
   WHATSAPP_PHONE_NUMBER_ID=<de Meta>
   WHATSAPP_BUSINESS_ACCOUNT_ID=<de Meta>
   WHATSAPP_TEMPLATE_OWNER_NOTIFICATION=notificacion_dueno
   WHATSAPP_GRAPH_API_VERSION=v21.0
   NODE_ENV=production
   ```

El panel también necesita las variables `WHATSAPP_*`/`OPENAI_*` si en algún
momento las usa directamente (hoy el webhook solo usa `WHATSAPP_APP_SECRET`
y `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, que ya están en el paso 2) — si agregás
funcionalidad al panel que las necesite, sumalas ahí también.

## 4. Configurar el webhook en Meta

En developers.facebook.com → tu app → WhatsApp → Configuration:

- **Callback URL**: `https://<tu-dominio-de-panel>.up.railway.app/api/whatsapp/webhook`
- **Verify token**: el mismo valor que pusiste en `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Suscribite al campo **messages**.

Meta hace un `GET` de verificación al guardar — si el `panel` está arriba y
el token coincide, queda confirmado al toque.

## 5. Notas

- **No repliques los `ports` de `docker-compose.yml`** (5432/6379) en
  Railway — los plugins de Postgres/Redis ya manejan su propia red interna,
  privada por defecto.
- Los healthchecks/`depends_on` de `docker-compose.yml` son solo para local;
  en Railway cada servicio arranca de forma independiente, sin ese orden
  garantizado. La conexión a Redis (`redis.ts`) reconecta sola si Redis
  todavía no está listo. La conexión a Postgres al arrancar (`initSchema()`
  en `db.ts`) **no** tiene reintento propio: si falla, el proceso corta con
  `exit(1)`. En Railway esto no suele ser un problema porque el plugin de
  Postgres arranca rápido y, si igual pasara, el restart policy por defecto
  del servicio lo vuelve a levantar — pero si ves el `bot` reiniciándose en
  loop al desplegar por primera vez, es señal de que está arrancando antes
  de que Postgres esté disponible.
- Para actualizar: cada `git push` a la rama conectada dispara un rebuild
  automático de los servicios en Railway.
