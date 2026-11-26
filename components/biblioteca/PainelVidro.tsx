"use client";

import { useRef, type ReactNode } from "react";

// Painel de topo em Liquid Glass: vidro bege com manchas que derivam devagar
// por trás (efeito líquido) e um brilho que acompanha o ponteiro por cima.
// O conteúdo (título, busca…) vem de fora e fica acima de tudo.
export default function PainelVidro({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  function aoMover(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
    el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
  }

  return (
    <header
      ref={ref}
      onPointerMove={aoMover}
      className="painel-vidro liquid liquid-bege relative overflow-hidden rounded-3xl px-6 pb-7 pt-8 text-black sm:px-9 sm:pt-10"
    >
      <div className="liquido-a pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/80 blur-3xl" aria-hidden />
      <div className="liquido-b pointer-events-none absolute -bottom-28 left-1/4 h-64 w-80 rounded-full bg-bege-300/45 blur-3xl" aria-hidden />
      <div className="liquido-c pointer-events-none absolute -left-10 top-4 h-48 w-48 rounded-full bg-bege-400/40 blur-3xl" aria-hidden />
      <div className="fundo-pontos pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="brilho-ponteiro pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative">{children}</div>
    </header>
  );
}
