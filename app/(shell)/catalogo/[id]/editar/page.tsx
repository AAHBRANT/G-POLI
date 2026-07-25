import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SecaoEditor from "@/components/SecaoEditor";
import GerarEsqueletoBtn from "@/components/GerarEsqueletoBtn";
import GerarIAButton from "@/components/GerarIAButton";
import { ESQUELETO_PADRAO } from "@/lib/esqueleto";
import { getUsuarioAtual, podeEditarConteudo, podeEditarSecao, podeGerirAberturaArea } from "@/lib/auth/usuario";
import { iaDisponivel } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function EditarConteudo({ params }: { params: { id: string } }) {
  const politica = await prisma.politica.findUnique({
    where: { id: params.id },
    include: { secoes: { orderBy: { ordem: "asc" } } },
  });
  if (!politica) notFound();

  const usuario = await getUsuarioAtual();
  const mostrarToggle = podeGerirAberturaArea(usuario);
  const podeEditar = podeEditarConteudo(usuario, politica);
  const dicas = Object.fromEntries(ESQUELETO_PADRAO.map((s) => [s.codigo, s.dica]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/catalogo/${politica.id}`} className="text-xs text-marsala hover:underline">
            ← Voltar à política
          </Link>
          <h2 className="mt-2 text-lg font-semibold text-marsala">
            Editar conteúdo — {politica.titulo}
          </h2>
          <p className="text-sm text-black/50">Estrutura normativa padrão AAHBRANT.</p>
        </div>
        {podeEditar && politica.secoes.length > 0 && (
          <GerarIAButton politicaId={politica.id} disponivel={iaDisponivel()} />
        )}
      </div>

      {politica.secoes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center">
          <p className="mb-4 text-sm text-black/60">
            Esta política ainda não tem conteúdo estruturado.
          </p>
          <GerarEsqueletoBtn politicaId={politica.id} />
        </div>
      ) : (
        politica.secoes.map((s) => (
          <SecaoEditor
            key={s.id}
            id={s.id}
            codigo={s.codigo}
            titulo={s.titulo}
            tipo={s.tipo}
            corpo={s.corpo}
            colunas={(s.colunas as string[] | null) ?? []}
            linhas={(s.linhas as string[][] | null) ?? []}
            dica={dicas[s.codigo] ?? undefined}
            podeEditar={podeEditarSecao(usuario, politica, s)}
            abertaAArea={s.abertaAArea}
            mostrarToggle={mostrarToggle}
          />
        ))
      )}
    </div>
  );
}
