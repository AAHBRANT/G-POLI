import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

const ACAO_ROTULO: Record<string, string> = {
  "politica.criar": "criou a norma",
  "politica.publicar": "publicou",
  "politica.revogar": "revogou",
  "politica.reabrir": "reabriu",
  "secao.salvar": "editou seção de",
  "secao.abertura": "liberou seção de",
  "versao.upload": "enviou versão de",
  "usuario.perfil": "alterou cargo",
  "usuario.convidar": "convidou usuário",
  "usuario.ativo": "ativou/desativou usuário",
  "usuario.remover": "removeu usuário",
  "ciencia.dar": "deu ciência em",
};

const primeiroNome = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

export default async function Home() {
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);

  const [publicadas, rascunho, revogadas, total, semCiencia, areas, atividades] = await Promise.all([
    prisma.politica.count({ where: { estado: "publicada" } }),
    prisma.politica.count({ where: { estado: "rascunho" } }),
    prisma.politica.count({ where: { estado: "revogada" } }),
    prisma.politica.count(),
    prisma.politica.count({ where: { estado: "publicada", ciencias: { none: {} } } }),
    prisma.area.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { politicas: true } } },
    }),
    prisma.auditoria.findMany({ orderBy: { criadoEm: "desc" }, take: 8 }),
  ]);

  const cards = [
    { titulo: "Total de normas", valor: total, cor: "text-marsala", href: "/catalogo" },
    { titulo: "Publicadas", valor: publicadas, cor: "text-emerald-700", href: "/busca?estado=publicada" },
    { titulo: "Em rascunho", valor: rascunho, cor: "text-amber-700", href: "/busca?estado=rascunho" },
    { titulo: "Revogadas", valor: revogadas, cor: "text-red-700", href: "/busca?estado=revogada" },
  ];

  return (
    <div className="space-y-6">
      {/* Saudação + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marsala">
            Olá{primeiroNome(usuario?.nome ?? "") ? `, ${primeiroNome(usuario!.nome)}` : ""} 👋
          </h1>
          <p className="text-sm text-black/50">Painel de gestão de normativos da AAHBRANT.</p>
        </div>
        <div className="flex gap-2">
          {podeCriar && (
            <Link href="/catalogo" className="rounded-lg bg-marsala px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-marsala-600">
              + Nova política
            </Link>
          )}
          <Link href="/busca" className="rounded-lg border border-black/15 px-4 py-2 text-sm text-black/70 transition hover:bg-black/5">
            Buscar norma
          </Link>
        </div>
      </div>

      {/* Cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.titulo} href={c.href} className="rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:border-marsala/30 hover:shadow-premium">
            <div className="text-xs text-black/50">{c.titulo}</div>
            <div className={`mt-1 text-3xl font-semibold ${c.cor}`}>{c.valor}</div>
          </Link>
        ))}
      </section>

      {/* Alerta: publicadas sem ciência */}
      {semCiencia > 0 && (
        <Link href="/busca?estado=publicada" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100">
          <span className="text-lg">⚠️</span>
          <span>
            <strong>{semCiencia}</strong> norma{semCiencia > 1 ? "s" : ""} publicada{semCiencia > 1 ? "s" : ""} sem nenhuma ciência registrada.
          </span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Atividade recente */}
        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-black/80">Atividade recente</h2>
          {atividades.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">Sem atividade ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {atividades.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marsala/40" />
                  <span className="text-black/70">
                    <strong className="font-medium text-black/80">{primeiroNome(a.usuarioNome) || a.usuarioEmail}</strong>{" "}
                    {ACAO_ROTULO[a.acao] ?? a.acao}{" "}
                    {a.detalhe && <span className="text-black/60">{a.detalhe}</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-black/35">
                    {a.criadoEm.toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Normas por área */}
        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-black/80">Normas por área</h2>
          {areas.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">Nenhuma área ainda.</p>
          ) : (
            <ul className="space-y-2">
              {areas.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-black/70">{a.nome}</span>
                  <span className="rounded-full bg-marsala-50 px-2 py-0.5 text-xs font-medium text-marsala">
                    {a._count.politicas}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
