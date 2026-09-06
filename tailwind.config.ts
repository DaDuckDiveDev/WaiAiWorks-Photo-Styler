import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pacific: "#062647",
        ocean: "#004E8A",
        reef: "#19BFD3",
        skyline: "#3BBFF2",
        glacier: "#DFF8FF",
        seaglass: "#A7EFEA",
        pearl: "#F5FAFB",
        mist: "#EAF5F6",
        graphite: "#263238",
        kelp: "#355F5E",
        coral: "#FF735F",
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0, 78, 138, 0.16)",
        lift: "0 18px 48px rgba(6, 38, 71, 0.14)",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "Avenir Next",
          "Avenir",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
