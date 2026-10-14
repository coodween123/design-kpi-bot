import mCyr from '../../node_modules/@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?inline';
import mLat from '../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline';
import oCyr from '../../node_modules/@fontsource-variable/oswald/files/oswald-cyrillic-wght-normal.woff2?inline';
import oLat from '../../node_modules/@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2?inline';

export const FONT_FAMILY = "'AP Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
/** Узкий плотный шрифт для заголовков (в макете — Bebas Neue; здесь Oswald, он поддерживает кириллицу). */
export const DISPLAY_FAMILY = "'AP Display', 'Arial Narrow', Impact, sans-serif";

const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const face = (name: string, url: string, range: string) =>
  `@font-face{font-family:'${name}';font-style:normal;font-weight:200 800;font-display:swap;src:url(${url}) format('woff2');unicode-range:${range}}`;

/** Шрифты подключаются в документе (в Shadow DOM @font-face не работает), один раз. Встроены в сборку, внешних запросов нет. */
export function injectFonts(): void {
  if (document.getElementById('ap-fonts')) return;
  const st = document.createElement('style');
  st.id = 'ap-fonts';
  st.textContent =
    face('AP Manrope', mCyr, CYR) + face('AP Manrope', mLat, LAT) + face('AP Display', oCyr, CYR) + face('AP Display', oLat, LAT);
  document.head.append(st);
}
