import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { getUsuarioAtual, filtroVisibilidade } from "@/lib/auth/usuario";

// Download do documento original. Middleware só garante sessão válida —
// autorização por política (setor/público-alvo/consórcio) é checada aqui,
// mesmo filtro usado no catálogo (ver catalogo/[id]/page.tsx).
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const doc = await prisma.documento.findUnique({
    where: { id: params.id },
    include: { versao: true },
  });
  if (!doc) return new NextResponse("Não encontrado", { status: 404 });
  // Versão oficial substituída não é baixável — só visualizável em tela via
  // VerVersaoAntiga (ver spec 2026-08-02-versao-substituida-ver-nao-baixar-design.md).
  if (doc.oficial && doc.versao.estado === "substituida") {
    return new NextResponse("Versão substituída — download indisponível.", { status: 403 });
  }

  const usuario = await getUsuarioAtual();
  const politicaVisivel = await prisma.politica.findFirst({
    where: { id: doc.versao.politicaId, AND: [filtroVisibilidade(usuario)] },
    select: { id: true },
  });
  if (!politicaVisivel) return new NextResponse("Não encontrado", { status: 404 });

  const ext = path.extname(doc.nome);
  const caminho = path.join(doc.versao.politicaId, `${doc.hash}${ext}`);

  try {
    const bytes = await lerArquivo(caminho);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": doc.tipo || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nome)}"`,
        "Content-Length": String(doc.tamanho),
      },
    });
  } catch {
    return new NextResponse("Arquivo indisponível", { status: 410 });
  }
}
