"use client";

import { useEffect, useState } from "react";

type Props = {
  authId?: string;
  /** `web` (avisa via SDK) ou `deeplink` (volta pelo hostRedirectUrl). */
  metodo?: string;
  /** Já validado no servidor contra a allowlist de hosts do Teams. */
  hostRedirectUrl?: string;
};

// Avisa o Teams que o login no popup terminou, para ele fechar a janela e
// resolver a promise do `authentication.authenticate()` na aba que a abriu.
//
// São dois caminhos, e o primeiro existe porque o segundo falha de verdade:
//
// 1. `hostRedirectUrl` — o endereço que o próprio Teams passou para receber o
//    resultado. Não depende de o SDK reencontrar o host, então sobrevive ao
//    percurso que passa pelo Entra e volta.
// 2. SDK (`app.initialize()` + `notifySuccess()`) — o caminho normal, quando o
//    Teams não pediu deeplink.
//
// Em 2026-07-28, com a página instrumentada, o caminho 2 respondeu
// "Initialization Failed. No Parent window found." — o SDK não reencontra o host
// depois dos redirects, e o popup virava janela solta com a sessão já criada.
export default function FecharPopupTeams({ authId, metodo, hostRedirectUrl }: Props) {
  const [semSaidaAutomatica, setSemSaidaAutomatica] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    // Caminho 1: o Teams disse por onde voltar.
    if (hostRedirectUrl) {
      window.location.assign(montarRetorno(hostRedirectUrl, authId));
      return;
    }

    // Caminho 2: avisar pelo SDK.
    (async () => {
      try {
        const { app, authentication } = await import("@microsoft/teams-js");
        await app.initialize();
        if (cancelado) return;
        authentication.notifySuccess();
      } catch (e) {
        // A sessão já existe neste ponto — o que falhou foi só o aviso. Mostra o
        // motivo (em vez de teorizar) e oferece o caminho manual.
        if (cancelado) return;
        setSemSaidaAutomatica(true);
        setMotivo(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [authId, metodo, hostRedirectUrl]);

  if (!semSaidaAutomatica) return null;

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

// O Teams aceita placeholders no hostRedirectUrl; quando não vêm, os valores
// entram como query. Tratar os dois formatos evita depender de um detalhe que só
// se confirma testando no cliente real.
function montarRetorno(host: string, authId?: string): string {
  if (host.includes("{result}") || host.includes("{authId}")) {
    return host
      .replace("{result}", encodeURIComponent("success"))
      .replace("{authId}", encodeURIComponent(authId ?? ""));
  }

  const u = new URL(host);
  u.searchParams.set("result", "success");
  if (authId) u.searchParams.set("authId", authId);
  return u.toString();
}
