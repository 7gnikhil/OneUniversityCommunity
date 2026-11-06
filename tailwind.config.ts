import type { Config } from "tailwindcss";

// OneUco default theme: black and minimal. Accent colour is user-customisable
// at runtime (Settings -> App colour) via the --accent CSS variable, so keep
// the palette here neutral and drive accents from the variable.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent, #111111)",
      },
    },
  },
  plugins: [],
};

export default config;
