"use client";

import { useEffect, useState } from "react";

export type ContagemPendencias = { total: number; porTipo: Record<string, number> };

const INTERVALO_MS = 30_000;

// Store de módulo: um único polling compartilhado por todos os componentes que
// chamam usePendencias() (Sidebar, SinoNotificacoes) — evita 2 requests
// idênticos a cada 30s e evita as duas cópias de estado divergirem entre si.
// Ver docs/superpowers/specs/2026-07-30-pendencias-ciencia-nucleo-design.md
// e a revisao final da Fase B (finding Important 1).
let dados: ContagemPendencias = { total: 0, porTipo: {} };
let carregando = true;
let erro = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
const assinantes = new Set<() => void>();

function notificar() {
  assinantes.forEach((cb) => cb());
}

async function buscar() {
  try {
    const resposta = await fetch("/api/pendencias/contagem");
    if (!resposta.ok) {
      erro = true;
      return;
    }
    const corpo: ContagemPendencias = await resposta.json();
    dados = corpo;
    erro = false;
  } catch (erroFetch) {
    console.error("Falha ao buscar contagem de pendencias:", erroFetch);
    erro = true;
  } finally {
    carregando = false;
    notificar();
  }
}

export function usePendencias(): ContagemPendencias & { carregando: boolean; erro: boolean } {
  const [, forcarRenderizacao] = useState(0);

  useEffect(() => {
    const callback = () => forcarRenderizacao((n) => n + 1);
    assinantes.add(callback);
    if (assinantes.size === 1) {
      buscar();
      intervalId = setInterval(buscar, INTERVALO_MS);
    }
    return () => {
      assinantes.delete(callback);
      if (assinantes.size === 0 && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, []);

  return { ...dados, carregando, erro };
}
