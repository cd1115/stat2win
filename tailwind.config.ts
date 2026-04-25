import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#2563EB", // Royal Blue
          soft: "rgba(37, 99, 235, 0.15)",
          border: "rgba(37, 99, 235, 0.30)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
