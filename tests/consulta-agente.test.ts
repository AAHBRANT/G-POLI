import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { conversar, type ClienteAgente, type EventoConsulta } from "@/lib/consulta/agente";
import type { UsuarioAtual } from "@/lib/auth/rbac";
import { chaveUsuario } from "@/lib/consulta/regras";
import type { TrechoEncontrado } from "@/lib/politica/indiceServidor";

const usuario: UsuarioAtual = { id: "u1", oid: "oid-1", nome: "Ana", email: "ana@x.com", perfil: "colaborador", setores: ["s1"], consorcios: [] };
const outro: UsuarioAtual = { ...usuario, id: "u2", oid: "oid-2", email: "b@x.com" };

const trecho: TrechoEncontrado = {
  trechoId: "t1", politicaId: "p1", codigo: "AHBT-PRO-QUA-001", titulo: "Controle de Documentos", tipo: "procedimento",
  revisao: 2, area: "Qualidade", secaoCodigo: "5", secaoTitulo: "Diretrizes", texto: "Todo documento recebe um código.", relevancia: 1,
};

type Evento = { type: string; [k: string]: unknown };

/**
 * Cliente simulado. `roteiro(enviarResultado)` devolve os eventos do stream; o
 * stream só continua depois que o servidor envia o resultado da ferramenta.
 */
function criarCliente(opcoes: {
  eventos: (Evento | "ESPERA_RESULTADO")[];
  metadataSessao?: Record<string, string> | null;
  retrieveFalha?: boolean;
}) {
  const enviados: { events: Evento[] }[] = [];
  let liberar: () => void = () => {};
  const resultadoEnviado = new Promise<void>((ok) => (liberar = ok));
  const criadas: Record<string, unknown>[] = [];

  const cliente: ClienteAgente = {
    beta: {
      sessions: {
        create: vi.fn(async (p) => {
          criadas.push(p);
          return { id: "sess_nova" };
        }),
        retrieve: vi.fn(async () => {
          if (opcoes.retrieveFalha) throw new Error("não existe");
          return { metadata: opcoes.metadataSessao ?? null };
        }),
        events: {
          stream: vi.fn(async () =>
            (async function* () {
              for (const e of opcoes.eventos) {
                if (e === "ESPERA_RESULTADO") await resultadoEnviado;
                else yield e;
              }
            })(),
          ),
          send: vi.fn(async (_id, params) => {
            const p = params as { events: Evento[] };
            enviados.push(p);
            if (p.events.some((e) => e.type === "user.custom_tool_result")) liberar();
          }),
        },
      },
    },
  };
  return { cliente, enviados, criadas };
}

async function coletar(gerador: AsyncGenerator<EventoConsulta>): Promise<EventoConsulta[]> {
  const eventos: EventoConsulta[] = [];
  for await (const e of gerador) eventos.push(e);
  return eventos;
}

const ferramenta = (id: string, input: Record<string, unknown> = { consulta: "codificação" }, name = "buscar_documentos"): Evento => ({ type: "agent.custom_tool_use", id, name, input });
const idleAcao: Evento = { type: "session.status_idle", stop_reason: { type: "requires_action" } };
const idleFim: Evento = { type: "session.status_idle", stop_reason: { type: "end_turn" } };
const mensagem = (texto: string): Evento => ({ type: "agent.message", content: [{ type: "text", text: texto }] });

describe("agente de Consulta: fluxo completo com a ferramenta", () => {
  let buscar: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    buscar = vi.fn(async () => [trecho]);
  });

  it("busca com a identidade do usuário logado, devolve o resultado ao agente e entrega resposta e fontes", async () => {
    const { cliente, enviados } = criarCliente({
      eventos: [{ type: "agent.thinking" }, ferramenta("tu1", { consulta: "codificação de documentos", usuario: "admin" }), idleAcao, "ESPERA_RESULTADO", mensagem("A codificação segue o padrão."), idleFim],
    });
    const eventos = await coletar(conversar({ usuario, mensagem: "Como codificar?", cliente, buscar: buscar as never }));

    // a busca roda com o usuário do SERVIDOR; o que o modelo põe no input não muda a identidade
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0][0]).toBe(usuario);
    expect(buscar.mock.calls[0][1]).toBe("codificação de documentos");

    // 1º envio = a mensagem da pessoa; 2º = resultado da ferramenta com o texto do documento
    expect(enviados[0].events[0]).toMatchObject({ type: "user.message", content: [{ type: "text", text: "Como codificar?" }] });
    const resultado = enviados[1].events[0] as { type: string; custom_tool_use_id: string; content: { text: string }[]; is_error: boolean };
    expect(resultado).toMatchObject({ type: "user.custom_tool_result", custom_tool_use_id: "tu1", is_error: false });
    expect(resultado.content[0].text).toContain("AHBT-PRO-QUA-001");

    expect(eventos.map((e) => e.tipo)).toEqual(["sessao", "status", "status", "mensagem", "fontes", "fim"]);
    expect(eventos.find((e) => e.tipo === "mensagem")).toMatchObject({ texto: "A codificação segue o padrão." });
    const fontes = eventos.find((e) => e.tipo === "fontes") as { fontes: { codigo: string; revisao: number }[] };
    expect(fontes.fontes[0]).toMatchObject({ codigo: "AHBT-PRO-QUA-001", revisao: 2 });
  });

  it("o idle com requires_action NÃO encerra a resposta", async () => {
    const { cliente } = criarCliente({ eventos: [ferramenta("tu1"), idleAcao, "ESPERA_RESULTADO", mensagem("ok"), idleFim] });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente, buscar: buscar as never }));
    expect(eventos.some((e) => e.tipo === "mensagem")).toBe(true);
    expect(eventos.at(-1)).toEqual({ tipo: "fim" });
  });

  it("limita o tamanho da consulta enviada à busca", async () => {
    const { cliente } = criarCliente({ eventos: [ferramenta("tu1", { consulta: "a".repeat(500) }), idleAcao, "ESPERA_RESULTADO", idleFim] });
    await coletar(conversar({ usuario, mensagem: "x", cliente, buscar: buscar as never }));
    expect((buscar.mock.calls[0][1] as string).length).toBe(200);
  });

  it("ferramenta desconhecida vira erro para o agente e não busca nada", async () => {
    const { cliente, enviados } = criarCliente({ eventos: [ferramenta("tu1", {}, "apagar_tudo"), idleAcao, "ESPERA_RESULTADO", idleFim] });
    await coletar(conversar({ usuario, mensagem: "x", cliente, buscar: buscar as never }));
    expect(buscar).not.toHaveBeenCalled();
    expect(enviados[1].events[0]).toMatchObject({ is_error: true });
  });

  it("no máximo 4 buscas por pergunta; a quinta recebe erro", async () => {
    const usos = [1, 2, 3, 4, 5].map((n) => ferramenta(`tu${n}`));
    const { cliente, enviados } = criarCliente({ eventos: [...usos, idleAcao, "ESPERA_RESULTADO", idleFim] });
    await coletar(conversar({ usuario, mensagem: "x", cliente, buscar: buscar as never }));
    expect(buscar).toHaveBeenCalledTimes(4);
    const quinta = enviados.flatMap((e) => e.events).filter((e) => e.type === "user.custom_tool_result").at(-1);
    expect(quinta).toMatchObject({ custom_tool_use_id: "tu5", is_error: true });
  });

  it("busca sem resultado: o agente recebe 'nenhum documento encontrado' e não há fontes", async () => {
    buscar.mockResolvedValue([]);
    const { cliente, enviados } = criarCliente({ eventos: [ferramenta("tu1"), idleAcao, "ESPERA_RESULTADO", mensagem("Não encontrei."), idleFim] });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente, buscar: buscar as never }));
    expect((enviados[1].events[0] as unknown as { content: { text: string }[] }).content[0].text).toMatch(/nenhum documento encontrado/);
    expect(eventos.some((e) => e.tipo === "fontes")).toBe(false);
  });
});

describe("agente de Consulta: sessões", () => {
  it("cria sessão com o dono nos metadados e teto de gasto", async () => {
    const { cliente, criadas } = criarCliente({ eventos: [idleFim] });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente }));
    expect(eventos[0]).toEqual({ tipo: "sessao", id: "sess_nova" });
    expect(criadas[0]).toMatchObject({
      metadata: { gpol_usuario: chaveUsuario(usuario) },
      budget: { type: "limit", max_list_cost: { amount: "150", currency: "USD" } },
    });
  });

  it("reaproveita a sessão da própria pessoa", async () => {
    const { cliente, criadas } = criarCliente({ eventos: [idleFim], metadataSessao: { gpol_usuario: chaveUsuario(usuario) } });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", sessaoId: "sess_antiga", cliente }));
    expect(eventos[0]).toEqual({ tipo: "sessao", id: "sess_antiga" });
    expect(criadas).toHaveLength(0);
  });

  it("NÃO usa sessão de outra pessoa: abre uma nova", async () => {
    const { cliente, criadas } = criarCliente({ eventos: [idleFim], metadataSessao: { gpol_usuario: chaveUsuario(outro) } });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", sessaoId: "sess_do_outro", cliente }));
    expect(eventos[0]).toEqual({ tipo: "sessao", id: "sess_nova" });
    expect(criadas).toHaveLength(1);
  });

  it("sessão inexistente/expirada: abre uma nova", async () => {
    const { cliente } = criarCliente({ eventos: [idleFim], retrieveFalha: true });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", sessaoId: "sess_morta", cliente }));
    expect(eventos[0]).toEqual({ tipo: "sessao", id: "sess_nova" });
  });
});

describe("agente de Consulta: falhas", () => {
  it("teto de gasto atingido: mensagem pedindo nova conversa", async () => {
    const { cliente } = criarCliente({ eventos: [{ type: "session.status_idle", stop_reason: { type: "budget_reached" } }] });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente }));
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro" });
    expect((eventos.at(-1) as { texto: string }).texto).toMatch(/nova conversa/i);
  });

  it("erro de sessão vira mensagem amigável", async () => {
    const { cliente } = criarCliente({ eventos: [{ type: "session.error" }] });
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente }));
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro" });
  });

  it("exceção (rede/API) não vaza detalhe nem chave para a tela", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cliente } = criarCliente({ eventos: [] });
    (cliente.beta.sessions.events.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("401 invalid x-api-key sk-ant-SEGREDO"));
    const eventos = await coletar(conversar({ usuario, mensagem: "x", cliente }));
    const erro = eventos.at(-1) as { tipo: string; texto: string };
    expect(erro.tipo).toBe("erro");
    expect(erro.texto).not.toContain("sk-ant");
    expect(erro.texto).not.toContain("401");
    espiao.mockRestore();
  });
});
