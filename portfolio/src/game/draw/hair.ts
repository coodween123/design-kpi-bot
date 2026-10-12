import { shade } from './iso2d';

// Причёски: авторские векторные SVG-ресурсы в системе координат персонажа (72 x 108, голова с центром 36,26).
// У каждой причёски три части: «за головой» (вид спереди), «поверх» (вид спереди) и «сзади» (вид сзади).
// Цвет подставляется в градиенты, поэтому один ресурс работает для любого цвета волос.
export type HairPart = 'behind' | 'over' | 'back';
export const HAIR_STYLES = ['short', 'bob', 'long', 'spiky', 'bun', 'ponytail', 'curly'] as const;

interface Pal { c0: string; c1: string; c2: string; c3: string; ink: string }
const palette = (color: string): Pal => ({
  c0: shade(color, 0.55), c1: shade(color, 0.2), c2: color, c3: shade(color, -0.28), ink: shade(color, -0.68),
});

const wrap = (p: Pal, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 72 116" width="432" height="696">` +
  `<defs><linearGradient id="hg" gradientUnits="userSpaceOnUse" x1="12" y1="0" x2="60" y2="0">` +
  `<stop offset="0" stop-color="${p.c1}"/><stop offset=".45" stop-color="${p.c2}"/><stop offset="1" stop-color="${p.c3}"/></linearGradient>` +
  `<linearGradient id="hv" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="62">` +
  `<stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>${inner}</svg>`;

/** Заливка формы: градиент цвета + вертикальная тень + тонкий контур. */
const shape = (p: Pal, d: string): string =>
  `<path d="${d}" fill="url(#hg)" stroke="${p.ink}" stroke-opacity=".75" stroke-width="1.15" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="url(#hv)"/>`;
const strands = (p: Pal, ds: string[]): string =>
  ds.map((d) => `<path d="${d}" fill="none" stroke="${p.ink}" stroke-opacity=".34" stroke-width=".9" stroke-linecap="round"/>`).join('');
const shine = (p: Pal, ds: string[]): string =>
  ds.map((d) => `<path d="${d}" fill="none" stroke="${p.c0}" stroke-opacity=".78" stroke-width="1.7" stroke-linecap="round"/>`).join('');
/** Группа кругов (пушистые причёски): сначала контур, потом заливка, чтобы внутри не было линий. */
const blob = (p: Pal, cs: [number, number, number][]): string => {
  const ring = cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.ink}" fill-opacity=".8" stroke="${p.ink}" stroke-opacity=".8" stroke-width="2.3"/>`).join('');
  const fill = cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#hg)"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#hv)"/>`).join('');
  return ring + fill;
};

type Builder = (p: Pal) => string;
interface Style { behind?: Builder; over: Builder; back: Builder }

const capOver = (p: Pal, fringe: string): string =>
  shape(p, `M20 31 C17.5 20 21 8.5 36 7 C51 8.5 54.5 20 52 31 L50.6 31 ${fringe} C22.5 26.5 21.6 29 21.4 31 Z`);

const STYLES: Record<(typeof HAIR_STYLES)[number], Style> = {
  short: {
    over: (p) =>
      capOver(p, 'C50.2 25.5 47 21 42 19.5 C39 18.8 36.5 21.6 33.5 22.5 C30 23.5 27 22 24.5 24.5') +
      strands(p, ['M30 9 C28 14 27 19 28.5 23', 'M37.5 7.6 C36.5 12 36.5 17 38.5 20', 'M45 9.4 C47 14 48 19 47.5 24']) +
      shine(p, ['M25.5 15.5 C28.5 10.5 34 8.6 40.5 9.4']),
    back: (p) =>
      shape(p, 'M19.8 31 C15.8 18 22 6.8 36 6.5 C50 6.8 56.2 18 52.2 31 C52.4 36 50.8 40.5 47 43.5 C43 41.5 40 41 36 41 C32 41 29 41.5 25 43.5 C21.2 40.5 19.6 36 19.8 31 Z') +
      strands(p, ['M36 7 C36 18 36.5 28 36 40', 'M28 9 C26 20 27 30 28.5 40', 'M44 9 C46 20 45 30 43.5 40']) +
      shine(p, ['M26 14 C29 9.5 35 8 41 8.8']),
  },
  bob: {
    behind: (p) => shape(p, 'M16.5 46 C13 32 15 9 36 6 C57 9 59 32 55.5 46 C54 49 49 49.6 46.5 47 L25.5 47 C23 49.6 18 49 16.5 46 Z'),
    over: (p) =>
      shape(p, 'M18 44 C15.5 30 17 12 36 8 C55 12 56.5 30 54 44 C52 46.6 48.5 46.6 47 44 C46.5 38 47 32 48.5 27.5 C46 24.5 41 23 36 24 C31 23 26 24.5 23.5 27.5 C25 32 25.5 38 25 44 C23.5 46.6 20 46.6 18 44 Z') +
      strands(p, ['M22 14 C19 26 19.5 36 21 44', 'M50 14 C53 26 52.5 36 51 44', 'M30 9.5 C28 14 27 19 26 24']) +
      shine(p, ['M24 16 C28 11 34 9.4 40 10']),
    back: (p) =>
      shape(p, 'M16.5 46 C13 32 15 8 36 5.5 C57 8 59 32 55.5 46 C54 49 49 49.6 46.5 47 L25.5 47 C23 49.6 18 49 16.5 46 Z') +
      strands(p, ['M36 6 C36 20 36 34 36 46', 'M26 8 C20 22 21 36 24 46', 'M46 8 C52 22 51 36 48 46']) +
      shine(p, ['M24 14 C28 9 34 7.6 41 8.4']),
  },
  long: {
    behind: (p) => shape(p, 'M15.5 74 C11 52 13 10 36 6 C59 10 61 52 56.5 74 C54 78 49 77.5 47 74 L25 74 C23 77.5 18 78 15.5 74 Z'),
    over: (p) =>
      shape(p, 'M18.5 62 C14.5 46 15.5 12 36 8 C56.5 12 57.5 46 53.5 62 C52 65.4 48 65.4 46.5 62 C46 52 47 38 48.5 27.5 C46 24.5 41 23 36 24 C31 23 26 24.5 23.5 27.5 C25 38 26 52 25.5 62 C24 65.4 20 65.4 18.5 62 Z') +
      strands(p, ['M21 14 C17.5 30 18 48 20 62', 'M51 14 C54.5 30 54 48 52 62', 'M30 9.5 C28 14 27 19 26 24']) +
      shine(p, ['M24 16 C28 11 34 9.4 40 10', 'M20.4 36 C19.6 42 19.8 48 20.4 54']),
    back: (p) =>
      shape(p, 'M15.5 76 C11 52 13 9 36 5.5 C59 9 61 52 56.5 76 C54 80 49 79 47 76 L25 76 C23 79 18 80 15.5 76 Z') +
      strands(p, ['M36 6 C36 30 36 54 36 76', 'M26 8 C19 30 20 56 23 76', 'M46 8 C53 30 52 56 49 76']) +
      shine(p, ['M24 14 C28 9 34 7.6 41 8.4', 'M30 34 C29 46 29.4 58 30.4 68']),
  },
  spiky: {
    over: (p) =>
      shape(p, 'M20.5 31 C18 24.5 18 18.5 20 14 L16.5 6 L25 11 L25 2.5 L31 9.5 L36 0.8 L41 9.5 L47 2.5 L47 11 L55.5 6 L52 14 C54 18.5 54 24.5 51.5 31 L50 26.5 L46.5 20.5 L43 24.5 L39.2 19.5 L36 24.5 L32.8 19.5 L29 24.5 L25.5 20.5 L22 26.5 Z') +
      strands(p, ['M36 2 C35 9 35 15 36 19', 'M27 8 C26 13 26.5 17 27.5 20', 'M45 8 C46 13 45.5 17 44.5 20']) +
      shine(p, ['M24 12 C28 8 33 6 38 7']),
    back: (p) =>
      shape(p, 'M20 31 C17.5 24.5 18 18.5 20 14 L16.5 6 L25 11 L25 2.5 L31 9.5 L36 0.8 L41 9.5 L47 2.5 L47 11 L55.5 6 L52 14 C54 18.5 54.5 24.5 52 31 C52.4 36 50.8 40.5 47 43 C43 41 40 40.5 36 40.5 C32 40.5 29 41 25 43 C21.2 40.5 19.6 36 20 31 Z') +
      strands(p, ['M36 3 C36 18 36 30 36 40', 'M26 9 C25 20 26 30 28 40', 'M46 9 C47 20 46 30 44 40']) +
      shine(p, ['M24 14 C28 9 33 7 38 7.6']),
  },
  bun: {
    behind: (p) => blob(p, [[36, 7.4, 8.4]]) + strands(p, ['M31 4 C34 7 38 7 41 4', 'M30 8 C34 11 38 11 42 8']),
    over: (p) =>
      shape(p, 'M20 31 C17.5 20 21 9.8 36 8.6 C51 9.8 54.5 20 52 31 L50.6 31 C50 26 47.5 22 43 20.2 C40 19.5 38 20.2 36 21.8 C34 20.2 32 19.5 29 20.2 C24.5 22 22 26 21.4 31 Z') +
      `<ellipse cx="36" cy="12" rx="6.2" ry="2.2" fill="${p.ink}" fill-opacity=".85"/><ellipse cx="36" cy="11.4" rx="5" ry="1.2" fill="${p.c0}" fill-opacity=".5"/>` +
      strands(p, ['M27 12 C25 17 25 22 26.4 26', 'M45 12 C47 17 47 22 45.6 26']) +
      shine(p, ['M24.6 17 C27.5 12 32 10.4 36.5 10.8']),
    back: (p) =>
      blob(p, [[36, 7.4, 8.4]]) +
      shape(p, 'M19.8 31 C15.8 19 22 8.8 36 8.5 C50 8.8 56.2 19 52.2 31 C52.4 36 50.8 40.5 47 43.5 C43 41.5 40 41 36 41 C32 41 29 41.5 25 43.5 C21.2 40.5 19.6 36 19.8 31 Z') +
      `<ellipse cx="36" cy="12.4" rx="6.2" ry="2.2" fill="${p.ink}" fill-opacity=".85"/>` +
      strands(p, ['M36 14 C36 24 36.5 32 36 41', 'M28 12 C26 22 27 32 28.5 41', 'M44 12 C46 22 45 32 43.5 41']) +
      shine(p, ['M26 17 C29 12 34 10.6 40 11.2']),
  },
  ponytail: {
    behind: (p) =>
      shape(p, 'M48.5 14 C58 11.5 64.6 22 63 36 C62 46 59 54 55.4 61 C53 55.4 54.4 46 54.2 38 C54 30 52.4 23.4 46.5 20.5 Z') +
      strands(p, ['M52 17 C58.5 24 60 38 57 54', 'M50.5 19 C55 26 56.4 38 55 52']),
    over: (p) =>
      capOver(p, 'C50.2 25.5 47.4 21.4 42.6 19.8 C39.4 18.8 36.8 21.4 33.6 22.4 C30 23.4 27 22.2 24.6 24.8') +
      `<ellipse cx="50.4" cy="16.6" rx="3.1" ry="4.2" transform="rotate(-24 50.4 16.6)" fill="#e8527a" stroke="${p.ink}" stroke-opacity=".7" stroke-width="1"/>` +
      strands(p, ['M30 9 C28 14 27 19 28.5 23', 'M37.5 7.6 C36.5 12 36.5 17 38.5 20']) +
      shine(p, ['M25.5 15.5 C28.5 10.5 34 8.6 40.5 9.4']),
    back: (p) =>
      shape(p, 'M19.8 31 C15.8 18 22 6.8 36 6.5 C50 6.8 56.2 18 52.2 31 C52.4 36 50.8 40.5 47 43.5 C43 41.5 40 41 36 41 C32 41 29 41.5 25 43.5 C21.2 40.5 19.6 36 19.8 31 Z') +
      shape(p, 'M30.5 15 C26.5 32 29.5 52 36 64 C42.5 52 45.5 32 41.5 15 Z') +
      `<ellipse cx="36" cy="16.4" rx="6" ry="2.4" fill="#e8527a" stroke="${p.ink}" stroke-opacity=".7" stroke-width="1"/>` +
      strands(p, ['M36 19 C36 36 36 52 36 63', 'M32.5 19 C30.5 34 32.5 50 35 62', 'M39.5 19 C41.5 34 39.5 50 37 62']) +
      shine(p, ['M26 12 C29 8.4 35 7.4 41 8.2']),
  },
  curly: {
    behind: (p) => blob(p, [[20, 22, 10], [52, 22, 10], [36, 8.5, 12], [16.5, 36, 8.6], [55.5, 36, 8.6], [26.5, 10.5, 10], [45.5, 10.5, 10]]),
    over: (p) =>
      blob(p, [[27.5, 16.6, 7], [36, 13.4, 7.6], [44.5, 16.6, 7], [22, 25, 5.4], [50, 25, 5.4]]) +
      shine(p, ['M24 13 C26 9.6 29.6 9 32 10', 'M40 9.4 C42.6 9 45 9.8 46.4 11.6']),
    back: (p) =>
      blob(p, [[36, 22, 17], [21.5, 29.5, 10.5], [50.5, 29.5, 10.5], [27, 11.5, 10.5], [45, 11.5, 10.5], [36, 6.8, 10], [22, 40, 7.6], [50, 40, 7.6], [36, 42.5, 8.6]]) +
      shine(p, ['M25 14 C27 10 31 9 34 10', 'M40 8.6 C43 8 46 9 47.4 11.4']),
  },
};

const imgCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

function key(style: string, color: string, part: HairPart): string { return `${style}|${color}|${part}`; }

export function hairSvg(style: string, color: string, part: HairPart): string | null {
  const s = STYLES[style as keyof typeof STYLES];
  if (!s) return null;
  const b = part === 'behind' ? s.behind : part === 'over' ? s.over : s.back;
  return b ? wrap(palette(color), b(palette(color))) : null;
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось подготовить причёску'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** Готовит (асинхронно) все части причёски нужного цвета. После этого hairImage() отдаёт картинку синхронно. */
export async function preloadHair(style: string, color: string): Promise<void> {
  const parts: HairPart[] = ['behind', 'over', 'back'];
  await Promise.all(parts.map(async (part) => {
    const k = key(style, color, part);
    if (imgCache.has(k)) return;
    const svg = hairSvg(style, color, part);
    if (!svg) return;
    if (!pending.has(k)) pending.set(k, loadImage(svg).then((i) => { imgCache.set(k, i); return i; }));
    await pending.get(k);
  }));
}

export function hairImage(style: string, color: string, part: HairPart): HTMLImageElement | null {
  return imgCache.get(key(style, color, part)) ?? null;
}
