"use client";

import { motion } from "motion/react";

// Contador rolante (odômetro): cada dígito é uma coluna 0–9 que desliza até o
// valor, com mola e atraso escalonado. Troca de valor = os dígitos "rolam".
// `aria-label` carrega o número real; as colunas são decorativas.
export default function NumeroAnimado({ valor, className = "" }: { valor: number; className?: string }) {
  const digitos = String(Math.max(0, Math.round(valor))).split("");
  return (
    <span className={`inline-flex overflow-hidden tabular-nums leading-none ${className}`} role="img" aria-label={String(valor)}>
      {digitos.map((d, i) => (
        <span key={`${digitos.length}-${i}`} className="relative inline-block h-[1em] w-[0.62em]" aria-hidden>
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col"
            initial={{ y: "0em" }}
            animate={{ y: `-${Number(d)}em` }}
            transition={{ type: "spring", stiffness: 110, damping: 20, delay: i * 0.06 }}
          >
            {Array.from({ length: 10 }).map((_, n) => (
              <span key={n} className="block h-[1em] text-center leading-[1]">
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
