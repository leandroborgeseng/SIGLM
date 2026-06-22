# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    fontconfig libfontconfig1 libfreetype6 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=@leis-municipais/api --include-workspace-root

COPY apps/api ./apps/api
RUN npm run db:generate --workspace=@leis-municipais/api
RUN npm run build --workspace=@leis-municipais/api

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=@leis-municipais/api --include-workspace-root --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p uploads uploads/attachments .tesseract-cache

# Pré-baixa modelo OCR português (evita timeout na primeira requisição)
RUN node -e "const {createWorker}=require('tesseract.js');const p=require('path');(async()=>{const w=await createWorker('por',1,{cachePath:p.join(process.cwd(),'.tesseract-cache')});await w.terminate();})().catch(e=>{console.error(e);process.exit(1);})"

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
