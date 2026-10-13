import cyrillic from '../../node_modules/@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2?inline';
import latin from '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';

export const FONT_FAMILY = "'AP Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Шрифт подключается в документе (в Shadow DOM @font-face не работает), один раз. Встроен в сборку, внешних запросов нет. */
export function injectFonts(): void {
  if (document.getElementById('ap-fonts')) return;
  const st = document.createElement('style');
  st.id = 'ap-fonts';
  st.textContent =
    `@font-face{font-family:'AP Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(${cyrillic}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}` +
    `@font-face{font-family:'AP Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(${latin}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
  document.head.append(st);
}
