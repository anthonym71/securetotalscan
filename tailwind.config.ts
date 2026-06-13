import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Secure Total Scan palette
        ink: "#030115", // page background (rgb(3,1,21))
        brand: {
          DEFAULT: "#7c3aed", // violet-600
          light: "#a855f7", // purple-500
        },
        grade: {
          a: "#22c55e",
          b: "#84cc16",
          c: "#eab308",
          d: "#f97316",
          f: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["Poppins", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7c3aed, #a855f7)",
        "card-gradient":
          "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02), rgba(255,255,255,0.04))",
      },
      boxShadow: {
        glow: "0 0 60px -15px rgba(124, 58, 237, 0.5)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
