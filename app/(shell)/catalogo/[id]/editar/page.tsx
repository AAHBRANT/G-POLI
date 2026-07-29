import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SecaoEditor from "@/components/politica/SecaoEditor";
import GerarEsqueletoBtn from "@/components/politica/GerarEsqueletoBtn";
import GerarIAButton from "@/components/politica/GerarIAButton";
import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";
import { getUsuarioAtual, podeEditarConteudo, podeEditarSecao, podeGerirAberturaArea, filtroVisibilidade } from "@/lib/auth/usuario";
import { iaDisponivel } from "@/lib/politica/ai";

export const dynamic = "force-dynamic";

export default async function EditarConteudo({ params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  // findFirst (não findUnique) + filtroVisibilidade: sem isso, o texto
  // completo de qualquer seção (inclusive classificação Restrito de outro
  // setor) ficava exposto a qualquer usuário logado que soubesse o id —
  // "podeEditar" só travava a EDIÇÃO, nunca a leitura. Mesma família do bug
  // corrigido na página de detalhe (PR #37), só que aqui vazava texto de
  // verdade, não só metadado.
  const politica = await prisma.politica.findFirst({
    where: { id: params.id, AND: [filtroVisibilidade(usuario)] },
    include: { secoes: { orderBy: { ordem: "asc" } } },
  });
  if (!politica) notFound();
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
