"use client";

import { useEffect } from "react";

// Avisa o Teams que a página carregou.
//
// O cliente novo do Teams NÃO exibe a aba enquanto o app não chamar
// `app.notifySuccess()` depois do `app.initialize()` — o resultado é um frame
// vazio, sem erro visível. Precisa valer para QUALQUER página que possa ser o
// conteúdo da aba (o painel em `/`, o `/login`, o `/sem-acesso`), por isso mora
// no layout raiz e não numa página específica.
//
// Fora do Teams o `initialize()` rejeita e o componente não faz nada — é o
// mesmo caminho do TeamsSso. Chamar `initialize()` duas vezes é seguro: o
// teams-js reaproveita a inicialização já feita.
export default function TeamsFrame() {
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const { app } = await import("@microsoft/teams-js");
        await app.initialize();
        if (cancelado) return;
        app.notifySuccess();
      } catch {
        // Não está embutido no Teams — nada a notificar.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  return null;
}
