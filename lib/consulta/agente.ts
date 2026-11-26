import Anthropic from "@anthropic-ai/sdk";
import type { UsuarioAtual } from "@/lib/auth/rbac";
import { buscarTrechos } from "@/lib/politica/indiceServidor";
import {
  MAXIMO_BUSCAS_POR_PERGUNTA,
  TAMANHO_MAXIMO_CONSULTA_FERRAMENTA,
  chaveUsuario,
  fontesDe,
  formatarResultadoBusca,
  type Fonte,
} from "@/lib/consulta/regras";

// Agente de Consulta do G-Políticas: Claude Managed Agents (agente criado no
// console da Anthropic) com UMA ferramenta personalizada, buscar_documentos, que
// roda AQUI, no nosso servidor, com a identidade de quem está logado — o modelo
// nunca escolhe a identidade nem vê documento que a pessoa não pode ver (a busca
// filtra por filtroVisibilidade). Configuração (variáveis do Container App):
//   ANTHROPIC_API_KEY                    segredo
//   ANTHROPIC_AGENTE_CONSULTA_ID         id do agente no console
//   ANTHROPIC_AGENTE_CONSULTA_AMBIENTE_ID id do ambiente (sem rede) do agente
//   ANTHROPIC_WORKSPACE_ID               opcional
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const AGENTE_ID = process.env.ANTHROPIC_AGENTE_CONSULTA_ID ?? "";
const AMBIENTE_ID = process.env.ANTHROPIC_AGENTE_CONSULTA_AMBIENTE_ID ?? "";
const WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID ?? "";

/** Teto de gasto por conversa (em centavos de dólar, preço de lista). */
const TETO_SESSAO_CENTAVOS = "150";
const CHAVE_METADATA_USUARIO = "gpol_usuario";

export const consultaDisponivel = () => API_KEY.length > 0 && AGENTE_ID.length > 0 && AMBIENTE_ID.length > 0;

export type EventoConsulta =
  | { tipo: "sessao"; id: string }
  | { tipo: "status"; texto: string }
  | { tipo: "mensagem"; texto: string }
  | { tipo: "fontes"; fontes: Fonte[] }
  | { tipo: "fim" }
  | { tipo: "erro"; texto: string };

/** Parte do cliente da Anthropic que usamos (permite simular nos testes). */
export type ClienteAgente = {
  beta: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ id: string }>;
      retrieve(id: string): Promise<{ metadata?: Record<string, string> | null }>;
      events: {
        stream(id: string, params?: Record<string, unknown>): Promise<AsyncIterable<EventoSessao>>;
        send(id: string, params: Record<string, unknown>): Promise<unknown>;
      };
    };
  };
};

// Subconjunto dos eventos de sessão que tratamos.
type EventoSessao = {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
  stop_reason?: { type: string };
};

function clientePadrao(): ClienteAgente {
  return new Anthropic({
    apiKey: API_KEY,
    ...(WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE_ID } } : {}),
  }) as unknown as ClienteAgente;
}

async function garantirSessao(cliente: ClienteAgente, usuario: UsuarioAtual, sessaoId?: string | null): Promise<string> {
  const dono = chaveUsuario(usuario);
  if (sessaoId) {
    try {
      const s = await cliente.beta.sessions.retrieve(sessaoId);
      if (s.metadata?.[CHAVE_METADATA_USUARIO] === dono) return sessaoId; // só reaproveita sessão da própria pessoa
    } catch {
      // sessão inexistente ou expirada: abre outra
    }
  }
  const nova = await cliente.beta.sessions.create({
    agent: AGENTE_ID,
    environment_id: AMBIENTE_ID,
    title: "Consulta G-Políticas",
    metadata: { [CHAVE_METADATA_USUARIO]: dono },
    budget: { type: "limit", max_list_cost: { amount: TETO_SESSAO_CENTAVOS, currency: "USD" } },
  });
  return nova.id;
}

/**
 * Conversa com o agente e devolve eventos para a tela. `buscar` é injetável para
 * teste; por padrão usa a busca real filtrada pela permissão do usuário.
 */
export async function* conversar(opcoes: {
  usuario: UsuarioAtual;
  mensagem: string;
  sessaoId?: string | null;
  cliente?: ClienteAgente;
  buscar?: typeof buscarTrechos;
}): AsyncGenerator<EventoConsulta> {
  const { usuario, mensagem, sessaoId } = opcoes;
  const buscar = opcoes.buscar ?? buscarTrechos;
  const fontes: Fonte[] = [];
  let buscas = 0;

  try {
    const cliente = opcoes.cliente ?? clientePadrao();
    const id = await garantirSessao(cliente, usuario, sessaoId);
    yield { tipo: "sessao", id };

    // O stream abre ANTES do envio, senão os primeiros eventos se perdem.
    const stream = await cliente.beta.sessions.events.stream(id, {});
    await cliente.beta.sessions.events.send(id, {
      events: [{ type: "user.message", content: [{ type: "text", text: mensagem }] }],
    });

    for await (const ev of stream) {
      if (ev.type === "agent.message") {
        const texto = (ev.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
        if (texto) yield { tipo: "mensagem", texto };
      } else if (ev.type === "agent.thinking") {
        yield { tipo: "status", texto: "Pensando…" };
      } else if (ev.type === "agent.custom_tool_use" && ev.id) {
        yield { tipo: "status", texto: "Consultando os documentos…" };
        let resultado: string;
        let erro = false;
        if (ev.name !== "buscar_documentos") {
          resultado = "ferramenta desconhecida.";
          erro = true;
        } else if (buscas >= MAXIMO_BUSCAS_POR_PERGUNTA) {
          resultado = "limite de buscas por pergunta atingido; responda com o que já encontrou.";
          erro = true;
        } else {
          buscas += 1;
          const consulta = String(ev.input?.consulta ?? "").slice(0, TAMANHO_MAXIMO_CONSULTA_FERRAMENTA);
          // A identidade vem do SERVIDOR (usuário logado), nunca do modelo.
          const trechos = await buscar(usuario, consulta, { limite: 6 });
          fontes.push(...fontesDe(trechos));
          resultado = formatarResultadoBusca(trechos);
        }
        await cliente.beta.sessions.events.send(id, {
          events: [
            { type: "user.custom_tool_result", custom_tool_use_id: ev.id, content: [{ type: "text", text: resultado }], is_error: erro },
          ],
        });
      } else if (ev.type === "session.error") {
        yield { tipo: "erro", texto: "O assistente encontrou um problema. Tente de novo em instantes." };
        return;
      } else if (ev.type === "session.status_terminated") {
        break;
      } else if (ev.type === "session.status_idle") {
        const motivo = ev.stop_reason?.type;
        if (motivo === "end_turn") break;
        if (motivo === "requires_action") continue; // o resultado da ferramenta já foi enviado
        yield {
          tipo: "erro",
          texto:
            motivo === "budget_reached"
              ? "Esta conversa atingiu o limite de uso. Abra uma nova conversa."
              : "O assistente não conseguiu concluir a resposta. Tente de novo.",
        };
        return;
      }
    }

    // Fontes únicas, na ordem em que apareceram.
    const unicas = fontes.filter((f, i) => fontes.findIndex((g) => g.politicaId === f.politicaId && g.secao === f.secao) === i);
    if (unicas.length > 0) yield { tipo: "fontes", fontes: unicas };
    yield { tipo: "fim" };
  } catch (e) {
    // Não vaza detalhe da API (nem chave) para a tela; o servidor registra.
    console.error("Falha na consulta ao agente:", e instanceof Error ? e.message : e);
    yield { tipo: "erro", texto: "Não foi possível consultar agora. Tente de novo em instantes." };
  }
}
