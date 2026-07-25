# G-Políticas

Gestão e geração de normas/políticas da AAHBRANT, dentro do Microsoft Teams. Primeiro cliente da **Plataforma Corporativa de IA** (ver `docs/PLATFORM-MANIFEST.md`).

## Stack
Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL · Entra ID / Teams SSO · Azure OpenAI. Deploy: Azure Container Apps.

## Estrutura
```
app/ lib/ components/       domínio + UI (Next)
prisma/                     schema + migrações
docs/adr/                   Architecture Decision Records
docs/PLATFORM-MANIFEST.md   constituição da arquitetura
tests/                      testes (Fase 0)
.github/workflows/          CI/CD (Fase 0)
```

## Rodar em dev
1. `.env` a partir de `.env.example` (Postgres local via Docker).
2. `npm install` · `npx prisma migrate dev` · `npm run dev`.
3. Dev sem login: `AUTH_PREVIEW_BYPASS=1`.

## Arquitetura
Ver `docs/PLATFORM-MANIFEST.md` e `docs/adr/`. Regra: novas discussões arquiteturais só quando um problema real da implementação exigir.
