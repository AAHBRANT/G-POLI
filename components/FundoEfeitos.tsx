"use client";

import { useEffect, useRef } from "react";

// Fundo "fios de luz": curvas finas e douradas que ondulam, com pulsos de brilho que correm por elas.
// Canvas fixo atrás do app. Pausa em aba oculta; parado com "reduzir movimento".
export default function FundoEfeitos() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, t = 0;
    const mouse = { x: 0.5, y: 0.5 }; // 0..1, suavizado
    const alvo = { x: 0.5, y: 0.5 };

    const medir = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const fios = () => {
      ctx.globalCompositeOperation = "lighter";
      const N = 9;
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        const yb = h * (0.12 + f * 0.8);
        const amp = 40 + f * 70;
        const pts: [number, number][] = [];
        for (let x = -20; x <= w + 20; x += 24) {
          const y =
            yb +
            Math.sin(x * 0.0035 + t * 0.5 + i * 0.9) * amp +
            Math.sin(x * 0.009 - t * 0.35 + i) * amp * 0.3 +
            (mouse.y - 0.5) * 30 * (f - 0.5);
          pts.push([x, y]);
        }
        const desenha = () => {
          ctx.beginPath();
          pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        };
        // fio-base
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,214,140,${(0.24 + (1 - f) * 0.1).toFixed(3)})`;
        desenha();
        ctx.stroke();
        // pulso de luz que corre pelo fio
        ctx.setLineDash([90 + i * 10, 900]);
        ctx.lineDashOffset = -(t * (140 + i * 22)) % 1000;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = "rgba(255,235,170,1)";
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(255,170,60,0.9)";
        desenha();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "source-over";
    };

    const quadro = () => {
      mouse.x += (alvo.x - mouse.x) * 0.05;
      mouse.y += (alvo.y - mouse.y) * 0.05;
      ctx.clearRect(0, 0, w, h);
      fios();
      t += 0.004;
      if (!parado && !document.hidden) raf = requestAnimationFrame(quadro);
    };
    const mover = (e: PointerEvent) => { alvo.x = e.clientX / w; alvo.y = e.clientY / h; };
    const visivel = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(quadro);
    };

    medir();
    raf = requestAnimationFrame(quadro);
    window.addEventListener("resize", medir);
    window.addEventListener("pointermove", mover);
    document.addEventListener("visibilitychange", visivel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", medir);
      window.removeEventListener("pointermove", mover);
      document.removeEventListener("visibilitychange", visivel);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 size-full" />;
}
