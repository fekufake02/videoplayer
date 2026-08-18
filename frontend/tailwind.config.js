/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#09090b',
        'surface-hover': '#18181b',
        border: '#27272a',
        accent: {
          DEFAULT: '#facc15', // Luminous Light Yellow
          hover: '#eab308',
          light: '#fef08a',
          pink: '#f472b6',  // Soft Light Pink
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
