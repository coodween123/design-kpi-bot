import type { FurnitureDef } from '../../config/room';
import { Iso, pal, shade, OUTLINE } from './iso2d';

// Рисовалки мебели. Каждая получает Iso-холст в координатах предмета (u, v — клетки, z — px).
// Чтобы добавить новый вид предмета — допишите функцию в DRAWERS и используйте её ключ в config/room.ts.
export type Drawer = (I: Iso, def: FurnitureDef) => void;

const OAK = '#e2a66a';
const OAK_D = '#9a6034';
const WHITE = '#f4f1ea';
const CREAM = '#f1ead9';
const NAVY = '#2c4a72';
const TEAL = '#3fa49c';
const CORAL = '#e4685a';
const GOLD = '#e9b949';
const STEEL = '#46586a';
const INKA = 'rgba(14,34,52,0.5)';

/** Сглаживание ломаной (Catmull-Rom, замкнутая) — для плавных силуэтов. */
function smooth(pts: [number, number][], n = 6): [number, number][] {
  const out: [number, number][] = [];
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

export const DRAWERS: Record<string, Drawer> = {
  desk(I) {
    I.shadow(0, 0, 3, 1, 0.22);
    const legs = pal(STEEL);
    for (const [u, v] of [[0.06, 0.08], [2.84, 0.08], [0.06, 0.82], [2.84, 0.82]]) I.box(u, v, 0, 0.1, 0.1, 34, legs);
    // тумба справа
    I.box(2.0, 0.06, 2, 0.84, 0.86, 32, pal(WHITE));
    I.faceV(0.92, 2.04, 2.8, 18, 18.8, 'rgba(14,34,52,0.22)');
    I.faceV(0.92, 2.3, 2.54, 24.4, 26.4, GOLD, INKA);
    I.faceV(0.92, 2.3, 2.54, 11, 13, GOLD, INKA);
    // столешница
    I.box(0, 0, 34, 3, 1, 6, pal(OAK));
    I.grain(0, 0, 3, 1, 40, '120,64,24', 6, 0.2);
    // пенал, суккулент
    I.box(2.72, 0.2, 40, 0.2, 0.2, 9, pal(NAVY));
    for (const [dx, col] of [[0.04, '255,107,107'], [0.1, '255,209,102'], [0.15, '74,168,160']] as [number, string][]) I.edge(I.p(2.72 + dx, 0.28, 49), I.p(2.7 + dx * 1.4, 0.26, 58), 1, col);
    I.box(1.5, 0.3, 40, 0.2, 0.2, 7, pal(WHITE));
    const [sx, sy] = I.p(1.6, 0.4, 47);
    for (const [dx, dy, r] of [[-3, -1, 3.2], [3, -1, 3.2], [0, -4, 3.6]] as [number, number, number][]) I.ellipse(sx + dx * I.S, sy + dy * I.S, r, r * 0.8, '#4cb274', 'rgba(20,70,40,0.5)');
  },

  chair(I) {
    I.shadow(0.12, 0.12, 0.76, 0.76, 0.2);
    const legs = pal(STEEL);
    for (const [u, v] of [[0.2, 0.2], [0.72, 0.2], [0.2, 0.72], [0.72, 0.72]]) I.box(u, v, 0, 0.07, 0.07, 22, legs);
    I.box(0.14, 0.14, 22, 0.72, 0.72, 8, pal(TEAL));
    I.box(0.14, 0.78, 30, 0.72, 0.1, 36, pal(shade(TEAL, -0.06)));
    I.edge(I.p(0.2, 0.89, 64), I.p(0.8, 0.89, 64), 0.5);
  },

  laptop(I) {
    I.shadow(0, 0.05, 0.9, 0.65, 0.12);
    I.box(0.02, 0.12, 0, 0.86, 0.58, 3, pal('#cdd5dc'));
    for (let i = 1; i <= 3; i++) I.edge(I.p(0.1, 0.12 + 0.12 * i, 3), I.p(0.8, 0.12 + 0.12 * i, 3), 0.3, '40,50,60');
    I.box(0.06, 0.08, 3, 0.78, 0.05, 27, pal('#313a47'));
    const g = I.lineGrad(I.p(0, 0.13, 30), I.p(0, 0.13, 5), [[0, '#7ee0ff'], [0.55, '#5b8cf0'], [1, '#7a5ae0']]);
    I.faceV(0.13, 0.1, 0.8, 6, 29, g);
    I.faceV(0.13, 0.1, 0.8, 26, 29, 'rgba(255,255,255,0.55)');
    // окно дизайн-редактора: цветовые образцы и макет
    I.faceV(0.13, 0.16, 0.34, 10, 22, 'rgba(255,255,255,0.85)');
    for (const [i, col] of ['#ff6b6b', '#ffd166', '#4aa8a0'].entries()) I.faceV(0.13, 0.4, 0.74, 20 - i * 4.4, 23 - i * 4.4 - 1.2, col);
    I.faceV(0.13, 0.4, 0.74, 7, 9, 'rgba(255,255,255,0.7)');
  },

  catalog(I) {
    I.shadow(0, 0, 0.65, 0.65, 0.12);
    I.box(0.0, 0.04, 0, 0.64, 0.54, 3.4, pal('#2f4a7a'));
    I.box(0.03, 0.06, 3.4, 0.58, 0.5, 3.6, pal(TEAL));
    I.faceV(0.56, 0.04, 0.58, 4, 6.6, GOLD, INKA);
    I.poly([I.p(0.14, 0.16, 7), I.p(0.44, 0.16, 7), I.p(0.44, 0.44, 7), I.p(0.14, 0.44, 7)], shade(GOLD, 0.1), INKA, 0.8);
    I.poly([I.p(0.22, 0.3, 7), I.p(0.29, 0.22, 7), I.p(0.36, 0.3, 7), I.p(0.29, 0.38, 7)], shade(TEAL, -0.2), null);
    I.faceV(0.56, 0.44, 0.5, 0.4, 3.6, '#d94a5a', INKA);
  },

  wardrobe(I) {
    I.shadow(0, 0, 1, 2, 0.24);
    I.box(0, 0, 0, 1, 2, 6, pal('#27415c'));
    I.box(0, 0, 6, 1, 2, 120, pal(CREAM));
    I.box(-0.03, -0.03, 126, 1.06, 2.06, 8, pal(shade(CREAM, -0.04)));
    const door = (v0: number, v1: number) => {
      I.faceU(1, v0, v1, 12, 121, shade(CREAM, 0.05), OUTLINE);
      const glass = I.lineGrad(I.p(1, v0, 112), I.p(1, v1, 22), [[0, '#8fd3d0'], [1, '#2f8f90']]);
      I.faceU(1, v0 + 0.1, v1 - 0.1, 22, 112, glass, INKA);
      I.poly([I.p(1, v0 + 0.14, 108), I.p(1, v0 + 0.4, 108), I.p(1, v0 + 0.14, 62)], 'rgba(255,255,255,0.28)', null);
      I.poly([I.p(1, v1 - 0.4, 108), I.p(1, v1 - 0.16, 108), I.p(1, v1 - 0.16, 84)], 'rgba(255,255,255,0.2)', null);
    };
    door(0.08, 0.98); door(1.02, 1.92);
    I.faceU(1, 0.84, 0.9, 58, 80, GOLD, INKA);
    I.faceU(1, 1.1, 1.16, 58, 80, GOLD, INKA);
    I.edge(I.p(1, 0.04, 120), I.p(1, 1.96, 120), 0.5);
  },

  tv(I) {
    I.shadow(0, 0, 2, 1, 0.22);
    I.box(0, 0.05, 0, 2, 0.9, 22, pal(WHITE));
    I.box(0, 0.05, 22, 2, 0.9, 2.5, pal(OAK));
    I.faceV(0.95, 0.1, 0.95, 3, 19, shade(WHITE, -0.08), INKA);
    I.faceV(0.95, 1.05, 1.9, 3, 19, shade(WHITE, -0.08), INKA);
    I.faceV(0.95, 0.5, 0.56, 10, 13, GOLD); I.faceV(0.95, 1.44, 1.5, 10, 13, GOLD);
    I.box(0.9, 0.38, 24.5, 0.2, 0.2, 8, pal('#2d3036'));
    I.box(0.15, 0.4, 32, 1.7, 0.1, 62, pal('#1d2026'));
    const g = I.lineGrad(I.p(0.2, 0.5, 92), I.p(1.8, 0.5, 35), [[0, '#59c4ff'], [0.6, '#2d8fe0'], [1, '#1a5bb0']]);
    I.faceV(0.5, 0.2, 1.8, 36, 90, g);
    I.poly([I.p(0.2, 0.5, 90), I.p(0.8, 0.5, 90), I.p(0.46, 0.5, 36), I.p(0.2, 0.5, 36)], 'rgba(255,255,255,0.13)', null);
    // белая птица на экране
    const bird = (pts: [number, number][], fill: string) => I.poly(smooth(pts).map(([x, y]) => I.p(1.0 + x * 0.44, 0.5, 63 + y * 17)), fill, null);
    bird([[-0.2, 0.08], [-0.34, 0.5], [-0.6, 0.86], [-0.86, 0.9], [-0.7, 0.55], [-0.52, 0.28], [-0.4, 0.1]], '#cfe6fb');       // дальнее крыло
    bird([[-0.9, -0.22], [-0.5, 0.0], [-0.1, 0.16], [0.32, 0.3], [0.6, 0.38], [0.8, 0.26], [1.02, 0.14], [0.8, 0.04], [0.66, -0.06],
      [0.42, -0.4], [0.0, -0.52], [-0.5, -0.46], [-0.9, -0.5]], '#ffffff');                                                       // тело, голова, клюв, хвост
    bird([[0.1, 0.06], [-0.04, 0.5], [-0.28, 0.86], [-0.6, 1.0], [-0.55, 0.62], [-0.38, 0.32], [-0.2, 0.08]], '#ffffff');        // ближнее крыло
    I.ellipse(...I.p(1.0 + 0.62 * 0.44, 0.5, 63 + 0.22 * 17), 1.6, 1.6, '#2d8fe0');
  },

  sofa(I) {
    I.shadow(0, 0, 1, 3, 0.24);
    const body = CORAL;
    for (const v of [0.12, 2.74]) for (const u of [0.1, 0.78]) I.box(u, v, 0, 0.12, 0.12, 6, pal('#3a2e2a'));
    I.box(0, 0, 6, 1, 3, 4, pal(shade(body, -0.35)));
    I.box(0, 0, 10, 0.32, 3, 42, pal(shade(body, -0.04)));
    I.box(0, 0, 10, 1, 0.3, 26, pal(shade(body, -0.1)));
    for (let i = 0; i < 3; i++) {
      I.box(0.32, 0.3 + i * 0.8, 10, 0.68, 0.78, 12, pal(i % 2 ? shade(body, 0.05) : body));
      I.faceU(1, 0.36 + i * 0.8, 1.04 + i * 0.8, 17, 17.8, 'rgba(60,10,10,0.22)');
    }
    I.box(0, 2.7, 10, 1, 0.3, 26, pal(shade(body, -0.1)));
    I.edge(I.p(0.04, 0.02, 52), I.p(0.04, 2.98, 52), 0.4);
    I.box(0.36, 0.42, 22, 0.14, 0.46, 15, pal('#ffd98a'));
    I.box(0.36, 2.05, 22, 0.14, 0.46, 15, pal('#4aa8a0'));
  },

  rug(I, def) {
    const w = def.w, d = def.d;
    const rim: [number, number][] = [[0, 0], [w, 0], [w, d], [0, d]];
    I.poly(rim.map(([u, v]) => I.p(u, v)), '#efe4cf', 'rgba(14,34,52,0.4)');
    const inset = (k: number): [number, number][] => [[k, k], [w - k, k], [w - k, d - k], [k, d - k]];
    const ring = (k: number, col: string, st: string | null = null) => I.poly(inset(k).map(([u, v]) => I.p(u, v)), col, st, 0.8);
    ring(0.16, '#2c4a72'); ring(0.26, '#efe4cf'); ring(0.5, '#3fa49c');
    // ромб в центре
    const cu = w / 2, cv = d / 2, r = Math.min(w, d) / 2 - 0.62;
    I.poly([I.p(cu, cv - r), I.p(cu + r, cv), I.p(cu, cv + r), I.p(cu - r, cv)], '#efe4cf', '#2c4a72', 1.1);
    I.poly([I.p(cu, cv - r * 0.5), I.p(cu + r * 0.5, cv), I.p(cu, cv + r * 0.5), I.p(cu - r * 0.5, cv)], '#e4685a', null);
    for (let i = 1; i < 6; i++) I.edge(I.p(0.04, (d * i) / 6), I.p(0.14, (d * i) / 6), 0.5, '44,74,114');
  },

  coffeeTable(I) {
    I.shadow(0, 0, 1, 1.6, 0.2);
    for (const [u, v] of [[0.1, 0.1], [0.8, 0.1], [0.1, 1.4], [0.8, 1.4]]) I.box(u, v, 0, 0.08, 0.08, 18, pal(GOLD));
    I.box(0, 0, 18, 1, 1.6, 5, pal(OAK));
    I.grain(0, 0, 1, 1.6, 23, '120,64,24', 4, 0.2);
    I.box(0.2, 0.25, 23, 0.2, 0.2, 7, pal(WHITE));
    const [sx, sy] = I.p(0.7, 1.3, 25);
    I.ellipse(sx, sy - 3 * I.S, 5, 3, '#4cb274', 'rgba(20,70,40,0.5)');
    I.ellipse(sx, sy, 3.6, 2.2, shade(WHITE, -0.05), INKA);
  },

  bookshelf(I) {
    I.shadow(0, 0, 1, 1, 0.22);
    I.box(0.05, 0.1, 0, 0.9, 0.8, 120, pal(OAK));
    I.faceV(0.9, 0.12, 0.88, 6, 114, shade(OAK_D, -0.15));
    const cols = ['#e4685a', '#3fa49c', '#f2c14e', '#6a63d6', '#4f9be0', '#f08fb0', '#2c4a72'];
    for (let row = 0; row < 4; row++) {
      const z0 = 8 + row * 28;
      let u = 0.14, i = row * 2;
      while (u < 0.8) {
        const w = 0.06 + ((i * 7) % 3) * 0.02;
        const h = 18 + ((i * 5) % 4) * 2;
        I.faceV(0.9, u, u + w, z0 + 1.5, z0 + 1.5 + h, cols[i % cols.length], 'rgba(14,34,52,0.35)');
        I.edge(I.p(u + 0.01, 0.9, z0 + 1.5 + h), I.p(u + w - 0.01, 0.9, z0 + 1.5 + h), 0.45);
        u += w + 0.012; i++;
      }
      I.faceV(0.9, 0.1, 0.9, z0, z0 + 1.6, OAK, null);
    }
    I.box(0.05, 0.1, 120, 0.9, 0.8, 3, pal(shade(OAK, 0.08)));
    // декор сверху
    I.box(0.3, 0.3, 123, 0.18, 0.18, 6, pal(WHITE));
    const [sx, sy] = I.p(0.39, 0.39, 131);
    I.ellipse(sx, sy - 2 * I.S, 5, 4, '#4cb274', 'rgba(20,70,40,0.5)');
    I.ellipse(sx - 4 * I.S, sy, 3.5, 2.6, '#3f9d63', 'rgba(20,70,40,0.5)');
  },

  plant(I) {
    I.shadow(0.2, 0.2, 0.6, 0.6, 0.2);
    const cx = I.p(0.5, 0.5, 0);
    const S = I.S;
    I.poly([[cx[0] - 15 * S, cx[1] - 14 * S], [cx[0] + 15 * S, cx[1] - 14 * S], [cx[0] + 11 * S, cx[1] + 2 * S], [cx[0] - 11 * S, cx[1] + 2 * S]],
      I.lineGrad([cx[0] - 15 * S, 0], [cx[0] + 15 * S, 0], [[0, '#e0916e'], [1, '#a95a3c']]));
    I.ellipse(cx[0], cx[1] - 14 * S, 15, 6, '#5b3a2c', INKA);
    const leaves: [number, number, number, number, string][] = [
      [-18, -55, 9, 26, '#3f9d63'], [16, -58, 9, 28, '#4cb274'], [0, -74, 9, 31, '#2f8a55'],
      [-8, -44, 8, 22, '#56bf80'], [10, -42, 8, 22, '#3f9d63'], [-26, -38, 7, 20, '#2f8a55'], [26, -36, 7, 20, '#56bf80'],
    ];
    for (const [dx, dy, rx, ry, col] of leaves) {
      const g = I.c.createLinearGradient(cx[0] + (dx - rx) * S, 0, cx[0] + (dx + rx) * S, 0);
      g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.2));
      I.ellipse(cx[0] + dx * S, cx[1] + dy * S, rx, ry, g as unknown as string, 'rgba(14,50,30,0.55)', dx * 0.03);
      I.c.beginPath(); I.c.moveTo(cx[0] + dx * S, cx[1] + (dy + ry * 0.8) * S); I.c.lineTo(cx[0] + dx * S, cx[1] + (dy - ry * 0.7) * S);
      I.c.strokeStyle = 'rgba(255,255,255,0.28)'; I.c.lineWidth = S; I.c.stroke();
    }
  },

  lamp(I) {
    I.shadow(0.25, 0.25, 0.5, 0.5, 0.2);
    const b = I.p(0.5, 0.5, 0);
    const S = I.S;
    I.ellipse(b[0], b[1] - 2 * S, 14, 6.5, '#3a3442', INKA);
    I.poly([[b[0] - 2 * S, b[1] - 3 * S], [b[0] + 2 * S, b[1] - 3 * S], [b[0] + 2 * S, b[1] - 112 * S], [b[0] - 2 * S, b[1] - 112 * S]],
      I.lineGrad([b[0] - 2 * S, 0], [b[0] + 2 * S, 0], [[0, '#f3d27a'], [1, '#b98a2e']]), INKA);
    const glow = I.c.createRadialGradient(b[0], b[1] - 124 * S, 4 * S, b[0], b[1] - 124 * S, 60 * S);
    glow.addColorStop(0, 'rgba(255,225,150,0.6)'); glow.addColorStop(1, 'rgba(255,225,150,0)');
    I.c.fillStyle = glow;
    I.c.fillRect(b[0] - 70 * S, b[1] - 190 * S, 140 * S, 140 * S);
    I.poly([[b[0] - 20 * S, b[1] - 108 * S], [b[0] + 20 * S, b[1] - 108 * S], [b[0] + 13 * S, b[1] - 138 * S], [b[0] - 13 * S, b[1] - 138 * S]],
      I.lineGrad([b[0] - 20 * S, 0], [b[0] + 20 * S, 0], [[0, '#fff0c0'], [1, '#f0c470']]));
    I.ellipse(b[0], b[1] - 138 * S, 13, 4, '#fff6dc', INKA);
  },

  window(I, def) {
    // окно закрыто шторами: нейтральный вид, без улицы
    const d = def.d;
    const frame = '#f6f8fa';
    I.faceU(0, -0.05, d + 0.05, 56, 140, frame, INKA);
    const glow = I.lineGrad(I.p(0, 0, 134), I.p(0, 0, 62), [[0, '#fff4cf'], [1, '#ffe2a0']]);
    I.faceU(0, 0.05, d - 0.05, 62, 134, glow);
    I.box(0, -0.08, 52, 0.14, d + 0.16, 5, pal(frame));
    // шторы: полосы-складки с лёгким «волнистым» низом
    const base = '#f3e6d2';
    const half = d / 2 + 0.22;
    const strip = (v0: number, v1: number, i: number) => {
      const zb = 55 + Math.sin(i * 1.9) * 1.6;
      const light = i % 2 === 0;
      const g = I.lineGrad(I.p(0, v0, 100), I.p(0, v1, 100), [[0, shade(base, light ? 0.1 : -0.02)], [0.55, shade(base, light ? 0 : -0.1)], [1, shade(base, light ? -0.1 : -0.2)]]);
      I.poly([I.p(0, v0, 143), I.p(0, v1, 143), I.p(0, v1, zb), I.p(0, v0, zb)], g, 'rgba(120,80,50,0.3)', 0.6);
    };
    const n = Math.round(half / 0.105);
    for (let i = 0; i < n; i++) strip(-0.22 + (i * half) / n, -0.22 + ((i + 1) * half) / n, i);
    for (let i = 0; i < n; i++) strip(d + 0.22 - ((i + 1) * half) / n, d + 0.22 - (i * half) / n, i + 1);
    I.faceU(0, -0.22, d + 0.22, 134, 143, 'rgba(120,80,50,0.22)');
    // карниз с наконечниками
    I.faceU(0, -0.3, d + 0.3, 143, 145.5, GOLD, INKA);
    for (const v of [-0.3, d + 0.3]) { const [ex, ey] = I.p(0, v, 144.3); I.ellipse(ex, ey, 3.2, 3.2, shade(GOLD, 0.1), INKA); }
  },

  frames(I) {
    // три рамки с наградами — раздел «Обо мне»
    const frameAt = (u0: number, u1: number, z0: number, z1: number, bg: string, icon: (a: number, b: number, c: number, e: number) => void) => {
      I.faceV(0, u0, u1, z0, z1, '#f7f1e4', INKA);
      I.faceV(0, u0 + 0.04, u1 - 0.04, z0 + 3, z1 - 3, bg, 'rgba(14,34,52,0.35)');
      icon(u0, u1, z0, z1);
      I.edge(I.p(u0, 0, z1), I.p(u1, 0, z1), 0.6);
    };
    frameAt(0.0, 0.72, 78, 130, '#2c4a72', (a, b, z0, z1) => {
      const m = (a + b) / 2, k = (z0 + z1) / 2;
      I.poly([I.p(m - 0.17, 0, k + 12), I.p(m + 0.17, 0, k + 12), I.p(m + 0.1, 0, k - 2), I.p(m - 0.1, 0, k - 2)], GOLD, INKA, 0.8);
      I.poly([I.p(m - 0.2, 0, k + 9), I.p(m - 0.12, 0, k + 9), I.p(m - 0.12, 0, k + 3), I.p(m - 0.2, 0, k + 5)], 'rgba(0,0,0,0)', GOLD, 1.4);
      I.faceV(0, m - 0.03, m + 0.03, k - 8, k - 2, GOLD);
      I.faceV(0, m - 0.12, m + 0.12, k - 12, k - 8, shade(GOLD, -0.2), INKA);
    });
    frameAt(0.86, 1.58, 90, 134, '#3fa49c', (a, b, z0, z1) => {
      const m = (a + b) / 2, k = (z0 + z1) / 2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.09 : 0.2; const ang = -Math.PI / 2 + (i * Math.PI) / 5; pts.push(I.p(m + Math.cos(ang) * r, 0, k + Math.sin(ang) * -r * 32 * 0.95)); }
      I.poly(pts, '#ffe08a', INKA, 0.9);
    });
    frameAt(1.72, 2.4, 76, 124, '#e4685a', (a, b, z0, z1) => {
      const m = (a + b) / 2, k = (z0 + z1) / 2;
      const [hx, hy] = I.p(m, 0, k + 7);
      I.ellipse(hx, hy, 6.5, 6.5, '#f7e6d2', INKA);
      I.poly([I.p(m - 0.22, 0, k - 15), I.p(m - 0.16, 0, k - 3), I.p(m + 0.16, 0, k - 3), I.p(m + 0.22, 0, k - 15)], '#f7e6d2', INKA, 0.8);
    });
  },

  door(I, def) {
    const d = def.d;
    I.faceU(0, -0.07, d + 0.07, 0, 130, '#cfc7b6', INKA);
    const leaf = I.lineGrad(I.p(0, 0, 124), I.p(0, d, 0), [[0, '#fbf7ee'], [1, '#e1d9c8']]);
    I.faceU(0, 0.05, d - 0.05, 0, 124, leaf, INKA);
    const panel = (v0: number, v1: number, z0: number, z1: number) => {
      I.faceU(0, v0, v1, z0, z1, 'rgba(14,34,52,0.06)', 'rgba(14,34,52,0.35)');
      I.edge(I.p(0, v0, z1), I.p(0, v1, z1), 0.6);
    };
    panel(0.17, d - 0.17, 70, 112); panel(0.17, d - 0.17, 12, 62);
    const [hx, hy] = I.p(0, 0.2, 60);
    I.ellipse(hx, hy, 4, 4.6, GOLD, INKA);
    I.edge(I.p(0, 0.2, 60), I.p(0, 0.36, 60), 0.9, '233,185,73');
  },
};
