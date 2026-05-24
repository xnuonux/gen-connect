import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // lunari base
        "lunari-black": "var(--lunari-black)",
        "lunari-surface": "var(--lunari-surface)",
        "lunari-surface-elevated": "var(--lunari-surface-elevated)",
        "lunari-cream": "var(--lunari-cream)",
        "lunari-gold": "var(--lunari-gold)",
        "lunari-crimson": "var(--lunari-crimson)",
        "lunari-neutral-400": "var(--lunari-neutral-400)",
        "lunari-neutral-500": "var(--lunari-neutral-500)",

        // gen-specific
        "gen-accent": "var(--gen-accent)",
        "gen-accent-soft": "var(--gen-accent-soft)",

        // shadcn-compatible
        background: "var(--lunari-black)",
        foreground: "var(--lunari-cream)",
        primary: {
          DEFAULT: "var(--gen-accent)",
          foreground: "var(--lunari-cream)",
        },
        secondary: {
          DEFAULT: "var(--lunari-surface-elevated)",
          foreground: "var(--lunari-cream)",
        },
        muted: {
          DEFAULT: "var(--lunari-surface)",
          foreground: "var(--lunari-neutral-400)",
        },
        accent: {
          DEFAULT: "var(--lunari-gold)",
          foreground: "var(--lunari-black)",
        },
        destructive: {
          DEFAULT: "var(--lunari-crimson)",
          foreground: "var(--lunari-cream)",
        },
        border: "var(--lunari-surface-elevated)",
        input: "var(--lunari-surface-elevated)",
        ring: "var(--gen-accent)",
        card: {
          DEFAULT: "var(--lunari-surface)",
          foreground: "var(--lunari-cream)",
        },
        popover: {
          DEFAULT: "var(--lunari-surface-elevated)",
          foreground: "var(--lunari-cream)",
        },
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        serif: ["var(--font-cinzel)", "Georgia", "serif"],
      },
      transitionTimingFunction: {
        planetarium: "cubic-bezier(0.22, 0.68, 0.12, 1)",
      },
      transitionDuration: {
        "300": "300ms",
      },
    },
  },
  plugins: [animate],
};

export default config;
