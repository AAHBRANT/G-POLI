"use client";

import { useEffect, useState } from "react";

// Avisa o Teams que o login no popup terminou. O Teams fecha o popup e resolve
// a promise do `authentication.authenticate()` na aba que o abriu.
//
// Se o popup foi aberto fora do Teams (alguém acessou a URL direto no
// navegador), não há nada a notificar — nesse caso oferece o caminho normal.
export default function FecharPopupTeams() {
  const [foraDoTeams, setForaDoTeams] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const { app, authentication } = await import("@microsoft/teams-js");
        await app.initialize();
        if (cancelado) return;
        authentication.notifySuccess();
      } catch {
        if (!cancelado) setForaDoTeams(true);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (!foraDoTeams) return null;

  return (
    <a href="/" className="mt-3 block text-sm font-medium text-marsala underline">
      Continuar para o G-Políticas →
    </a>
  );
}
