# Gateway raíz (server.js): recibe el webhook de Twilio y encola en Redis.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib/ ./lib/
CMD ["node", "server.js"]
