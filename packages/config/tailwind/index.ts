import type { Config } from "tailwindcss";

/**
 * Shared Tailwind preset. Defines the design tokens (colors, radii, fonts,
 * animations) as HSL CSS variables so light/dark themes are swappable at
 * runtime. Apps extend this via `presets: [preset]` and supply their own
 * `content` globs.
 */
const preset = {
  darkMode: "class",
  content: [],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        // Serif accent — italic display face for a single accent word in a headline.
        "serif-accent": ["var(--font-serif-accent)", "Georgia", "serif"],
      },
      keyframes: {
        // Pronounced rise: bigger travel + slight scale, lands with an expo-out
        // ease so it decelerates hard into place (reads as confident, not floaty).
        "fade-up": {
          from: { opacity: "0", transform: "translateY(34px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Pop: scales up from small with a back-ease overshoot for a springy entrance.
        pop: {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.8)" },
          "60%": { opacity: "1", transform: "translateY(0) scale(1.04)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Horizontal reveals for alternating / side-entering content.
        "fade-right": {
          from: { opacity: "0", transform: "translateX(-40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "fade-left": {
          from: { opacity: "0", transform: "translateX(40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // Slow ambient loop for background glows/emblems (decorative, low amplitude).
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(0, -12px, 0) scale(1.04)" },
        },
        // Sweeping highlight for placeholder / loading surfaces.
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Pulsing accent glow — for CTAs / focal elements that should breathe.
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.35)" },
          "50%": { boxShadow: "0 0 28px 4px hsl(var(--primary) / 0.30)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        pop: "pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-right": "fade-right 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-left": "fade-left 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        drift: "drift 9s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default preset;
