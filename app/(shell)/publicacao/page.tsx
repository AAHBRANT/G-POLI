import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { corClassificacao, rotuloClassificacao } from "@/lib/constants";

export const dynamic = "force-dynamic";

const COLUNAS: { estado: string; titulo: string; dica: string; cor: string }[] = [
  { estado: "rascunho", titulo: "Aguardando publicação", dica: "Rascunhos prontos para a Diretoria revisar e publicar.", cor: "text-black/70" },
  { estado: "publicada", titulo: "Publicadas", dica: "Normas oficiais em vigência.", cor: "text-emerald-800" },
  { estado: "revogada", titulo: "Revogadas", dica: "Normas que deixaram de valer.", cor: "text-red-800" },
];

export default async function PublicacaoPage() {
  const atual = await getUsuarioAtual();
  if (!podePublicar(atual)) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/60">
        Acesso restrito. A publicação de normas é atribuição da Diretoria.
      </div>
    );
  }

  const politicas = await prisma.politica.findMany({
    include: { area: true },
    orderBy: { criadaEm: "desc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-marsala">Publicação de Normas</h2>
        <p className="text-sm text-black/50">
          Fluxo de aprovação (modelo A). Diretoria publica, revoga ou reabre para revisão — na página de cada norma.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = politicas.filter((p) => p.estado === col.estado);
          return (
            <section key={col.estado} className="overflow-hidden rounded-lg border border-black/10 bg-white">
              <div className="border-b border-black/5 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${col.cor}`}>{col.titulo}</h3>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">
                    {lista.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-black/40">{col.dica}</p>
              </div>
              {lista.length === 0 ? (
                <p className="p-5 text-center text-xs text-black/40">Nenhuma.</p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {lista.map((p) => (
                    <li key={p.id}>
                      <Link href={`/catalogo/${p.id}`} className="block px-4 py-2.5 hover:bg-black/[0.02]">
                        <div className="text-sm font-medium text-black/80">{p.titulo}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-black/45">{p.area.nome}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${corClassificacao(p.classificacao)}`}>
                            {rotuloClassificacao(p.classificacao)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
