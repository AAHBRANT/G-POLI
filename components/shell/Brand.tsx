import Image from "next/image";

// Marca G-Políticas / AAHBRANT. Logomarca oficial (identidade-aahbrant) +
// wordmark do produto — reutilizável.
//
// Proporção real dos arquivos (public/logo): positivo 883x190, negativo
// 1118x266 — mantidas aqui para o next/image não distorcer.
const LOGO_POSITIVO = { src: "/logo/aahbrant-logo.png", w: 883, h: 190 };
const LOGO_NEGATIVO = { src: "/logo/aahbrant-logo-negativo.png", w: 1118, h: 266 };

export default function Brand({
  size = "md",
  invertido = false,
  somenteLogo = false,
}: {
  size?: "sm" | "md" | "lg";
  invertido?: boolean; // true = sobre fundo escuro/vinho (sidebar) — usa a versão negativa (bege sobre vinho)
  // true = só a logomarca oficial, sem o wordmark "G-Políticas" — para
  // cabeçalhos institucionais de documento (Manual SGI), onde a marca do
  // aplicativo não deve aparecer junto do timbre oficial.
  somenteLogo?: boolean;
}) {
  const altura = size === "lg" ? 34 : size === "sm" ? 18 : 24;
  const logo = invertido ? LOGO_NEGATIVO : LOGO_POSITIVO;
  const largura = Math.round((altura * logo.w) / logo.h);

  const imagem = (
    <Image
      src={logo.src}
      alt="AAHBRANT Engenharia & Construções"
      width={largura}
      height={altura}
      priority
    />
  );

  if (somenteLogo) return imagem;

  const tituloCls =
    size === "lg" ? "text-lg" : size === "sm" ? "text-sm" : "text-[15px]";
  const corTitulo = invertido ? "text-white" : "text-marsala";
  const corSub = invertido ? "text-white/60" : "text-black/45";

  return (
    <div className="flex items-center gap-2.5">
      {imagem}
      <div className="leading-tight">
        <div className={`font-semibold tracking-tight ${tituloCls} ${corTitulo}`}>G-Políticas</div>
        <div className={`text-[10px] font-medium uppercase tracking-[0.14em] ${corSub}`}>AAHBRANT</div>
      </div>
    </div>
  );
}
