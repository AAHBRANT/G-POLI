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
        marsala: {
          DEFAULT: "#670000",
          50: "#fbf2f2",
          100: "#f6e3e3",
          200: "#e9bcbc",
          600: "#7a0d0d",
          700: "#520000",
          800: "#3f0000",
          900: "#2b0000",
        },
        bege: {
          DEFAULT: "#EBE9AD",
          50: "#fdfdf5",
          100: "#f7f6df",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,16,0.04), 0 4px 16px rgba(103,0,0,0.04)",
        premium: "0 10px 40px -12px rgba(103,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
