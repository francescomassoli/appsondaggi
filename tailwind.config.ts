import type { Config } from "tailwindcss";

// Tailwind CSS v3 — configurazione classica
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontSize: {
        // Scala leggermente ingrandita per leggibilità (utenti anziani)
        base: ["1.125rem", { lineHeight: "1.7rem" }],
        lg: ["1.3rem", { lineHeight: "1.9rem" }],
        xl: ["1.6rem", { lineHeight: "2.1rem" }],
        "2xl": ["2rem", { lineHeight: "2.5rem" }],
      },
      colors: {
        brand: {
          DEFAULT: "#1d4ed8",
          dark: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
