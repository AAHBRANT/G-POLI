import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar, filtroVisibilidade } from "@/lib/auth/usuario";
import { corClassificacao, rotuloClassificacao } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Sprint 4/5/6: modelo A (rascunho → Diretoria publica direto) e modelo B
// (rascunho → Gestor → Diretoria) coexistem — nenhuma política é obrigada a
// passar pelo Gestor, mas quem enviar pra aprovação passa por aqui.
const COLUNAS: { estado: string; titulo: string; dica: string; cor: string }[] = [
  { estado: "rascunho", titulo: "Rascunho", dica: "Ainda não enviada para aprovação (ou Diretoria pode publicar direto).", cor: "text-black/70" },
  { estado: "em_aprovacao_gestor", titulo: "Aguardando Gestor", dica: "Gestor do setor dono revisa e aprova ou rejeita.", cor: "text-amber-800" },
  { estado: "em_aprovacao_diretoria", titulo: "Aguardando Diretoria", dica: "Já passou pelo Gestor — falta a aprovação final.", cor: "text-amber-900" },
  { estado: "publicada", titulo: "Publicadas", dica: "Normas oficiais em vigência.", cor: "text-emerald-800" },
  { estado: "revogada", titulo: "Revogadas", dica: "Normas que deixaram de valer.", cor: "text-red-800" },
];

export default async function PublicacaoPage() {
  const atual = await getUsuarioAtual();
  // Diretoria/admin/super veem tudo (mesma alçada de publicar); Gestor de
  // Setor (perfil "area") vê a fila do(s) próprio(s) setor(es) — precisa
  // acompanhar o que está esperando ele mesmo, mesmo sem poder publicar.
  const ehGestorDeSetor = atual?.perfil === "area" && atual.setores.length > 0;
  if (!podePublicar(atual) && !ehGestorDeSetor) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/60">
        Acesso restrito. A aprovação/publicação de normas é atribuição do Gestor do setor e da Diretoria.
      </div>
    );
  }

  const politicas = await prisma.politica.findMany({
    where: podePublicar(atual) ? undefined : filtroVisibilidade(atual),
    include: { area: true },
    orderBy: { criadaEm: "desc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-marsala">Publicação de Normas</h2>
        <p className="text-sm text-black/50">
          Fluxo de aprovação: rascunho → Gestor do setor → Diretoria → publicada. Ações na página de cada norma.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
