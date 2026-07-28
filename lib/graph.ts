// Notificação de atividade do Teams (o sininho), via Microsoft Graph.
//
// Caminho escolhido: `POST /users/{oid}/teamwork/sendActivityNotification`, não
// Bot Framework. O app já é aba pessoal instalada — a Graph API entrega a
// notificação sem precisar de bot registrado nem de armazenar referência de
// conversa por usuário. Exige a permissão de APLICAÇÃO `TeamsActivity.Send`
// (não confundir com a variante RSC `TeamsActivity.Send.User`, que vive no
// manifest do Teams e segue outro fluxo de consentimento) — concedida com
// admin-consent no Entra para o app 1b98db67 em 2026-07-28.
//
// O `activityType` abaixo precisa constar em `teams/manifest.json` (bloco
// `activities.activityTypes`), senão o Teams não sabe renderizar o texto.
import { msalApp, SCOPES_GRAPH_APP } from "./auth/msal";
import { authConfig } from "./auth/config";

const ACTIVITY_TYPE = "politicaPublicada";

export type ResultadoNotificacao = { ok: true } | { ok: false; motivo: string };

export async function enviarNotificacaoPoliticaPublicada(params: {
  oid: string;
  tituloPolitica: string;
  politicaId: string;
}): Promise<ResultadoNotificacao> {
  let token: string | null = null;
  try {
    const resultado = await msalApp().acquireTokenByClientCredential({ scopes: SCOPES_GRAPH_APP });
    token = resultado?.accessToken ?? null;
  } catch (erro) {
    return { ok: false, motivo: `token_graph: ${erro instanceof Error ? erro.message : String(erro)}` };
  }
  if (!token) return { ok: false, motivo: "token_graph: vazio" };

  const urlPolitica = `${authConfig.baseUrl.replace(/\/$/, "")}/catalogo/${params.politicaId}`;

  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.oid)}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: {
            source: "text",
            value: `Norma publicada: ${params.tituloPolitica}`,
            webUrl: urlPolitica,
          },
          activityType: ACTIVITY_TYPE,
          previewText: { content: `Norma publicada: ${params.tituloPolitica}` },
          recipient: {
            "@odata.type": "microsoft.graph.aadUserNotificationRecipient",
            userId: params.oid,
          },
        }),
      },
    );

    // 204 = aceito pelo Graph. Não garante que o usuário viu — só que a
    // notificação foi entregue ao Teams para exibição.
    if (resp.status === 204) return { ok: true };

    const corpo = await resp.text().catch(() => "");
    return { ok: false, motivo: `graph_${resp.status}: ${corpo.slice(0, 200)}` };
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}
