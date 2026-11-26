import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidade visual AAHBRANT — vinho/marsala + bege
        // Identidade AAHBRANT em bege institucional (#EBE9AD). O antigo "marsala"
        // (vinho) foi substituído a pedido do usuário: o nome da classe foi mantido
        // para não reescrever o app inteiro, mas a escala agora é a TINTA oliva
        // escura usada para texto/bordas sobre o bege (contraste AA) e para os
        // tons claros de fundo (50/100/200).
        marsala: {
          DEFAULT: "#2e2d12",
          50: "#f8f7e4",
          100: "#f1efc6",
          200: "#e5e2a0",
          600: "#46451b",
          700: "#2a2910",
          800: "#1c1c0a",
          900: "#121206",
        },
        bege: {
          DEFAULT: "#EBE9AD",
          50: "#fdfdf5",
          100: "#f7f6df",
          200: "#f1efc4",
          300: "#e3e08c",
          400: "#cfcc6a",
          500: "#b4b150",
          600: "#8f8d3a",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,16,0.04), 0 4px 16px rgba(60,58,10,0.06)",
        premium: "0 10px 40px -12px rgba(60,58,10,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
