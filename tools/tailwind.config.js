// Configuración para compilar public/css/tailwind.css (npm run build:css).
// Así el panel no depende del CDN de Tailwind y funciona sin internet.
//
// Paleta "feria": se redefinen las escalas que usa todo el panel para que, sin tocar cada
// archivo, el modo avanzado también adopte la identidad de color.
//   indigo  -> rosa mexicano (color principal: botones, enlaces, selección)
//   slate   -> tinta índigo (neutros con un toque violeta en lugar de gris frío)

const rosaMexicano = {
  50: '#FFF0F7',
  100: '#FFE0EF',
  200: '#FFC2E0',
  300: '#FF94C8',
  400: '#FB59A6',
  500: '#F02C88',
  600: '#D80F72',
  700: '#B30C5E',
  800: '#930F50',
  900: '#7A1145',
  950: '#4A0326'
};

const tinta = {
  50: '#F8F6FD',
  100: '#F0ECF9',
  200: '#E2DCF1',
  300: '#CAC2E0',
  400: '#9E96BB',
  500: '#746C93',
  600: '#585175',
  700: '#443E60',
  800: '#2E2949',
  900: '#1D1A39',
  950: '#110E26'
};

module.exports = {
  content: ['./public/index.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        indigo: rosaMexicano,
        slate: tinta,
        lila: '#F3EFFC',
        cobalto: '#2F4BEB',
        cempasuchil: '#FFB31F',
        jade: '#00A383'
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
