import Brand from "@/components/shell/Brand";

export type SecaoRenderizada = {
  codigo: string;
  titulo: string;
  tipo: string;
  corpo: string;
  colunas: string[] | null;
  linhas: string[][] | null;
};

// Cabeçalho/rodapé institucional (Manual de Padronização Documental, cap.
// 11-12) — mesmo modelo de todo documento oficial da AAHBRANT. Puramente
// apresentacional: nenhuma lógica de ciência, confirmação ou permissão vive
// aqui — reaproveitado por CienciaLeitura (leitura da versão publicada) e
// VerVersaoAntiga (leitura de versão substituída).
export default function DocumentoRenderizado({
  secoes,
  tituloPolitica,
  areaNome,
  codigo,
  publicadaEm,
  revisao,
  onScroll,
  scrollRef,
}: {
  secoes: SecaoRenderizada[];
  tituloPolitica: string;
  areaNome: string;
  codigo: string | null;
  publicadaEm: Date | null;
  revisao: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <table className="w-full table-fixed border-collapse border border-black/40 text-[9px] text-black">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[22%] border border-black/40 px-2 py-1.5 align-middle">
              <Brand somenteLogo />
            </td>
            <td rowSpan={2} className="w-[48%] border border-black/40 px-2 py-1.5 text-center align-middle">
              <span className="font-bold uppercase leading-tight">{tituloPolitica}</span>
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Código:</strong> {codigo ?? "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-black/40 px-2 py-1">
              <strong>Data:</strong> {publicadaEm ? publicadaEm.toLocaleDateString("pt-BR") : "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-black/40 px-2 py-1">
              <strong>Unidade:</strong>
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Área Responsável:</strong> {areaNome}
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Revisão:</strong> {String(revisao).padStart(2, "0")}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-black/80"
      >
        {secoes.length === 0 ? (
          <p className="text-black/50">Documento sem conteúdo estruturado.</p>
        ) : (
          secoes.map((s) => (
            <div key={s.codigo}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-marsala">
                {s.codigo} · {s.titulo}
              </h4>
              {s.tipo === "tabela" ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    {s.colunas && s.colunas.length > 0 && (
                      <thead>
                        <tr>
                          {s.colunas.map((c, i) => (
                            <th key={i} className="border border-black/10 bg-black/5 px-2 py-1 text-left font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {(s.linhas ?? []).map((linha, i) => (
                        <tr key={i}>
                          {linha.map((cel, j) => (
                            <td key={j} className="border border-black/10 px-2 py-1">{cel}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{s.corpo || "—"}</p>
              )}
            </div>
          ))
        )}

        <div className="pt-2 text-center text-[9px] font-bold leading-tight text-black">
          <p>Propriedade da</p>
          <p>AAHBRANT ENGENHARIA E CONSTRUÇÕES</p>
          <p>uso exclusivamente interno</p>
        </div>
      </div>
    </>
  );
}
