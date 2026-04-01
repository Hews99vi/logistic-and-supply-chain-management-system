import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem"
    },
    extend: {
      colors: {
        border: "hsl(214 32% 90%)",
        input: "hsl(214 32% 90%)",
        ring: "hsl(221 83% 53%)",
        background: "hsl(210 40% 98%)",
        foreground: "hsl(222 47% 11%)",
        primary: {
          DEFAULT: "hsl(221 83% 53%)",
          foreground: "hsl(210 40% 98%)"
        },
        secondary: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)"
        },
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16% 47%)"
        },
        accent: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)"
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(222 47% 11%)"
        },
        success: "hsl(148 66% 43%)",
        warning: "hsl(38 92% 50%)",
        danger: "hsl(0 84% 60%)"
      },
      borderRadius: {
        lg: "0.9rem",
        md: "0.7rem",
        sm: "0.5rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
