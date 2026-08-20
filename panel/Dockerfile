FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# ---- dev: la usa docker-compose local, con bind mount + hot reload ----
FROM base AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- build: compila el standalone build de Next ----
FROM base AS build
COPY . .
RUN npm run build

# ---- prod: imagen final, sin devDependencies ni código fuente ----
FROM node:20-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
