"use client";

import { useEffect, useState } from "react";

export type ContagemPendencias = { total: number; porTipo: Record<string, number> };

const INTERVALO_MS = 30_000;

// Polling simples (sem WebSocket — app roda em réplica única, ver
// docs/DEPLOY.md). Busca na montagem e a cada 30s; ver
// docs/superpowers/specs/2026-07-30-pendencias-ciencia-nucleo-design.md
// para a decisão. Fase B consome este hook nos badges/sino/painel.
export function usePendencias(): ContagemPendencias & { carregando: boolean } {
  const [dados, setDados] = useState<ContagemPendencias>({ total: 0, porTipo: {} });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      try {
        const resposta = await fetch("/api/pendencias/contagem");
        if (!resposta.ok || cancelado) return;
        const corpo: ContagemPendencias = await resposta.json();
        if (!cancelado) setDados(corpo);
      } catch (erro) {
        console.error("Falha ao buscar contagem de pendencias:", erro);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    buscar();
    const id = setInterval(buscar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  return { ...dados, carregando };
}
