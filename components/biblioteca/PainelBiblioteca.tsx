"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";

// Estado compartilhado da Biblioteca: navegar entre filtros sem recarregar a
// página (router.replace dentro de uma transição) e saber quando a lista está
// sendo atualizada — a busca mostra o indicador, a lista suaviza. Também liga
// "reduzir movimento" do sistema operacional para todas as animações filhas.
type Ctx = { pendente: boolean; navegar: (href: string) => void };
const BibliotecaCtx = createContext<Ctx>({ pendente: false, navegar: () => {} });

export const useBiblioteca = () => useContext(BibliotecaCtx);

export default function PainelBiblioteca({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const navegar = useCallback(
    (href: string) => iniciar(() => router.replace(href, { scroll: false })),
    [router],
  );
  return (
    <MotionConfig reducedMotion="user">
      <BibliotecaCtx.Provider value={{ pendente, navegar }}>{children}</BibliotecaCtx.Provider>
    </MotionConfig>
  );
}
