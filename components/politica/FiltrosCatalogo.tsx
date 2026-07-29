import Link from "next/link";

type Area = { id: string; nome: string };

export default function FiltrosCatalogo({
  action,
  areas,
  q,
  areaId,
  estado,
}: {
  action: string;
  areas: Area[];
  q: string;
  areaId: string;
  estado: string;
}) {
  const filtroAtivo = Boolean(q || areaId || estado);

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card">
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Buscar</label>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por código ou título…"
          className="h-10 w-full rounded border border-black/15 px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Setor</label>
        <select name="area" defaultValue={areaId} className="h-10 rounded border border-black/15 px-2 text-sm">
          <option value="">Todos</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Status</label>
        <select name="estado" defaultValue={estado} className="h-10 rounded border border-black/15 px-2 text-sm">
          <option value="">Todos</option>
          <option value="rascunho">Rascunho</option>
          <option value="publicada">Publicada</option>
          <option value="revogada">Revogada</option>
        </select>
      </div>
      <button className="h-10 rounded-md bg-marsala px-4 text-sm font-medium text-white hover:bg-marsala-600">Filtrar</button>
      {filtroAtivo && (
        <Link
          href={action}
          title="Limpar filtros"
          className="grid h-10 w-10 place-items-center rounded-md border border-black/15 text-black/50 transition hover:bg-black/5 hover:text-black/70"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Link>
      )}
    </form>
  );
}
