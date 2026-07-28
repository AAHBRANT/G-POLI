// Marca G-Políticas / AAHBRANT — monograma + wordmark. Reutilizável.
export default function Brand({
  size = "md",
  invertido = false,
}: {
  size?: "sm" | "md" | "lg";
  invertido?: boolean; // true = sobre fundo escuro (sidebar/marsala)
}) {
  const dim = size === "lg" ? 44 : size === "sm" ? 30 : 36;
  const tituloCls =
    size === "lg" ? "text-lg" : size === "sm" ? "text-sm" : "text-[15px]";
  const corTitulo = invertido ? "text-white" : "text-marsala";
  const corSub = invertido ? "text-white/60" : "text-black/45";

  return (
    <div className="flex items-center gap-2.5">
      <svg width={dim} height={dim} viewBox="0 0 44 44" fill="none" aria-hidden>
        <rect width="44" height="44" rx="11" fill="#670000" />
        <rect x="0.5" y="0.5" width="43" height="43" rx="10.5" stroke="#EBE9AD" strokeOpacity="0.35" />
        {/* G estilizado */}
        <path
          d="M28.5 16.2c-1.5-1.6-3.7-2.6-6.2-2.6-4.7 0-8.3 3.6-8.3 8.4s3.6 8.4 8.3 8.4c4 0 7-2.4 7.7-6.1h-8.2v-3.3H33v2.1c0 6.2-4.4 10.9-10.7 10.9-6.6 0-11.7-5.1-11.7-11.9S15.7 10 22.3 10c3.6 0 6.7 1.5 8.8 3.9l-2.6 2.3z"
          fill="#EBE9AD"
        />
      </svg>
      <div className="leading-tight">
        <div className={`font-semibold tracking-tight ${tituloCls} ${corTitulo}`}>G-Políticas</div>
        <div className={`text-[10px] font-medium uppercase tracking-[0.14em] ${corSub}`}>AAHBRANT</div>
      </div>
    </div>
  );
}
