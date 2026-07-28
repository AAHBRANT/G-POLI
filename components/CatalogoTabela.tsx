import Link from "next/link";
import { corClassificacao, rotuloClassificacao, ESTADOS_POLITICA } from "@/lib/constants";

// Tabela de listagem compartilhada entre /catalogo (Política) e /tipos/[tipo]
// (os outros 7 tipos de documento) — mesma estrutura de dados, só muda o
// filtro que a página aplica na query.
export type ItemCatalogo = {
  id: string;
  codigo: string | null;
  titulo: string;
  criadaEm: Date;
  classificacao: string;
  estado: string;
  area: { nome: string };
  _count: { versoes: number };
};

export default function CatalogoTabela({ itens }: { itens: ItemCatalogo[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
          <tr>
            <th className="px-4 py-3 font-medium">Código</th>
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Área</th>
            <th className="px-4 py-3 font-medium">Classificação</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Versões</th>
            <th className="px-4 py-3 font-medium">Criada em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {itens.map((p) => {
            const estado = ESTADOS_POLITICA[p.estado] ?? { rotulo: p.estado, cor: "" };
            return (
              <tr key={p.id} className="hover:bg-black/[0.02]">
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded bg-marsala-50 px-2 py-0.5 font-mono text-[11px] font-medium text-marsala">
                    {p.codigo ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/catalogo/${p.id}`} className="text-marsala hover:underline">
                    {p.titulo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-black/70">{p.area.nome}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${corClassificacao(p.classificacao)}`}>
                    {rotuloClassificacao(p.classificacao)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${estado.cor}`}>
                    {estado.rotulo}
                  </span>
                </td>
                <td className="px-4 py-3 text-black/60">{p._count.versoes}</td>
                <td className="px-4 py-3 text-black/50">{p.criadaEm.toLocaleDateString("pt-BR")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
