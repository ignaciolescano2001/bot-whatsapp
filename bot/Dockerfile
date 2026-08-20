# Build context = raíz del repo (no ./bot), para poder copiar
# informacion-barberia/ además del código del bot. Ver docker-compose.yml
# (servicio bot) y las instrucciones de deploy en el README para el
# equivalente en Railway (Root Directory "." + Dockerfile Path "bot/Dockerfile").

FROM node:20-slim AS base
WORKDIR /app
COPY bot/package*.json ./
RUN npm install

# ---- dev: la usa docker-compose local, con bind mount + hot reload ----
FROM base AS dev
COPY bot/ .
CMD ["npx", "tsx", "watch", "src/index.ts"]

# ---- build: compila TS a JS ----
FROM base AS build
COPY bot/ .
RUN npm run build

# ---- prod: imagen final, sin devDependencies ni código fuente ----
FROM node:20-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY bot/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY informacion-barberia ./informacion-barberia
CMD ["node", "dist/index.js"]
