import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResultadoNotificacao } from "@/lib/notificacao/graph";

vi.mock("@/lib/cron/secret", () => ({
  CRON_SECRET: "segredo-teste",
  autorizadoCron: (h: string | null) => h === "Bearer segredo-teste",
}));

const pendenciaFindMany = vi.fn();
const pendenciaUpdate = vi.fn();
const usuarioFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pendencia: { findMany: (...a: unknown[]) => pendenciaFindMany(...a), update: (...a: unknown[]) => pendenciaUpdate(...a) },
    usuario: { findMany: (...a: unknown[]) => usuarioFindMany(...a) },
  },
}));

const enviarNotificacaoLembretePendencia = vi.fn(
  async (..._args: unknown[]): Promise<ResultadoNotificacao> => ({ ok: true }),
);
const enviarResumoPendenciasSgi = vi.fn(
  async (..._args: unknown[]): Promise<ResultadoNotificacao[]> => [{ ok: true }],
);

vi.mock("@/lib/notificacao/graph", () => ({
  enviarNotificacaoLembretePendencia: (...a: unknown[]) => enviarNotificacaoLembretePendencia(...a),
  enviarResumoPendenciasSgi: (...a: unknown[]) => enviarResumoPendenciasSgi(...a),
}));

import { POST } from "@/app/api/cron/lembretes-pendencia/route";

function req(autorizacao: string | null) {
  return new Request("http://localhost/api/cron/lembretes-pendencia", {
    method: "POST",
    headers: autorizacao ? { authorization: autorizacao } : {},
  });
}

describe("POST /api/cron/lembretes-pendencia", () => {
  beforeEach(() => {
    pendenciaFindMany.mockReset();
    pendenciaUpdate.mockReset();
    usuarioFindMany.mockReset();
    enviarNotificacaoLembretePendencia.mockReset().mockResolvedValue({ ok: true });
    enviarResumoPendenciasSgi.mockReset().mockResolvedValue([{ ok: true }]);
  });

  it("401 sem o secret certo", async () => {
    const resp = await POST(req(null));
    expect(resp.status).toBe(401);
  });

  it("401 com secret errado", async () => {
    const resp = await POST(req("Bearer errado"));
    expect(resp.status).toBe(401);
  });

  it("pula pendencia sem marco vencido e sem oid", async () => {
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm: new Date(),
        lembrete3EnviadoEm: null,
        lembrete7EnviadoEm: null,
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: null },
      },
    ]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(0);
    expect(enviarNotificacaoLembretePendencia).not.toHaveBeenCalled();
  });

  it("envia lembrete pro marco vencido e grava o campo certo", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 3);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: null,
        lembrete7EnviadoEm: null,
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(1);
    expect(enviarNotificacaoLembretePendencia).toHaveBeenCalledWith(
      expect.objectContaining({ oid: "oid-1", diasPendente: 3 }),
    );
    expect(pendenciaUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { lembrete3EnviadoEm: expect.any(Date) },
    });
    expect(enviarResumoPendenciasSgi).not.toHaveBeenCalled();
  });

  it("dispara resumo SGI só quando alguem cruza 15 dias", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 15);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: new Date(),
        lembrete7EnviadoEm: new Date(),
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);
    usuarioFindMany.mockResolvedValue([{ oid: "oid-sgi-1" }]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.resumoSgi).toBe(1);
    expect(corpo.resumoSgiFalhas).toBe(0);
    expect(usuarioFindMany).toHaveBeenCalledWith({
      where: { perfil: "sgi", ativo: true, oid: { not: null } },
      select: { oid: true },
    });
    expect(enviarResumoPendenciasSgi).toHaveBeenCalledWith({ oidsSgi: ["oid-sgi-1"], quantidade: 1 });
  });

  it("conta e loga falhas do resumo SGI sem quebrar a resposta", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 15);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: new Date(),
        lembrete7EnviadoEm: new Date(),
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);
    usuarioFindMany.mockResolvedValue([{ oid: "oid-sgi-1" }, { oid: "oid-sgi-2" }]);
    enviarResumoPendenciasSgi.mockResolvedValue([
      { ok: false, motivo: "graph_500: erro" },
      { ok: true },
    ]);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.resumoSgi).toBe(1);
    expect(corpo.resumoSgiFalhas).toBe(1);
    expect(erroSpy).toHaveBeenCalledWith("Falha ao enviar resumo SGI:", "graph_500: erro");

    erroSpy.mockRestore();
  });

  it("loga quando cruza 15 dias mas nao ha usuario SGI ativo com oid", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 15);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: new Date(),
        lembrete7EnviadoEm: new Date(),
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);
    usuarioFindMany.mockResolvedValue([]);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.resumoSgi).toBe(0);
    expect(corpo.resumoSgiFalhas).toBe(0);
    expect(enviarResumoPendenciasSgi).not.toHaveBeenCalled();
    expect(erroSpy).toHaveBeenCalledWith(
      "Resumo SGI não enviado: nenhum usuário SGI ativo com oid encontrado.",
    );

    erroSpy.mockRestore();
  });

  it("falha ao enviar 1 lembrete nao aborta o lote (best-effort)", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 3);
    pendenciaFindMany.mockResolvedValue([
      { id: "p1", politicaId: "pol1", criadaEm, lembrete3EnviadoEm: null, lembrete7EnviadoEm: null, lembrete15EnviadoEm: null, politica: { titulo: "Pol 1" }, usuario: { oid: "oid-1" } },
      { id: "p2", politicaId: "pol2", criadaEm, lembrete3EnviadoEm: null, lembrete7EnviadoEm: null, lembrete15EnviadoEm: null, politica: { titulo: "Pol 2" }, usuario: { oid: "oid-2" } },
    ]);
    enviarNotificacaoLembretePendencia
      .mockResolvedValueOnce({ ok: false, motivo: "graph_500: erro" })
      .mockResolvedValueOnce({ ok: true });

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(1);
    expect(corpo.falhas).toBe(1);
    expect(pendenciaUpdate).toHaveBeenCalledTimes(1); // só a que teve sucesso grava o campo
  });
});
