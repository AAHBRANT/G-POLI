import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NovaVersaoForm from "@/components/politica/NovaVersaoForm";
import AcoesEstado from "@/components/politica/AcoesEstado";
import CienciaLeitura from "@/components/politica/CienciaLeitura";
import AudienciaSelector from "@/components/politica/AudienciaSelector";
import { corClassificacao, rotuloClassificacao, ESTADOS_POLITICA, tipoDocumento, type TipoDocumentoValor } from "@/lib/constants";
import {
  getUsuarioAtual,
  podeEditarConteudo,
  podePublicar,
  podeEnviarParaAprovacao,
  podeAprovarGestor,
  podeRetirarDaAprovacao,
  filtroVisibilidade,
  podeGerirVinculos,
} from "@/lib/auth/usuario";
import { BUTTON_CLASSES } from "@/components/ui/Button";
import VisualizadorPdf from "@/components/politica/VisualizadorPdf";
import VerVersaoAntiga from "@/components/politica/VerVersaoAntiga";
import type { SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";
import { acaoVersao } from "@/lib/politica/dominio";
import PainelVinculos, { type DocumentoRelacionado } from "@/components/politica/PainelVinculos";
import { SUPERIORES_PERMITIDOS, aceitaSuperior, exigeSuperior } from "@/lib/politica/hierarquia";
import { situacaoRevisao, textoRevisao } from "@/lib/politica/revisao";

export const dynamic = "force-dynamic";

function formatoTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function PoliticaDetalhe(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const params = await props.params;
  // ?ver=1 (vindo da lista): abre direto o PDF oficial vigente, sem passar pela tela de gestão.
  const abrirPdf = (await props.searchParams).ver === "1";
  const usuario = await getUsuarioAtual();
  // findFirst (não findUnique) para poder combinar o id com o filtro de
  // visibilidade — sem isso, colaborador abria qualquer política direto pela
  // URL, ignorando estado/área/público-alvo. Sem permissão = "não encontrada",
  // igual a não existir (não revela que a política existe e está restrita).
  const politica = await prisma.politica.findFirst({
    where: { id: params.id, AND: [filtroVisibilidade(usuario)] },
    include: {
      area: true,
      consorcio: true,
      versoes: { include: { documento: true }, orderBy: { numero: "desc" } },
      secoes: { orderBy: { ordem: "asc" } },
      ciencias: { orderBy: { criadoEm: "desc" } },
      audienciaSetores: true,
      audienciaUsuarios: true,
      notificacoes: { orderBy: { criadoEm: "desc" } },
    },
  });

  if (!politica) notFound();
  const podeEditar = podeEditarConteudo(usuario, politica);
  const podePub = podePublicar(usuario);
  // Sprint 4/5/6: alçadas do fluxo de aprovação — cada uma calculada aqui
  // (server) e só repassada como prop pro AcoesEstado decidir QUAL botão
  // mostrar; a permissão de verdade nunca é decidida no client.
  const podeEnviarAprovacao = podeEnviarParaAprovacao(usuario, politica);
  const podeGestorAprovar = podeAprovarGestor(usuario, politica);
  const podeRetirarAprovacao = podeRetirarDaAprovacao(usuario, politica);
  const mostrarAcoesEstado = podePub || podeEnviarAprovacao || podeGestorAprovar || podeRetirarAprovacao;
  const minhaCiencia = usuario
    ? politica.ciencias.find(
        (c) => c.usuarioOid === usuario.oid && c.politicaPublicadaEm?.getTime() === politica.publicadaEm?.getTime(),
      )
    : undefined;
  // Mesma alçada para o relatório de ciência e o de notificação (ambos falam da
  // audiência da política, não do conteúdo).
  const verRelatorioCiencia = !!usuario && ["sgi", "admin", "diretoria"].includes(usuario.perfil);

  const [todosSetores, todosUsuarios] = podeEditar
    ? await Promise.all([
        prisma.area.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
        prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
      ])
    : [[], []];

  const estado = ESTADOS_POLITICA[politica.estado] ?? { rotulo: politica.estado, cor: "" };
  const infoTipo = tipoDocumento(politica.tipo);
  // Esta página é compartilhada por todos os 8 tipos (v3) — "voltar" precisa ir
  // à seção certa, não sempre a /catalogo.
  const hrefSecao = politica.tipo === "politica" ? "/catalogo" : `/tipos/${politica.tipo}`;

  // Etapa 2: hierarquia documental e prazo de revisão. Os dois lados do vínculo
  // só listam o que o usuário pode VER (filtroVisibilidade).
  const agora = new Date();
  const tipoDoc = politica.tipo as TipoDocumentoValor;
  const podeGerir = podeGerirVinculos(usuario, politica);
  const camposRel = { id: true, codigo: true, titulo: true, tipo: true, estado: true } as const;
  const paraRelacionado = (d: { id: string; codigo: string | null; titulo: string; tipo: string; estado: string }): DocumentoRelacionado => ({
    id: d.id,
    codigo: d.codigo,
    titulo: d.titulo,
    tipoRotulo: tipoDocumento(d.tipo).rotulo,
    estado: d.estado,
    estadoRotulo: (ESTADOS_POLITICA[d.estado] ?? { rotulo: d.estado }).rotulo,
  });
  const [paiVisivel, filhosVisiveis, candidatosSuperior] = await Promise.all([
    politica.paiId
      ? prisma.politica.findFirst({ where: { id: politica.paiId, AND: [filtroVisibilidade(usuario)] }, select: camposRel })
      : null,
    prisma.politica.findMany({
      where: { paiId: politica.id, AND: [filtroVisibilidade(usuario)] },
      select: camposRel,
      orderBy: [{ tipo: "asc" }, { codigo: "asc" }],
    }),
    podeGerir && aceitaSuperior(tipoDoc)
      ? prisma.politica.findMany({
          where: {
            tipo: { in: SUPERIORES_PERMITIDOS[tipoDoc] },
            id: { not: politica.id },
            estado: { not: "revogada" },
            AND: [filtroVisibilidade(usuario)],
          },
          select: camposRel,
          orderBy: [{ tipo: "asc" }, { codigo: "asc" }],
        })
      : [],
  ]);
  const revisaoVale = politica.estado === "publicada";

  return (
    <div className="space-y-6">
      <div>
        <Link href={hrefSecao} className="text-xs text-marsala hover:underline">
          ← Voltar {politica.tipo === "politica" ? "ao catálogo" : `a ${infoTipo.rotuloPlural.toLowerCase()}`}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {politica.codigo && (
            <span className="rounded bg-marsala-50 px-2 py-1 font-mono text-xs font-medium text-marsala">
              {politica.codigo}
            </span>
          )}
          <h2 className="text-lg font-semibold text-marsala">{politica.titulo}</h2>
          <span className="rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-medium text-black/70">
            {infoTipo.rotulo}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${corClassificacao(politica.classificacao)}`}>
            {rotuloClassificacao(politica.classificacao)}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${estado.cor}`}>
            {estado.rotulo}
          </span>
          {mostrarAcoesEstado && (
            <div className="ml-auto">
              <AcoesEstado
                id={politica.id}
                estado={politica.estado}
                podeEnviar={podeEnviarAprovacao}
                podeGestor={podeGestorAprovar}
                podeDiretoria={podePub}
                podeRetirar={podeRetirarAprovacao}
              />
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-black/50">Área: {politica.area.nome}</p>
        <p className="mt-1 text-sm text-black/50">
          Destino: {politica.consorcio ? politica.consorcio.nome : "AAHBRANT (todos)"}
        </p>
        {politica.estado !== "rascunho" && politica.publicadaEm && (
          <p className="mt-1 text-xs text-black/45">
            Publicada em {politica.publicadaEm.toLocaleDateString("pt-BR")}
            {politica.publicadaPorNome ? ` por ${politica.publicadaPorNome}` : ""}
            {politica.estado === "revogada" && politica.revogadaEm
              ? ` · revogada em ${politica.revogadaEm.toLocaleDateString("pt-BR")}`
              : ""}
          </p>
        )}
        {/* Sprint 4/5/6: em andamento na aprovação — quem enviou e quando. */}
        {(politica.estado === "em_aprovacao_gestor" || politica.estado === "em_aprovacao_diretoria") && (
          <p className="mt-1 text-xs text-black/45">
            Enviada para aprovação
            {politica.enviadaAprovacaoPorNome ? ` por ${politica.enviadaAprovacaoPorNome}` : ""}
            {politica.enviadaAprovacaoEm ? ` em ${politica.enviadaAprovacaoEm.toLocaleDateString("pt-BR")}` : ""}
            {politica.estado === "em_aprovacao_diretoria" && politica.aprovadaGestorPorNome
              ? ` · aprovada pelo Gestor (${politica.aprovadaGestorPorNome})`
              : ""}
          </p>
        )}
        {/* Voltou pra rascunho por rejeição — motivo sempre visível pra quem vai corrigir. */}
        {politica.estado === "rascunho" && politica.rejeitadaEm && politica.motivoRejeicao && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Rejeitada {politica.rejeitadaNaEtapa === "diretoria" ? "pela Diretoria" : "pelo Gestor"}
            {politica.rejeitadaPorNome ? ` (${politica.rejeitadaPorNome})` : ""}
            {politica.rejeitadaEm ? ` em ${politica.rejeitadaEm.toLocaleDateString("pt-BR")}` : ""}: {politica.motivoRejeicao}
          </p>
        )}
      </div>

      {politica.estado === "publicada" && (
        <section className="rounded-2xl liquid relative p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-black/80">Ciência de leitura</h3>
              <p className="text-xs text-black/45">
                {minhaCiencia
                  ? `Você deu ciência em ${minhaCiencia.criadoEm.toLocaleDateString("pt-BR")}.`
                  : "Confirme que leu e está ciente desta norma."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {minhaCiencia && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                  ✓ Ciente
                </span>
              )}
              <CienciaLeitura
                politicaId={politica.id}
                secoes={(politica.conteudoPublicado as SecaoRenderizada[] | null) ?? []}
                jaCiente={!!minhaCiencia}
                codigo={politica.codigo}
                tituloPolitica={politica.titulo}
                areaNome={politica.area.nome}
                publicadaEm={politica.publicadaEm}
                revisao={politica.revisao}
              />
            </div>
          </div>

          {verRelatorioCiencia && (
            <div className="mt-3 border-t border-black/5 pt-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-black/40">
                Quem deu ciência ({politica.ciencias.length})
              </p>
              {politica.ciencias.length === 0 ? (
                <p className="text-xs text-black/40">Ninguém ainda.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {politica.ciencias.map((c) => {
                    // Mesma regra conservadora do gate acima (linha ~54): ciência sem
                    // versão registrada (dado legado, pré-migration) conta como
                    // desatualizada, não como "em dia".
                    const desatualizada =
                      c.politicaPublicadaEm?.getTime() !== politica.publicadaEm?.getTime();
                    return (
                      <li
                        key={c.id}
                        title={`IP: ${c.ip || "desconhecido"}${desatualizada ? " · ciência de uma publicação anterior" : ""}`}
                        className={`rounded px-2 py-1 text-[11px] ${
                          desatualizada ? "bg-amber-50 text-amber-800" : "bg-black/5 text-black/60"
                        }`}
                      >
                        {c.usuarioNome || c.usuarioEmail} · {c.criadoEm.toLocaleString("pt-BR")}
                        {desatualizada && " ⚠"}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {verRelatorioCiencia && (
            <div className="mt-3 border-t border-black/5 pt-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-black/40">
                Notificação de publicação ({politica.notificacoes.filter((n) => n.enviada).length}/
                {politica.notificacoes.length} entregues)
              </p>
              {politica.notificacoes.length === 0 ? (
                <p className="text-xs text-black/40">Nenhuma notificação registrada.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {politica.notificacoes.map((n) => (
                    <li
                      key={n.id}
                      title={n.motivo || undefined}
                      className={`rounded px-2 py-1 text-[11px] ${
                        n.enviada ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {n.enviada ? "✓" : "⚠"} {n.usuarioNome || n.usuarioEmail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <PainelVinculos
        politicaId={politica.id}
        aceitaSuperior={aceitaSuperior(tipoDoc)}
        exigeSuperior={exigeSuperior(tipoDoc)}
        superior={paiVisivel ? paraRelacionado(paiVisivel) : null}
        superiorOculto={!!politica.paiId && !paiVisivel}
        superiorId={politica.paiId}
        vinculados={filhosVisiveis.map(paraRelacionado)}
        textoRevisao={revisaoVale ? textoRevisao(politica.proximaRevisaoEm, agora) : null}
        situacaoRevisao={revisaoVale ? situacaoRevisao(politica.proximaRevisaoEm, agora) : null}
        proximaFormatada={revisaoVale && politica.proximaRevisaoEm ? politica.proximaRevisaoEm.toLocaleDateString("pt-BR") : null}
        periodicidade={politica.periodicidadeRevisaoMeses}
        podeGerir={podeGerir}
        opcoesSuperior={candidatosSuperior.map((c) => ({
          id: c.id,
          rotulo: `${c.codigo ?? "sem código"} · ${c.titulo} (${tipoDocumento(c.tipo).rotulo})`,
        }))}
        tiposAceitos={SUPERIORES_PERMITIDOS[tipoDoc].map((t) => tipoDocumento(t).rotulo)}
      />

      {podeEditar && politica.estado === "rascunho" && !politica.consorcioId && (
        <section className="rounded-2xl liquid relative p-4">
          <h3 className="mb-3 text-sm font-semibold text-black/80">Público-alvo da publicação</h3>
          <AudienciaSelector
            politicaId={politica.id}
            setores={todosSetores.map((a) => ({ id: a.id, rotulo: a.nome }))}
            usuarios={todosUsuarios.map((u) => ({ id: u.id, rotulo: u.nome || u.email }))}
            setoresSelecionados={politica.audienciaSetores.map((a) => a.id)}
            usuariosSelecionados={politica.audienciaUsuarios.map((u) => u.id)}
            classificacao={politica.classificacao}
          />
        </section>
      )}

      <section className="overflow-hidden rounded-2xl liquid relative">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-black/80">
            Conteúdo estruturado {politica.secoes.length > 0 && `(${politica.secoes.length} seções)`}
          </h3>
          {podeEditar && (
            <Link href={`/catalogo/${politica.id}/editar`} className={BUTTON_CLASSES}>
              Editar conteúdo
            </Link>
          )}
        </div>
        {politica.secoes.length === 0 ? (
          <p className="p-6 text-center text-sm text-black/50">
            Sem conteúdo estruturado. Clique em “Editar conteúdo” para gerar o esqueleto padrão.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {politica.secoes.map((s) => {
              const linhas = (s.linhas as string[][] | null) ?? [];
              const preenchida =
                s.tipo === "tabela" ? linhas.length > 0 : s.corpo.trim().length > 0;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-black/5 text-xs font-semibold text-black/60">
                    {s.codigo}
                  </span>
                  <span className="text-black/80">{s.titulo}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      preenchida ? "bg-emerald-100 text-emerald-800" : "bg-black/10 text-black/50"
                    }`}
                  >
                    {preenchida ? "preenchida" : "vazia"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {podeEditar && <NovaVersaoForm politicaId={politica.id} />}

      <div className="overflow-hidden rounded-2xl liquid relative">
        <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold text-black/80">
          Versões ({politica.versoes.length})
        </div>
        {politica.versoes.length === 0 ? (
          <p className="p-6 text-center text-sm text-black/50">
            Nenhum documento enviado. Use “Nova versão” acima.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-2 font-medium">Versão</th>
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Tamanho</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Enviado</th>
                <th className="px-4 py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {politica.versoes.map((v) => (
                <tr key={v.id} className="hover:bg-black/[0.02]">
                  <td className="px-4 py-2 font-medium">
                    v{v.numero}
                    {v.estado === "ativa" && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                        ativa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-black/70">
                    {v.documento?.nome ?? "—"}
                    {v.documento && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          v.documento.oficial
                            ? "bg-bege/70 text-marsala"
                            : "bg-black/5 text-black/60"
                        }`}
                      >
                        {v.documento.oficial ? "Documento oficial" : "Anexo"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-black/60">
                    {v.documento ? formatoTamanho(v.documento.tamanho) : "—"}
                  </td>
                  <td className="px-4 py-2 text-black/60">{v.documento?.estado ?? "—"}</td>
                  <td className="px-4 py-2 text-black/50">
                    {v.criadaEm.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    {(() => {
                      const acao = acaoVersao({
                        temDocumento: !!v.documento,
                        oficial: !!v.documento?.oficial,
                        estado: v.estado,
                        temSnapshot: !!v.conteudoSnapshot,
                      });
                      if (acao === "ver") {
                        return (
                          <VerVersaoAntiga
                            secoes={v.conteudoSnapshot as unknown as SecaoRenderizada[]}
                            tituloPolitica={politica.titulo}
                            areaNome={politica.area.nome}
                            codigo={politica.codigo}
                            publicadaEm={v.criadaEm}
                            revisao={v.revisaoNaEpoca ?? 0}
                          />
                        );
                      }
                      if (acao === "baixar") {
                        return (
                          <span className="flex flex-wrap gap-2">
                            {/\.pdf$/i.test(v.documento!.nome) && (
                              <VisualizadorPdf
                                documentoId={v.documento!.id}
                                titulo={politica.titulo}
                                nomeArquivo={v.documento!.nome}
                                className={BUTTON_CLASSES}
                                abrirAoCarregar={abrirPdf && !!v.documento!.oficial && v.estado === "ativa"}
                                ciencia={
                                  politica.estado === "publicada" && v.documento!.oficial && v.estado === "ativa"
                                    ? { politicaId: politica.id, jaCiente: !!minhaCiencia }
                                    : undefined
                                }
                              />
                            )}
                            <a href={`/api/documentos/${v.documento!.id}`} className={BUTTON_CLASSES}>
                              Baixar
                            </a>
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
