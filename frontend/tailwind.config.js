/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: {
          primary: "#0A0A0A",
          secondary: "#111111",
          elevated: "#171717",
          border: "#262626",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#A3A3A3",
          muted: "#737373",
        },
        accent: {
          blue: "#3B82F6",
          green: "#22C55E",
          yellow: "#F59E0B",
          red: "#EF4444",
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      }
    },
  },
  plugins: [],
}
