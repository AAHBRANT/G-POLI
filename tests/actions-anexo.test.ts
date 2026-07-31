import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeEditarConteudo: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

vi.mock("@/lib/storage", () => ({ salvarArquivo: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { salvarArquivo } from "@/lib/storage";
import { adicionarVersao } from "@/app/(shell)/catalogo/[id]/actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const editarPermitido = podeEditarConteudo as ReturnType<typeof vi.fn>;
const salvar = salvarArquivo as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const transacao = prisma.$transaction as ReturnType<typeof vi.fn>;

const versaoCreate = vi.fn();
const versaoUpdateMany = vi.fn();
const versaoCount = vi.fn();

function formDataCom(nome: string) {
  const fd = new FormData();
  fd.set("arquivo", new File(["conteudo"], nome, { type: "application/pdf" }));
  return fd;
}

describe("adicionarVersao — anexo manual não substitui nada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1" });
    editarPermitido.mockReturnValue(true);
    findUnique.mockResolvedValue({ id: "p1" });
    salvar.mockResolvedValue({ hash: "h1", tamanho: 10, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    transacao.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount } });
    });
  });

  it("não chama updateMany (não marca nada como substituída)", async () => {
    await adicionarVersao("p1", formDataCom("planilha-reembolso.xlsx"));
    expect(versaoUpdateMany).not.toHaveBeenCalled();
  });

  it("cria o documento com oficial: false", async () => {
    await adicionarVersao("p1", formDataCom("planilha-reembolso.xlsx"));
    expect(versaoCreate).toHaveBeenCalledTimes(1);
    expect(versaoCreate.mock.calls[0][0].data.documento.create.oficial).toBe(false);
  });
});
