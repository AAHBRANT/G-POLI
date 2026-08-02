import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica, filtroVisibilidade } from "@/lib/auth/usuario";
import CriarDocumentoMenu from "@/components/politica/CriarDocumentoMenu";

export const dynamic = "force-dynamic";

// Rótulo humano por tipo de ação de auditoria + ícone + se é ação de IA (tag
// lilás). "ia.aplicar"/"ia.gerar" faltavam aqui antes — apareciam na tela como
// a chave crua do banco ("ia.aplicar 7 seções"), achado ao redesenhar esta
// página.
const ACAO_INFO: Record<string, { texto: string; icone: string; cor: string; ia?: boolean }> = {
  "politica.criar": { texto: "criou a norma", icone: "M12 4v16m8-8H4", cor: "text-marsala" },
  "politica.publicar": { texto: "publicou", icone: "M5 13l4 4L19 7", cor: "text-emerald-600" },
  "politica.revogar": { texto: "revogou", icone: "M18 6L6 18M6 6l12 12", cor: "text-red-600" },
  "politica.reabrir": { texto: "reabriu", icone: "M4 4v6h6M4 10a8 8 0 1015-4", cor: "text-amber-600" },
  "secao.salvar": { texto: "editou seção de", icone: "M11 4h9M11 4l-7 7-2 5 5-2 7-7", cor: "text-black/50" },
  "secao.abertura": { texto: "liberou seção de", icone: "M12 15a3 3 0 100-6 3 3 0 000 6z", cor: "text-black/50" },
  "versao.upload": { texto: "enviou versão de", icone: "M12 4v12m0-12l4 4m-4-4L8 8M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3", cor: "text-black/50" },
  "usuario.perfil": { texto: "alterou cargo", icone: "M12 15a3 3 0 100-6 3 3 0 000 6z", cor: "text-black/50" },
  "usuario.convidar": { texto: "convidou usuário", icone: "M12 4v16m8-8H4", cor: "text-black/50" },
  "usuario.ativo": { texto: "ativou/desativou usuário", icone: "M5 13l4 4L19 7", cor: "text-black/50" },
  "usuario.remover": { texto: "removeu usuário", icone: "M18 6L6 18M6 6l12 12", cor: "text-red-600" },
  "ciencia.dar": { texto: "deu ciência em", icone: "M5 13l4 4L19 7", cor: "text-emerald-600" },
  "ia.gerar": { texto: "gerou rascunho com IA para", icone: "M13 2L3 14h7l-1 8 10-12h-7l1-8z", cor: "text-violet-600", ia: true },
  "ia.aplicar": { texto: "aplicou rascunho de IA em", icone: "M13 2L3 14h7l-1 8 10-12h-7l1-8z", cor: "text-violet-600", ia: true },
  "politica.audiencia": { texto: "definiu público-alvo de", icone: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-8.13a4 4 0 110 8 4 4 0 010-8z", cor: "text-black/50" },
  "consorcio.criar": { texto: "criou consórcio", icone: "M12 4v16m8-8H4", cor: "text-black/50" },
  "consorcio.renomear": { texto: "renomeou consórcio", icone: "M11 4h9M11 4l-7 7-2 5 5-2 7-7", cor: "text-black/50" },
  "consorcio.ativo": { texto: "ativou/desativou consórcio", icone: "M5 13l4 4L19 7", cor: "text-black/50" },
  "usuario.consorcios": { texto: "alterou consórcios do usuário", icone: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-8.13a4 4 0 110 8 4 4 0 010-8z", cor: "text-black/50" },
};

const primeiroNome = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

function tempoRelativo(data: Date): string {
  const diffMs = Date.now() - data.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(data); dia.setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoje.getTime() - dia.getTime()) / 86400000);
  if (diffDias === 1) return "ontem";
  if (diffDias < 7) return `há ${diffDias} dias`;
  return data.toLocaleDateString("pt-BR");
}

function Icone({ path, className }: { path: string; className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}

export default async function Home() {
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  // Mesma regra de visibilidade das listagens (PR #37): {} = vê tudo.
  // Achado ao mexer aqui: o painel mostrava contagens e atividade da empresa
  // inteira (inclusive título de política de outro setor) pra qualquer
  // perfil, sem checar isso — mesma família do bug de visibilidade corrigido
  // nas listagens, só que aqui.
  const veTudo = Object.keys(filtroVisibilidade(usuario)).length === 0;

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  if (!veTudo) {
    // Colaborador (e Gestor de Setor sem setor): painel pessoal, sem números
    // nem atividade da empresa inteira — só o que diz respeito a ele.
    // v3 (Fase B): fonte única de verdade é a tabela Pendencia (por versão),
    // não mais Politica/Ciencia direto — a query antiga ignorava versão
    // (bug corrigido na Fase A no gate de "já ciente" da página do
    // documento; aqui era a mesma classe de bug, na home).
    const pendentesCiencia =
      usuario && usuario.id
        ? await prisma.pendencia.findMany({
            where: { usuarioId: usuario.id, estado: "pendente" },
            include: { politica: { select: { id: true, titulo: true } } },
            orderBy: { criadaEm: "desc" },
            take: 8,
          })
        : [];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-marsala">
            Olá{primeiroNome(usuario?.nome ?? "") ? `, ${primeiroNome(usuario!.nome)}` : ""} 👋
          </h1>
          <p className="text-sm text-black/50">Normas publicadas para você.</p>
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-black/80">
            Aguardando sua ciência {pendentesCiencia.length > 0 && `(${pendentesCiencia.length})`}
          </h2>
          {pendentesCiencia.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">Nenhuma pendência — você está em dia.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {pendentesCiencia.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/catalogo/${p.politica.id}`} className="font-medium text-marsala hover:underline">{p.politica.titulo}</Link>
                  <span className="text-xs text-black/40">
                    publicada {tempoRelativo(p.politicaPublicadaEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href="/busca" className="inline-block rounded-lg border border-black/15 px-4 py-2 text-sm text-black/70 transition hover:bg-black/5">
          Buscar norma
        </Link>
      </div>
    );
  }

  const [publicadas, rascunho, revogadas, total, publicadasUlt30, criadasUlt30, semCiencia, areasComContagem, atividades, rascunhosRecentes] =
    await Promise.all([
      prisma.politica.count({ where: { estado: "publicada" } }),
      prisma.politica.count({ where: { estado: "rascunho" } }),
      prisma.politica.count({ where: { estado: "revogada" } }),
      prisma.politica.count(),
      prisma.politica.count({ where: { publicadaEm: { gte: trintaDiasAtras } } }),
      prisma.politica.count({ where: { criadaEm: { gte: trintaDiasAtras } } }),
      prisma.politica.count({ where: { estado: "publicada", ciencias: { none: {} } } }),
      prisma.area.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { politicas: true } } } }),
      prisma.auditoria.findMany({ orderBy: { criadoEm: "desc" }, take: 8 }),
      prisma.politica.findMany({ where: { estado: "rascunho" }, orderBy: { criadaEm: "desc" }, take: 5, include: { area: true } }),
    ]);

  const cards = [
    { titulo: "Total de normas", valor: total, cor: "text-marsala", bg: "bg-marsala/5", href: "/catalogo", icone: "M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z", tendencia: criadasUlt30 > 0 ? `+${criadasUlt30} este mês` : null },
    { titulo: "Publicadas", valor: publicadas, cor: "text-emerald-700", bg: "bg-emerald-50", href: "/busca?estado=publicada", icone: "M5 13l4 4L19 7", tendencia: publicadasUlt30 > 0 ? `+${publicadasUlt30} este mês` : null },
    { titulo: "Em rascunho", valor: rascunho, cor: "text-amber-700", bg: "bg-amber-50", href: "/busca?estado=rascunho", icone: "M11 4h9M11 4l-7 7-2 5 5-2 7-7", tendencia: null },
    { titulo: "Revogadas", valor: revogadas, cor: "text-red-700", bg: "bg-red-50", href: "/busca?estado=revogada", icone: "M18 6L6 18M6 6l12 12", tendencia: null },
  ];

  // Bar horizontal simples (sem lib de gráfico) — setores sem norma nenhuma
  // ficam de fora, senão a lista só cresce sem informação nova.
  const areasComNorma = areasComContagem.filter((a) => a._count.politicas > 0).sort((a, b) => b._count.politicas - a._count.politicas);
  const maiorContagem = Math.max(1, ...areasComNorma.map((a) => a._count.politicas));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marsala">
            Olá{primeiroNome(usuario?.nome ?? "") ? `, ${primeiroNome(usuario!.nome)}` : ""} 👋
          </h1>
          <p className="text-sm text-black/50">Painel de gestão de normativos da AAHBRANT.</p>
        </div>
        <div className="flex gap-2">
          {podeCriar && <CriarDocumentoMenu />}
          <Link href="/busca" className="rounded-lg border border-black/15 px-4 py-2 text-sm text-black/70 transition hover:bg-black/5">
            Buscar norma
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.titulo} href={c.href} className={`rounded-xl border border-black/10 ${c.bg} p-4 transition hover:border-marsala/30 hover:shadow-premium`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-black/50">{c.titulo}</div>
              <Icone path={c.icone} className={c.cor} />
            </div>
            <div className={`mt-1 text-3xl font-semibold ${c.cor}`}>{c.valor}</div>
            {c.tendencia && <div className="mt-0.5 text-[11px] text-black/40">{c.tendencia}</div>}
          </Link>
        ))}
      </section>

      {semCiencia > 0 && (
        <Link href="/busca?estado=publicada" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100">
          <span className="text-lg">⚠️</span>
          <span>
            <strong>{semCiencia}</strong> norma{semCiencia > 1 ? "s" : ""} publicada{semCiencia > 1 ? "s" : ""} sem nenhuma ciência registrada.
          </span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-black/80">Atividade recente</h2>
          {atividades.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">Sem atividade ainda.</p>
          ) : (
            <ul className="space-y-3">
              {atividades.map((a) => {
                const info = ACAO_INFO[a.acao] ?? { texto: a.acao, icone: "M12 8v4m0 4h.01", cor: "text-black/40" };
                return (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/5 ${info.cor}`}>
                      <Icone path={info.icone} />
                    </span>
                    <span className="text-black/70">
                      <strong className="font-medium text-black/80">{primeiroNome(a.usuarioNome) || a.usuarioEmail}</strong>{" "}
                      {info.texto}{" "}
                      {a.detalhe && <span className="text-black/60">{a.detalhe}</span>}
                      {info.ia && (
                        <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">IA</span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-black/35">
                      {tempoRelativo(a.criadoEm)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-black/80">Normas por área</h2>
          {areasComNorma.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">Nenhuma norma cadastrada ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {areasComNorma.map((a) => (
                <li key={a.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-black/70">{a.nome}</span>
                    <span className="font-medium text-marsala">{a._count.politicas}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-marsala"
                      style={{ width: `${(a._count.politicas / maiorContagem) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {rascunhosRecentes.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white shadow-card">
          <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-black/80">Rascunhos recentes</h2>
          <ul className="divide-y divide-black/5">
            {rascunhosRecentes.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <Link href={`/catalogo/${p.id}`} className="font-medium text-marsala hover:underline">{p.titulo}</Link>
                <span className="text-xs text-black/40">{p.area.nome} · {tempoRelativo(p.criadaEm)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
