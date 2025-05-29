/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'dark-earth': '#342e29',
        'rich-red': '#86312b',
        'forest-green': '#344736',
        'deep-blue': '#002140',
        'dark-brown': '#4b3c35',
        'burnt-red': '#9e3430',
        'olive-green': '#415c43',
        'dark-blue': '#00385e',
        'warm-yellow': '#ffc083',
        'coral-orange': '#ff774a',
        'soft-green': '#b8dc99',
        'light-blue': '#b0ddf1',
        'black': '#000000',
        'charcoal-gray': '#51514d',
        'soft-gray': '#e7e4df',
        'off-white': '#fdfbf7',
      },
      fontFamily: {
        sans: [
          'ABC Arizona Sans',
          'ABC Arizona Flare Regular',
          'ABC Arizona Flare Light',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
