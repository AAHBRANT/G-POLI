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
// Cada `activityType` usado abaixo precisa constar em `teams/manifest.json`
// (bloco `activities.activityTypes`), senão o Teams não sabe renderizar o
// texto.
import { msalApp, SCOPES_GRAPH_APP } from "../auth/msal";
import { authConfig } from "../auth/config";
import type { MarcoLembrete } from "../politica/lembretesPendentes";

const TEAMS_APP_ID = "698c2c83-b704-4e0f-b5e5-f3095b054e58";
const TEAMS_TAB_ENTITY_ID = "gpol-painel";

export type ResultadoNotificacao = { ok: true } | { ok: false; motivo: string };

async function obterTokenGraph(): Promise<string> {
  const resultado = await msalApp().acquireTokenByClientCredential({ scopes: SCOPES_GRAPH_APP });
  const token = resultado?.accessToken;
  if (!token) throw new Error("token_graph: vazio");
  return token;
}

// Precisam bater com teams/manifest.json: "id" (raiz do manifest) e o
// staticTabs[].entityId da aba que renderiza /catalogo/{politicaId}. Sem
// subEntityId (resumo SGI, que não é sobre 1 política só), o context vem
// vazio — Graph aceita normalmente.
function montarWebUrlTeams(caminho: string, subEntityId?: string): string {
  const urlApp = `${authConfig.baseUrl.replace(/\/$/, "")}${caminho}`;
  const base = `https://teams.microsoft.com/l/entity/${TEAMS_APP_ID}/${TEAMS_TAB_ENTITY_ID}?webUrl=${encodeURIComponent(urlApp)}`;
  if (!subEntityId) return base;
  const contexto = encodeURIComponent(JSON.stringify({ subEntityId }));
  return `${base}&context=${contexto}`;
}

async function enviarAtividade(params: {
  oid: string;
  activityType: string;
  texto: string;
  webUrl: string;
}): Promise<ResultadoNotificacao> {
  let token: string;
  try {
    token = await obterTokenGraph();
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, motivo: msg.startsWith("token_graph:") ? msg : `token_graph: ${msg}` };
  }

  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.oid)}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: { source: "text", value: params.texto, webUrl: params.webUrl },
          activityType: params.activityType,
          previewText: { content: params.texto },
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

export async function enviarNotificacaoPoliticaPublicada(params: {
  oid: string;
  tituloPolitica: string;
  politicaId: string;
}): Promise<ResultadoNotificacao> {
  const texto = `Norma publicada: ${params.tituloPolitica}`;
  return enviarAtividade({
    oid: params.oid,
    activityType: "politicaPublicada",
    texto,
    webUrl: montarWebUrlTeams(`/catalogo/${params.politicaId}`, params.politicaId),
  });
}

const TEXTO_MARCO: Record<MarcoLembrete, string> = {
  3: "3 dias",
  7: "7 dias",
  15: "15 dias",
};

export async function enviarNotificacaoLembretePendencia(params: {
  oid: string;
  tituloPolitica: string;
  politicaId: string;
  diasPendente: MarcoLembrete;
}): Promise<ResultadoNotificacao> {
  const texto = `Lembrete: "${params.tituloPolitica}" aguardando sua ciência há ${TEXTO_MARCO[params.diasPendente]}`;
  return enviarAtividade({
    oid: params.oid,
    activityType: "pendenciaLembrete",
    texto,
    webUrl: montarWebUrlTeams(`/catalogo/${params.politicaId}`, params.politicaId),
  });
}

// 1 chamada por destinatário SGI (a API do Teams só aceita recipient
// individual) — mas todos recebem o MESMO texto-resumo, nunca 1 notificação
// por colaborador travado.
export async function enviarResumoPendenciasSgi(params: {
  oidsSgi: string[];
  quantidade: number;
}): Promise<ResultadoNotificacao[]> {
  const texto = `${params.quantidade} ${params.quantidade === 1 ? "pessoa passou" : "pessoas passaram"} de 15 dias sem dar ciência`;
  const webUrl = montarWebUrlTeams("/catalogo");
  return Promise.all(
    params.oidsSgi.map((oid) =>
      enviarAtividade({ oid, activityType: "pendenciaResumoSgi", texto, webUrl }),
    ),
  );
}
