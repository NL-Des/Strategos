# Contexte de build : racine du dépôt (voir docker-compose.yml).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @strategos/backend build \
 && pnpm deploy --legacy --filter @strategos/backend --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
# pg_dump et pg_restore des sauvegardes (11), de la même version que la base.
RUN apk add --no-cache postgresql18-client
WORKDIR /app
COPY --from=build /out .
EXPOSE 3000
# Applique les migrations en attente, puis démarre le serveur.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
