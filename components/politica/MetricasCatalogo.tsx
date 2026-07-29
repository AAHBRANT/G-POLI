// Cards de métrica no topo do catálogo (Total/Publicadas/Revogadas) — mesma
// paleta dos cards do painel (/), pra não introduzir uma segunda paleta de
// cor pro mesmo conceito de estado.
export default function MetricasCatalogo({
  total,
  publicadas,
  revogadas,
}: {
  total: number;
  publicadas: number;
  revogadas: number;
}) {
  const cards = [
    { titulo: "Total", valor: total, bg: "bg-marsala/5", cor: "text-marsala" },
    { titulo: "Publicadas", valor: publicadas, bg: "bg-emerald-50", cor: "text-emerald-700" },
    { titulo: "Revogadas", valor: revogadas, bg: "bg-red-50", cor: "text-red-700" },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.titulo} className={`rounded-xl border border-black/10 ${c.bg} p-4`}>
          <div className="text-xs text-black/50">{c.titulo}</div>
          <div className={`mt-1 text-3xl font-semibold ${c.cor}`}>{c.valor}</div>
        </div>
      ))}
    </div>
  );
}
