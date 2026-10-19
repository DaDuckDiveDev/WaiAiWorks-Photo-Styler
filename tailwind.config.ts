import type { Config } from "tailwindcss";

/**
 * Kaiel Abyss tokens. The studio is the darkroom: a deep-water void where the
 * photos are the brightest thing on screen and the ocean blues only mark what
 * is selected, running, or ready.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#050B16",
        abyss: "#08121F",
        trench: "#0D1B2C",
        shelf: "#13253A",
        pearl: "#F5FAFB",
        haze: "#9DB0BF",
        dim: "#6F8496",
        ocean: "#004E8A",
        reef: "#19BFD3",
        skyline: "#3BBFF2",
        seaglass: "#A7EFEA",
        coral: "#FF735F",
        rim: "rgba(167, 239, 234, 0.10)",
        "rim-strong": "rgba(167, 239, 234, 0.20)",
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "Archivo", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(25, 191, 211, 0.55), 0 0 24px rgba(25, 191, 211, 0.22)",
        lift: "0 24px 60px rgba(0, 0, 0, 0.45)",
      },
      transitionTimingFunction: {
        tide: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
