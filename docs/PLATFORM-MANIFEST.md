# Platform Manifest — Plataforma Corporativa de IA · AAHBRANT

> A "constituição" da arquitetura. Uma página. Toda decisão futura se justifica contra isto.

A **Plataforma Corporativa de IA da AAHBRANT** existe para fornecer **capacidades transversais reutilizáveis**.

1. **A Plataforma é o produto.** Cada aplicação (G-Políticas, G-SIPRO, G-RH, G-Compras, G-Financeiro…) é um **cliente** da plataforma.
2. **Nenhuma aplicação implementa infraestrutura corporativa.** Toda capacidade transversal — Identity, RBAC, Audit, AI Gateway, Prompt Registry, Search/RAG, Notifications, Files, Feature Flags, Telemetry — pertence à plataforma.
3. **Cada aplicação implementa exclusivamente seu domínio de negócio.**
4. **Capacidades são expostas por contratos versionados** (API interna, eventos, GraphQL ou MCP) — o consumidor nunca conhece a implementação.
5. **A plataforma evolui por extração, nunca por reescrita.** Interfaces nascem no dia 1 (implementação local); o serviço é extraído quando houver um **2º consumidor real**.
6. **Governança é proporcional.** ADRs e este manifesto valem desde já; a máquina pesada (ARB, depreciação formal, versionamento semântico) surge com o 2º módulo/time.

## Princípios de guarda (checklist de toda decisão)
1. **Domínio isolado** — o módulo resolve só seu problema de negócio.
2. **Plataforma por extração** — interface dia 1; serviço compartilhado só com consumidor real.
3. **Contratos estáveis** — APIs, eventos e capacidades evoluem com versionamento e compatibilidade.
4. **IA governada** — Gateway + Prompt Registry + Observabilidade + Flags como um único plano de controle.
5. **Governança explícita** — ADRs, ownership e regras de evolução fazem parte do produto, não da documentação acessória.

_Versão 1.0 · 2026-07-25 · dono: (definir) · revisão: 2 pessoas (Architecture Review inicial)._
