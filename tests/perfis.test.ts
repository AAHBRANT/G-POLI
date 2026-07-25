import { describe, it, expect } from "vitest";
import { CARGOS, rotuloCargo, CARGOS_PRIVILEGIADOS } from "@/lib/perfis";

// Primeira suíte da Fase 0 — funções puras (sem dependência de banco/servidor).
describe("perfis / cargos (RBAC)", () => {
  it("expõe os 6 cargos do modelo", () => {
    expect(CARGOS.map((c) => c.valor)).toEqual([
      "superadmin", "admin", "diretoria", "sgi", "area", "colaborador",
    ]);
  });

  it("rotula cargos conhecidos", () => {
    expect(rotuloCargo("superadmin")).toBe("Super Admin");
    expect(rotuloCargo("area")).toBe("Gestor de Setor");
  });

  it("devolve o próprio valor para cargo desconhecido", () => {
    expect(rotuloCargo("inexistente")).toBe("inexistente");
  });

  it("cargos privilegiados = superadmin + admin", () => {
    expect(CARGOS_PRIVILEGIADOS).toEqual(["superadmin", "admin"]);
  });
});
