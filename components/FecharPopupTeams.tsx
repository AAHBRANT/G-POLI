"use client";

import { useEffect, useState } from "react";

// Avisa o Teams que o login no popup terminou. O Teams fecha o popup e resolve
// a promise do `authentication.authenticate()` na aba que o abriu.
//
// Se o popup foi aberto fora do Teams (alguém acessou a URL direto no
// navegador), não há nada a notificar — nesse caso oferece o caminho normal.
export default function FecharPopupTeams() {
  const [foraDoTeams, setForaDoTeams] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const { app, authentication } = await import("@microsoft/teams-js");
        await app.initialize();
        if (cancelado) return;
        authentication.notifySuccess();
      } catch (e) {
        // Acontece de verdade: em 2026-07-27 o popup concluiu o login e não
        // conseguiu avisar o Teams, virando janela solta. Não sabemos ainda por
        // quê — então mostramos o motivo em vez de teorizar. A sessão já existe
        // neste ponto, por isso o link abaixo funciona.
        if (cancelado) return;
        setForaDoTeams(true);
        setMotivo(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (!foraDoTeams) return null;

  return (
    <>
      <a href="/" className="mt-3 block text-sm font-medium text-marsala underline">
        Continuar para o G-Políticas →
      </a>
      {motivo && (
        <p className="mt-2 text-xs text-black/40" title={motivo}>
          Não foi possível voltar ao Teams automaticamente. Motivo: {motivo}
        </p>
      )}
    </>
  );
}
