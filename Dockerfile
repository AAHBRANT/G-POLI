# ---- build ----
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Next standalone (server.js + node_modules mínimos). O output standalone do
# Next NÃO inclui public/ nem .next/static automaticamente — tem que copiar
# os dois à mão (gotcha documentado do Next.js). Nunca deu problema até agora
# porque não existia public/ no projeto antes da logomarca oficial (PR #47).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/jobs ./jobs

# Prisma: CLI + client + engines + migrations (para migrate deploy no start)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# pdfkit (PDF oficial): as fontes padrão (js/standard-fonts) são lidas do disco em tempo de
# execução e o rastreamento do Next não as copia para o standalone.
COPY --from=builder /app/node_modules/pdfkit ./node_modules/pdfkit

COPY docker-entrypoint.sh ./
# Normaliza CRLF->LF incondicionalmente: o checkout do agente de CI (Windows,
# self-hosted) não respeitou o eol=lf do .gitattributes, gerando um shebang
# "#!/bin/sh\r" quebrado (container falhava com "exec: not found" no start).
# `sed` aqui garante LF independente de como o agente fez o checkout.
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
