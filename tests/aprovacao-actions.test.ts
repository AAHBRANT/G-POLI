import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    secao: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podePublicar: vi.fn(),
  podeEnviarParaAprovacao: vi.fn(),
  podeAprovarGestor: vi.fn(),
  podeAprovarDiretoria: vi.fn(),
  podeRetirarDaAprovacao: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

// estado-actions.ts importa isso tudo no topo do arquivo mesmo pras funções
// de publicar/revogar que este arquivo de teste não exercita — precisa
// existir o mock pra não quebrar o import, mesmo sem asserção sobre eles.
vi.mock("@/lib/notificacao/graph", () => ({ enviarNotificacaoPoliticaPublicada: vi.fn() }));
vi.mock("@/lib/storage", () => ({ salvarArquivo: vi.fn() }));
vi.mock("@/lib/politica/gerarDocx", () => ({ gerarDocumentoOficial: vi.fn() }));
vi.mock("@/lib/politica/pendencia", () => ({ dadosPendencia: vi.fn() }));
vi.mock("@/lib/politica/ai", () => ({ gerarDescricaoRevisao: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  getUsuarioAtual,
  podeEnviarParaAprovacao,
  podeAprovarGestor,
  podeAprovarDiretoria,
  podeRetirarDaAprovacao,
} from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import {
  enviarParaAprovacao,
  aprovarGestor,
  rejeitarGestor,
  rejeitarDiretoria,
  retirarDaAprovacao,
} from "@/app/(shell)/catalogo/[id]/estado-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const enviarPermitido = podeEnviarParaAprovacao as ReturnType<typeof vi.fn>;
const aprovarGestorPermitido = podeAprovarGestor as ReturnType<typeof vi.fn>;
const aprovarDiretoriaPermitido = podeAprovarDiretoria as ReturnType<typeof vi.fn>;
const retirarPermitido = podeRetirarDaAprovacao as ReturnType<typeof vi.fn>;
const politicaFindUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const politicaUpdate = prisma.politica.update as ReturnType<typeof vi.fn>;
const secaoFindMany = prisma.secao.findMany as ReturnType<typeof vi.fn>;

const gestor = { id: "u1", email: "gestor@aahbrant.com", nome: "Gestor RH", perfil: "area", setores: ["s1"], consorcios: [] };
const diretor = { id: "u2", email: "dir@aahbrant.com", nome: "Diretor", perfil: "diretoria", setores: [], consorcios: [] };

const politicaBase = (estado: string, over = {}) => ({
  id: "pol1",
  titulo: "Política de Teste",
  areaId: "s1",
  estado,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enviarParaAprovacao", () => {
  it("rascunho com conteúdo → em_aprovacao_gestor, carimba autor/data e limpa ciclo anterior", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("rascunho"));
    enviarPermitido.mockReturnValue(true);
    secaoFindMany.mockResolvedValue([{ tipo: "texto", corpo: "conteúdo", linhas: null }]);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await enviarParaAprovacao("pol1");

    expect(r.ok).toBe(true);
    expect(politicaUpdate).toHaveBeenCalledWith({
      where: { id: "pol1" },
      data: expect.objectContaining({
        estado: "em_aprovacao_gestor",
        enviadaAprovacaoPorNome: "Gestor RH",
        enviadaAprovacaoPorEmail: "gestor@aahbrant.com",
        rejeitadaEm: null,
        motivoRejeicao: null,
      }),
    });
    expect(registrar).toHaveBeenCalledWith("politica.enviar_aprovacao", "Politica", "pol1", "Política de Teste");
  });

  it("bloqueia sem conteúdo", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("rascunho"));
    enviarPermitido.mockReturnValue(true);
    secaoFindMany.mockResolvedValue([{ tipo: "texto", corpo: "", linhas: null }]);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await enviarParaAprovacao("pol1");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });

  it("bloqueia quem não pode editar o conteúdo", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("rascunho"));
    enviarPermitido.mockReturnValue(false);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await enviarParaAprovacao("pol1");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });

  it("bloqueia se já não está em rascunho", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_gestor"));
    enviarPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await enviarParaAprovacao("pol1");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });
});

describe("aprovarGestor", () => {
  it("em_aprovacao_gestor → em_aprovacao_diretoria, carimba aprovador", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_gestor"));
    aprovarGestorPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await aprovarGestor("pol1");

    expect(r.ok).toBe(true);
    expect(politicaUpdate).toHaveBeenCalledWith({
      where: { id: "pol1" },
      data: expect.objectContaining({
        estado: "em_aprovacao_diretoria",
        aprovadaGestorPorNome: "Gestor RH",
      }),
    });
  });

  it("bloqueia quem não é o Gestor do setor dono", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_gestor"));
    aprovarGestorPermitido.mockReturnValue(false);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await aprovarGestor("pol1");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });

  it("bloqueia se não está em aprovação do gestor", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("rascunho"));
    aprovarGestorPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await aprovarGestor("pol1");

    expect(r.ok).toBe(false);
  });
});

describe("rejeitarGestor", () => {
  it("exige motivo não-vazio", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_gestor"));
    aprovarGestorPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await rejeitarGestor("pol1", "   ");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });

  it("volta pra rascunho e registra motivo + etapa", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_gestor"));
    aprovarGestorPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await rejeitarGestor("pol1", "Faltou a seção 4");

    expect(r.ok).toBe(true);
    expect(politicaUpdate).toHaveBeenCalledWith({
      where: { id: "pol1" },
      data: expect.objectContaining({
        estado: "rascunho",
        rejeitadaNaEtapa: "gestor",
        motivoRejeicao: "Faltou a seção 4",
      }),
    });
  });
});

describe("rejeitarDiretoria", () => {
  it("volta pra rascunho e registra motivo + etapa", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_diretoria"));
    aprovarDiretoriaPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(diretor);

    const r = await rejeitarDiretoria("pol1", "Ajustar redação do item 3");

    expect(r.ok).toBe(true);
    expect(politicaUpdate).toHaveBeenCalledWith({
      where: { id: "pol1" },
      data: expect.objectContaining({ estado: "rascunho", rejeitadaNaEtapa: "diretoria" }),
    });
  });

  it("bloqueia quem não é Diretoria/admin", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_diretoria"));
    aprovarDiretoriaPermitido.mockReturnValue(false);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await rejeitarDiretoria("pol1", "motivo qualquer");

    expect(r.ok).toBe(false);
    expect(politicaUpdate).not.toHaveBeenCalled();
  });
});

describe("retirarDaAprovacao", () => {
  it("de qualquer etapa de aprovação, volta pra rascunho sem exigir motivo", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("em_aprovacao_diretoria"));
    retirarPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await retirarDaAprovacao("pol1");

    expect(r.ok).toBe(true);
    expect(politicaUpdate).toHaveBeenCalledWith({ where: { id: "pol1" }, data: { estado: "rascunho" } });
  });

  it("bloqueia se já está em rascunho ou publicada", async () => {
    politicaFindUnique.mockResolvedValue(politicaBase("publicada"));
    retirarPermitido.mockReturnValue(true);
    usuarioAtual.mockResolvedValue(gestor);

    const r = await retirarDaAprovacao("pol1");

    expect(r.ok).toBe(false);
  });
});
