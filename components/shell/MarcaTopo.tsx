import Link from "next/link";
import type { CSSProperties } from "react";

// Marca do cabeçalho — mesmo padrão do G-SST e do G-QUALI: logo oficial (PNG, sem recolorir),
// divisor vinho inclinado e nome do aplicativo. O brilho ao passar o mouse usa a própria logo como
// máscara (estilos .gs-marca-* em app/globals.css).
const URL_LOGO = "/logo/aahbrant-logo.png";

export default function MarcaTopo() {
  const estilo = { "--gs-logo-url": `url("${URL_LOGO}")`, "--gs-logo-altura": "30px" } as CSSProperties;
  return (
    <Link href="/" className="gs-marca-link" aria-label="AAHBRANT · G-Políticas — ir para o Início">
      <span className="gs-logo" style={estilo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={URL_LOGO} alt="AAHBRANT Engenharia & Construções" draggable={false} style={{ height: 30, width: "auto" }} />
        <span className="gs-logo-brilho" aria-hidden />
      </span>
      <span className="gs-marca-divisor" aria-hidden />
      <span className="gs-marca-texto">
        <span className="gs-marca-nome">G-Políticas</span>
        <span className="gs-marca-subtitulo">AAHBRANT · POLÍTICAS</span>
      </span>
    </Link>
  );
}
