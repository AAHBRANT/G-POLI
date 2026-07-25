// Cargos (perfis RBAC) do G-Políticas. Nomes de domínio + rótulo amigável.
export const CARGOS = [
  { valor: "superadmin", rotulo: "Super Admin", desc: "Gerencia administradores, setores e regras gerais" },
  { valor: "admin", rotulo: "Admin", desc: "Gerencia usuários comuns e vê auditoria" },
  { valor: "diretoria", rotulo: "Diretoria", desc: "Aprova e publica normas" },
  { valor: "sgi", rotulo: "SGI / Qualidade", desc: "Dono do conteúdo — edita as normas" },
  { valor: "area", rotulo: "Gestor de Setor", desc: "Admin restrito ao(s) seu(s) setor(es) + edita seções liberadas" },
  { valor: "colaborador", rotulo: "Colaborador", desc: "Só lê normas publicadas" },
] as const;

export function rotuloCargo(valor: string): string {
  return CARGOS.find((c) => c.valor === valor)?.rotulo ?? valor;
}

// Cargos que só o Super Admin pode atribuir.
export const CARGOS_PRIVILEGIADOS = ["superadmin", "admin"];
