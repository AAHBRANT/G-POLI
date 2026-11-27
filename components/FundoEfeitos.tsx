"use client";

import { useEffect, useRef } from "react";


// Fundo "brasas": faíscas douradas que sobem (padrão visual G-Políticas). Pausa em aba oculta; parado com "reduzir movimento".
export default function FundoEfeitos() {
  const ref = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, t = 0;
    const mouse = { x: -9999, y: -9999 };

    const medir = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Brasas: faíscas douradas que sobem em ziguezague e se apagam no alto.
    type B = { x: number; y: number; v: number; s: number; ph: number; r: number; vida: number };
    let brasasPts: B[] = [];
    const novaBrasa = (inicio: boolean): B => ({
      x: Math.random() * w, y: inicio ? Math.random() * h : h + 10, v: 0.25 + Math.random() * 0.7,
      s: 8 + Math.random() * 22, ph: Math.random() * 6.28, r: 0.6 + Math.random() * 1.8, vida: 0,
    });
    const brasas = () => {
      if (brasasPts.length === 0) brasasPts = Array.from({ length: Math.round(Math.min(160, w / 7)) }, () => novaBrasa(true));
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < brasasPts.length; i++) {
        const b = brasasPts[i];
        if (!parado) { b.y -= b.v; b.vida += 0.004; }
        const x = b.x + Math.sin(t * 1.4 + b.ph) * b.s;
        const alto = Math.max(0, Math.min(1, b.y / h)); // 1 embaixo, 0 em cima
        const a = Math.min(1, alto * 1.6) * (0.55 + 0.45 * Math.sin(t * 6 + b.ph));
        ctx.shadowBlur = 10; ctx.shadowColor = "rgba(255,170,60,0.9)";
        ctx.fillStyle = `rgba(255,${190 + Math.round(alto * 40)},${90 + Math.round(alto * 60)},${Math.max(0, a).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        if (b.y < -10) brasasPts[i] = novaBrasa(false);
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    };

    const quadro = () => {
      ctx.clearRect(0, 0, w, h);
      brasas();
      t += 0.008;
      if (!parado && !document.hidden) raf = requestAnimationFrame(quadro);
    };
    const mover = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const visivel = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(quadro); };

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

  return (
    <>
      <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 size-full" />
    </>
  );
}
