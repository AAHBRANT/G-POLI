import { describe, it, expect } from "vitest";
import { codigoFalhaSso, mensagemFalhaSso } from "@/lib/auth/mensagens";

// A regra que estes testes protegem: falha de infraestrutura NÃO pode aparecer
// como problema de identidade. Foi o que aconteceu em 2026-07-28 — o banco caiu,
// a tela disse "Token do Teams inválido" e o diagnóstico foi para o manifest.
describe("categoria da falha de SSO", () => {
  it("401 é problema de token", () => {
    expect(codigoFalhaSso(401)).toBe("token_invalido");
  });

  it("403 é falta de acesso", () => {
    expect(codigoFalhaSso(403)).toBe("sem_acesso");
  });

  it("503 é indisponibilidade nossa, não do token", () => {
    expect(codigoFalhaSso(503)).toBe("indisponivel");
  });

  it("status inesperado não vira nenhuma das categorias específicas", () => {
    expect(codigoFalhaSso(500)).toBe("desconhecido");
    expect(codigoFalhaSso(200)).toBe("desconhecido");
  });
});

describe("mensagem mostrada ao usuário", () => {
  it("indisponibilidade cita banco de dados e sugere tentar depois", () => {
    const m = mensagemFalhaSso("indisponivel");
    expect(m).toMatch(/banco de dados/i);
    expect(m).toMatch(/alguns minutos/i);
  });

  it("indisponibilidade NÃO culpa a identidade do usuário", () => {
    const m = mensagemFalhaSso("indisponivel");
    expect(m).not.toMatch(/token/i);
    expect(m).not.toMatch(/identidade/i);
  });

  it("token inválido fala de identidade, não de banco", () => {
    const m = mensagemFalhaSso("token_invalido");
    expect(m).toMatch(/identidade/i);
    expect(m).not.toMatch(/banco/i);
  });

  it("sem acesso orienta procurar o administrador", () => {
    expect(mensagemFalhaSso("sem_acesso")).toMatch(/administrador/i);
  });

  it("toda categoria tem mensagem não vazia", () => {
    for (const c of ["token_invalido", "sem_acesso", "indisponivel", "desconhecido"] as const) {
      expect(mensagemFalhaSso(c).length).toBeGreaterThan(10);
    }
  });
});
