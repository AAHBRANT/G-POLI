import Link from "next/link";
import ControlesVinculos from "./ControlesVinculos";
import type { SituacaoRevisao } from "@/lib/politica/revisao";

export type DocumentoRelacionado = {
  id: string;
  codigo: string | null;
  titulo: string;
  tipoRotulo: string;
  estado: string;
  estadoRotulo: string;
};

const COR_SITUACAO: Record<SituacaoRevisao, string> = {
  em_dia: "bg-emerald-100 text-emerald-800",
  vence_em_breve: "bg-amber-100 text-amber-900",
  vencida: "bg-red-100 text-red-800",
};

function Relacionado({ d }: { d: DocumentoRelacionado }) {
  return (
    <Link
      href={`/catalogo/${d.id}`}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/60"
    >
      <span className="rounded bg-bege/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-black/80">
        {d.codigo ?? "sem código"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-black/80">{d.titulo}</span>
      <span className="shrink-0 text-[11px] text-black/45">{d.tipoRotulo}</span>
      {d.estado !== "publicada" && (
        <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-black/60">{d.estadoRotulo}</span>
      )}
    </Link>
  );
}

// Cartão "Hierarquia e revisão" da página do documento: de qual documento este
// depende, quais dependem dele e quando precisa ser revisado. Os dois lados da
// hierarquia só listam o que o usuário pode VER (a restrição por classificação
// vale aqui também).
export default function PainelVinculos({
  politicaId,
  aceitaSuperior,
  exigeSuperior,
  superior,
  superiorOculto,
  superiorId,
  vinculados,
  textoRevisao,
  situacaoRevisao,
  proximaFormatada,
  periodicidade,
  podeGerir,
  opcoesSuperior,
  tiposAceitos,
}: {
  politicaId: string;
  aceitaSuperior: boolean;
  exigeSuperior: boolean;
  superior: DocumentoRelacionado | null;
  superiorOculto: boolean;
  superiorId: string | null;
  vinculados: DocumentoRelacionado[];
  textoRevisao: string | null;
  situacaoRevisao: SituacaoRevisao | null;
  proximaFormatada: string | null;
  periodicidade: number;
  podeGerir: boolean;
  opcoesSuperior: { id: string; rotulo: string }[];
  tiposAceitos: string[];
}) {
  const superiorNaoVigente = superior && superior.estado !== "publicada";
  return (
    <section className="liquid relative space-y-4 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-black/80">Hierarquia e revisão</h3>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Documento superior</p>
          {!aceitaSuperior ? (
            <p className="text-sm text-black/55">Este tipo de documento é de topo: não tem superior.</p>
          ) : superior ? (
            <>
              <Relacionado d={superior} />
              {superiorNaoVigente && (
                <p className="px-2 text-xs font-medium text-amber-800">O documento superior não está vigente ({superior.estadoRotulo}).</p>
              )}
            </>
          ) : superiorOculto ? (
            <p className="text-sm text-black/55">Vinculado a um documento superior que você não tem acesso para ver.</p>
          ) : (
            <p className={`text-sm ${exigeSuperior ? "font-medium text-amber-800" : "text-black/55"}`}>
              {exigeSuperior
                ? `Sem documento superior. Vincule a um(a) ${tiposAceitos.join(" ou ").toLowerCase()}.`
                : "Sem documento superior (opcional)."}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Próxima revisão</p>
          {textoRevisao ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-black/80">{proximaFormatada}</span>
              {situacaoRevisao && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${COR_SITUACAO[situacaoRevisao]}`}>
                  {textoRevisao}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-black/55">Definida na publicação (a cada {periodicidade} meses).</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
          Documentos vinculados a este ({vinculados.length})
        </p>
        {vinculados.length === 0 ? (
          <p className="text-sm text-black/55">Nenhum documento depende deste.</p>
        ) : (
          <div className="-mx-2">
            {vinculados.map((d) => (
              <Relacionado key={d.id} d={d} />
            ))}
          </div>
        )}
      </div>

      {podeGerir && (
        <div className="border-t border-black/10 pt-4">
          <ControlesVinculos
            politicaId={politicaId}
            aceitaSuperior={aceitaSuperior}
            superiorId={superiorId}
            opcoesSuperior={opcoesSuperior}
            periodicidade={periodicidade}
          />
        </div>
      )}
    </section>
  );
}
