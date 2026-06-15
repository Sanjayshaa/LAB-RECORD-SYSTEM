# Lab Record System — Node API only (server.cjs).
# Frontend: build with `npm run build` and deploy `dist/` to Vercel separately.
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.cjs ./
COPY routes ./routes
COPY middleware ./middleware
COPY services ./services

ENV NODE_ENV=production
EXPOSE 7001

CMD ["node", "server.cjs"]
