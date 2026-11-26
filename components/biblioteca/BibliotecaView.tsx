import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, filtroVisibilidade, veAlertasDeQualidade } from "@/lib/auth/usuario";
import { ehOrfao } from "@/lib/politica/hierarquia";
import { situacaoRevisao, textoRevisao } from "@/lib/politica/revisao";
import {
  ESTADOS_POLITICA,
  TIPOS_DOCUMENTO,
  corClassificacao,
  rotuloClassificacao,
  tipoDocumento,
  type TipoDocumentoValor,
} from "@/lib/constants";
import {
  ESTADOS_FILTRAVEIS,
  clausulaAlerta,
  hrefBiblioteca,
  normalizarParamsBiblioteca,
  temCriterioBiblioteca,
  whereBase,
  whereBiblioteca,
} from "@/lib/politica/biblioteca";
import PainelBiblioteca from "./PainelBiblioteca";
import BuscaBiblioteca from "./BuscaBiblioteca";
import FiltroPilulas from "./FiltroPilulas";
import SeletorSetor from "./SeletorSetor";
import ListaDocumentos, { type LinhaBiblioteca } from "./ListaDocumentos";
import NumeroAnimado from "./NumeroAnimado";
import PainelVidro from "./PainelVidro";

const LIMITE = 100;

// Visão "biblioteca" de uma lista de documentos: topo em vidro bege com busca
// ao vivo, filtros em pílula e lista com realce deslizante. Substitui o antigo
// painel + tabela em TODAS as seções do menu:
//  - `tipoFixo` definido   → seção de um tipo (Políticas, Normas, Procedimentos…)
//  - `tipoFixo` indefinido → Busca geral, com pílulas de tipo.
// `acoes` (criar/importar, só para quem pode) aparece logo abaixo do topo.
export default async function BibliotecaView({
  base,
  tipoFixo,
  titulo,
  descricao,
  searchParams,
  acoes,
  vazioTotal,
}: {
  base: string;
  tipoFixo?: TipoDocumentoValor;
  titulo: string;
  descricao: string;
  searchParams: { q?: string; tipo?: string; area?: string; estado?: string };
  acoes?: ReactNode;
  vazioTotal?: ReactNode;
}) {
  const p = normalizarParamsBiblioteca(searchParams);
  if (tipoFixo) p.tipo = ""; // a tela já é de um tipo só
  const usuario = await getUsuarioAtual();
  const veAlertas = veAlertasDeQualidade(usuario);
  if (!veAlertas) p.alerta = ""; // alertas de qualidade são da gestão
  const agora = new Date();
  const visibilidade = filtroVisibilidade(usuario);
  const escopo = whereBase(visibilidade, tipoFixo);
  const filtrando = temCriterioBiblioteca(p);
  const filtro = { ...p, tipo: tipoFixo ?? p.tipo };

  // Busca também em tabelas (linhas JSON): Prisma não filtra substring em Json.
  let idsPorTabela: string[] = [];
  if (p.q) {
    const achados = await prisma.$queryRaw<{ politicaId: string }[]>`
      SELECT DISTINCT "politicaId" FROM "Secao" WHERE "linhas"::text ILIKE ${"%" + p.q + "%"}
    `;
    idsPorTabela = achados.map((r) => r.politicaId);
  }

  const contarAlerta = (a: "vencida" | "vencendo" | "orfao") =>
    veAlertas ? prisma.politica.count({ where: { AND: [...escopo.AND, clausulaAlerta(a, agora)] } }) : 0;

  const [porTipo, porEstado, porArea, areas, itens, pendencias, nVencida, nVencendo, nOrfao] = await Promise.all([
    tipoFixo ? [] : prisma.politica.groupBy({ by: ["tipo"], where: escopo, _count: { _all: true } }),
    prisma.politica.groupBy({ by: ["estado"], where: escopo, _count: { _all: true } }),
    prisma.politica.groupBy({ by: ["areaId"], where: escopo, _count: { _all: true } }),
    prisma.area.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.politica.findMany({
      where: whereBiblioteca(visibilidade, filtro, idsPorTabela, agora),
      include: { area: { select: { nome: true } } },
      orderBy: p.q ? [{ titulo: "asc" }] : [{ criadaEm: "desc" }],
      take: LIMITE,
    }),
    usuario?.id
      ? prisma.pendencia.findMany({
          where: { usuarioId: usuario.id, estado: "pendente" },
          select: { politicaId: true },
        })
      : [],
    contarAlerta("vencida"),
    contarAlerta("vencendo"),
    contarAlerta("orfao"),
  ]);

  const pendentesIds = new Set(pendencias.map((x) => x.politicaId));
  const contTipo = new Map(porTipo.map((x) => [x.tipo as string, x._count._all]));
  const contEstado = new Map(porEstado.map((x) => [x.estado as string, x._count._all]));
  const contArea = new Map(porArea.map((x) => [x.areaId, x._count._all]));
  const total = porEstado.reduce((s, x) => s + x._count._all, 0);
  const areaSelecionada = areas.find((a) => a.id === p.areaId);
  const setores = areas
    .filter((a) => (contArea.get(a.id) ?? 0) > 0)
    .map((a) => ({ id: a.id, nome: a.nome, total: contArea.get(a.id) ?? 0 }));

  const alertasDe = (d: { tipo: string; estado: string; paiId: string | null; proximaRevisaoEm: Date | null }) => {
    const lista: { texto: string; grave: boolean }[] = [];
    if (d.estado !== "revogada" && ehOrfao(d.tipo as never, d.paiId)) lista.push({ texto: "Sem documento superior", grave: false });
    if (d.estado === "publicada") {
      const sit = situacaoRevisao(d.proximaRevisaoEm, agora);
      const txt = textoRevisao(d.proximaRevisaoEm, agora);
      if (sit === "vencida" && txt) lista.push({ texto: txt, grave: true });
      else if (sit === "vence_em_breve" && txt) lista.push({ texto: txt, grave: false });
    }
    return lista;
  };

  const linhas: LinhaBiblioteca[] = itens.map((d) => {
    const est = ESTADOS_POLITICA[d.estado] ?? { rotulo: d.estado, cor: "bg-black/10 text-black/70" };
    return {
      id: d.id,
      codigo: d.codigo,
      titulo: d.titulo,
      tipoRotulo: tipoDocumento(d.tipo).rotulo,
      areaNome: d.area.nome,
      revisao: d.revisao,
      datado:
        d.estado === "publicada" && d.publicadaEm
          ? `vigente desde ${d.publicadaEm.toLocaleDateString("pt-BR")}`
          : `criada em ${d.criadaEm.toLocaleDateString("pt-BR")}`,
      estado: d.estado,
      estadoRotulo: est.rotulo,
      estadoCor: est.cor,
      alertas: veAlertas ? alertasDe(d) : [],
      classificacaoRotulo: rotuloClassificacao(d.classificacao),
      classificacaoCor: corClassificacao(d.classificacao),
      pendente: pendentesIds.has(d.id),
    };
  });

  // Estados só aparecem como filtro quando há mais de um com documentos
  // (colaborador só enxerga publicados → não há filtro de estado a mostrar).
  const opcoesEstado = ESTADOS_FILTRAVEIS.map((e) => ({
    valor: e as string,
    rotulo: ESTADOS_POLITICA[e]?.rotulo ?? e,
    total: contEstado.get(e) ?? 0,
  })).filter((o) => o.total > 0);
  const mostrarEstados = opcoesEstado.length > 1;
  const opcoesAlerta = [
    { valor: "vencida", rotulo: "Revisão vencida", total: nVencida },
    { valor: "vencendo", rotulo: "Vencem em 30 dias", total: nVencendo },
    { valor: "orfao", rotulo: "Sem documento superior", total: nOrfao },
  ].filter((o) => o.total > 0 || o.valor === p.alerta);
  const opcoesTipo = TIPOS_DOCUMENTO.map((t) => ({
    valor: t.valor as string,
    rotulo: t.rotuloPlural,
    total: contTipo.get(t.valor) ?? 0,
  }));

  return (
    <PainelBiblioteca>
      <div className="mx-auto max-w-5xl space-y-6">
        <PainelVidro>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-black/70">{descricao}</p>
              </div>
              {total > 0 && (
                <div className="flex items-end gap-2.5">
                  <NumeroAnimado valor={total} className="text-5xl font-semibold text-black sm:text-6xl" />
                  <span className="pb-1 text-xs font-medium leading-tight text-black/65">
                    {total === 1 ? "documento" : "documentos"}
                    <br />
                    para você
                  </span>
                </div>
              )}
            </div>
            <div className="mt-7">
              <BuscaBiblioteca base={base} params={p} />
            </div>
        </PainelVidro>

        {acoes && <div className="flex flex-wrap items-start justify-end gap-2 [&>form]:w-full">{acoes}</div>}

        {total === 0 ? (
          (vazioTotal ?? (
            <div className="liquid relative rounded-2xl p-12 text-center text-sm text-black/55">
              Ainda não há documentos disponíveis para você aqui.
            </div>
          ))
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-3">
                {!tipoFixo && (
                  <FiltroPilulas base={base} params={p} chave="tipo" opcoes={opcoesTipo} aria="Filtrar por tipo de documento" />
                )}
                {opcoesAlerta.length > 0 && (
                  <FiltroPilulas
                    base={base}
                    params={p}
                    chave="alerta"
                    opcoes={opcoesAlerta}
                    rotuloTodos="Qualidade"
                    mostrarTotalTodos={false}
                    aria="Filtrar por alerta de qualidade"
                  />
                )}
                {mostrarEstados && (
                  <FiltroPilulas
                    base={base}
                    params={p}
                    chave="estado"
                    opcoes={opcoesEstado}
                    rotuloTodos="Todos os estados"
                    aria="Filtrar por estado"
                  />
                )}
              </div>
              {setores.length > 1 && <SeletorSetor base={base} params={p} setores={setores} />}
            </div>

            <section className="space-y-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-semibold text-black/70">
                  {!filtrando
                    ? "Mais recentes"
                    : linhas.length === 0
                      ? "Nenhum resultado"
                      : `${linhas.length}${linhas.length === LIMITE ? "+" : ""} ${linhas.length === 1 ? "resultado" : "resultados"}`}
                  {filtrando && p.q && <> para “{p.q}”</>}
                  {areaSelecionada && <> em {areaSelecionada.nome}</>}
                </h2>
                {filtrando && (
                  <Link
                    href={hrefBiblioteca(base, { q: "", tipo: "", areaId: "", estado: "", alerta: "" })}
                    className="text-xs font-semibold text-black underline-offset-2 hover:underline"
                  >
                    Limpar filtros
                  </Link>
                )}
              </div>
              <ListaDocumentos
                itens={linhas}
                vazio={
                  <div className="liquid relative rounded-2xl p-12 text-center">
                    <p className="text-sm font-semibold text-black/70">Não encontrei documento com esses critérios.</p>
                    <p className="mx-auto mt-1.5 max-w-md text-sm text-black/50">
                      Tente outra palavra ou remova um filtro. O documento pode ainda não ter sido publicado ou pode não
                      estar disponível para o seu perfil.
                    </p>
                  </div>
                }
              />
              {linhas.length === LIMITE && (
                <p className="px-1 text-xs text-black/45">Mostrando os {LIMITE} primeiros. Refine a busca para ver outros.</p>
              )}
            </section>
          </>
        )}
      </div>
    </PainelBiblioteca>
  );
}
