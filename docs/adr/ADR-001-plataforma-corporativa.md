# ADR-001 — G-Políticas é o primeiro cliente da Plataforma Corporativa

- **Status:** Accepted
- **Data:** 2026-07-25
- **Decisores:** Wellington Lourenço + revisão de engenharia

## Contexto
O G-Políticas nasceu como app de gestão de normas no Teams. Ao amadurecer (RBAC, auditoria, IA generativa, storage, identidade), ficou claro que essas capacidades são **transversais** — futuros módulos (G-SIPRO, G-RH, G-Compras, G-Financeiro) precisarão das mesmas. Tratar cada app como silo levaria a duplicação e manutenção insustentável (o G-SIPRO já duplica identidade/auditoria/container).

## Decisão
A **Plataforma Corporativa de IA é o produto**; o G-Políticas é o seu **primeiro cliente**, não o sistema central. Capacidades transversais pertencem à plataforma; o G-Políticas implementa apenas o domínio "governança documental". Ver `PLATFORM-MANIFEST.md`.

## Alternativas consideradas
- **A — G-Políticas como super-app** (tudo dentro dele): rejeitada — acopla infra ao domínio, trava evolução, replica em cada novo app.
- **B — Plataforma completa antes dos apps** (10 serviços de largada): rejeitada — over-engineering sem consumidor; plataforma sem cliente.
- **C (aceita) — Plataforma por extração:** interfaces desde o dia 1, implementação local, extração quando houver 2º consumidor real.

## Consequências
- **Positivas:** domínio limpo; reuso pelos próximos módulos; extração sem refatorar o domínio; base sustentável para crescer.
- **Trade-offs:** exige disciplina de contratos e um dono de plataforma (Conway); governança explícita (ADRs) desde já.
- **Impacto em contratos/capacidades:** toda capacidade transversal (Identity, RBAC, Audit, AI Gateway, Prompt Registry, Search, Notifications, Files, Flags, Telemetry) será exposta por contrato versionado e catalogada no Capability Registry.

## Decisões derivadas (ADRs a criar)
ADR-002 AI Gateway · ADR-003 Event Bus (outbox/idempotência) · ADR-004 Capability Registry · ADR-005 Knowledge Layer (4 índices) · ADR-006 Versionamento de conteúdo de política.
