import type { Config } from "tailwindcss";

const v = (n: string) => `var(--${n})`;
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), line: v("line"),
        fg: v("fg"), soft: v("fg-soft"),
        accent: v("accent"), "accent-ink": v("accent-ink"), "accent-soft": v("accent-soft"),
        good: v("good"), "good-soft": v("good-soft"),
        warn: v("warn"), "warn-soft": v("warn-soft"),
        bad: v("bad"), "bad-soft": v("bad-soft"),
        info: v("info"), "info-soft": v("info-soft")
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Segoe UI"', "system-ui", "sans-serif"],
        body: ['"IBM Plex Sans"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;
