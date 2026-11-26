import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { reindexarTodos } from "@/lib/politica/indiceServidor";

export const dynamic = "force-dynamic";

// Reconstrói o índice por seção de TODOS os documentos publicados. Uso
// operacional (após importar o acervo, restaurar backup ou migrar). Só
// admin/super admin. É idempotente.
export async function POST() {
  const usuario = await getUsuarioAtual();
  if (!usuario || (usuario.perfil !== "admin" && usuario.perfil !== "superadmin")) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }
  const resultado = await reindexarTodos();
  return NextResponse.json({ ok: true, ...resultado });
}
