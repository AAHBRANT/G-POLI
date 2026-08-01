"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ItemPendencia } from "@/app/api/pendencias/lista/route";
import { marcarPendenciaNotificada } from "@/app/(shell)/pendencia-actions";

const DURACAO_MS = 6000;

// Monta uma vez por carregamento do shell (ver app/(shell)/layout.tsx).
// Mostra no máximo 1 toast por carregamento — mesmo com várias pendências
// não notificadas, evita empilhar spam; as demais aparecem no sino/home.
export default function ToastPendencias() {
  const [item, setItem] = useState<ItemPendencia | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      try {
        const resposta = await fetch("/api/pendencias/lista");
        if (cancelado) return;
        if (!resposta.ok) {
          console.error("Falha ao buscar pendencia para toast: status", resposta.status);
          return;
        }
        const corpo: { itens: ItemPendencia[] } = await resposta.json();
        const naoNotificada = corpo.itens.find((it) => !it.notificadaEm);
        if (naoNotificada && !cancelado) {
          setItem(naoNotificada);
          marcarPendenciaNotificada(naoNotificada.id);
        }
      } catch (erro) {
        console.error("Falha ao buscar pendencia para toast:", erro);
      }
    }

    buscar();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    const id = setTimeout(() => setItem(null), DURACAO_MS);
    return () => clearTimeout(id);
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg bg-marsala px-4 py-3 shadow-premium">
      <span className="flex-1 text-sm text-white">
        <Link href={`/catalogo/${item.politicaId}`} className="underline hover:no-underline">
          {item.titulo}
        </Link>{" "}
        foi publicada. Confirme sua ciência.
      </span>
      <button onClick={() => setItem(null)} aria-label="Fechar" className="text-bege/80 hover:text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
