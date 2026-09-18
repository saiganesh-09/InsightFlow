import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // InsightFlow dark theme palette
        ink: {
          950: "#070b16",
          900: "#0b1020",
          850: "#0f1529",
          800: "#121831",
          700: "#1a2240",
          600: "#232c4d",
          500: "#2e3a66",
          400: "#444e78",
        },
        accent: {
          DEFAULT: "#4f6df5",
          hover: "#5f7bf8",
          soft: "#8fa2ff",
        },
        muted: "#8b93ad",
        subtle: "#5a648a",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "Cascadia Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
