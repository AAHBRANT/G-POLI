import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    area: { upsert: vi.fn() },
    politica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeCriarPolitica: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));
vi.mock("@/lib/politica/codigo", () => ({ gerarCodigoNormativo: vi.fn().mockResolvedValue("AHBT-POL-TI-001") }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { criarPolitica } from "@/app/(shell)/catalogo/actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const podeCriar = podeCriarPolitica as ReturnType<typeof vi.fn>;
const upsert = prisma.area.upsert as ReturnType<typeof vi.fn>;
const create = prisma.politica.create as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

function formData(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("criarPolitica — consorcioId", () => {
  it("sem consorcio no form: consorcioId fica undefined (AAHBRANT/todos)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: undefined }) }),
    );
  });

  it("com consorcio selecionado: persiste consorcioId", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno", consorcioId: "c1" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: "c1" }) }),
    );
  });
});
