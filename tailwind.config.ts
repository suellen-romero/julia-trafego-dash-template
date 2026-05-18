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
        bg:      "#FAFAF7",
        ink:     "#1A1A1A",
        muted:   "#7A7A7A",
        accent:  "#2A4D3F",   // verde executivo
        warning: "#C89A3A",   // âmbar
        danger:  "#B23A48",   // vermelho contido
        line:    "#E8E5DD",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
      },
    },
  },
  plugins: [],
};
export default config;
