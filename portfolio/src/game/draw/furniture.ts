import type { FurnitureDef } from '../../config/room';
import { Iso, pal, shade, OUTLINE } from './iso2d';

// Рисовалки мебели. Каждая получает Iso-холст в координатах предмета (u, v — клетки, z — px).
// Чтобы добавить новый вид предмета — допишите функцию в DRAWERS и используйте её ключ в config/room.ts.
export type Drawer = (I: Iso, def: FurnitureDef) => void;

const WOOD = '#d6a56f';
const WOOD_DARK = '#a8764a';
const CREAM = '#f3e6cf';
const TEAL = '#4aa8a0';
const CORAL = '#ec7766';

export const DRAWERS: Record<string, Drawer> = {
  desk(I) {
    I.shadow(0, 0, 3, 1);
    const legs = pal(WOOD_DARK);
    for (const [u, v] of [[0.08, 0.1], [2.8, 0.1], [0.08, 0.8], [2.8, 0.8]]) I.box(u, v, 0, 0.12, 0.12, 36, legs);
    I.box(2.0, 0.08, 2, 0.85, 0.84, 34, pal('#c08a58'));
    I.faceU(2.85, 0.14, 0.86, 8, 32, 'rgba(0,0,0,0.06)');
    I.box(0, 0, 34, 3, 1, 6, pal(WOOD));
    // ручки ящиков
    I.faceV(0.92, 2.2, 2.62, 22, 24, '#f6e7c9', OUTLINE);
    I.faceV(0.92, 2.2, 2.62, 10, 12, '#f6e7c9', OUTLINE);
  },

  chair(I) {
    I.shadow(0.15, 0.15, 0.7, 0.7);
    const legs = pal(WOOD_DARK);
    for (const [u, v] of [[0.2, 0.2], [0.74, 0.2], [0.2, 0.74], [0.74, 0.74]]) I.box(u, v, 0, 0.07, 0.07, 22, legs);
    I.box(0.15, 0.15, 22, 0.7, 0.7, 7, pal(TEAL));
    I.box(0.15, 0.78, 29, 0.7, 0.08, 34, pal(shade(TEAL, -0.08)));
  },

  laptop(I) {
    I.shadow(0, 0.05, 0.9, 0.65, 0.1);
    I.box(0.02, 0.12, 0, 0.86, 0.58, 3, pal('#cfd6dd'));
    I.box(0.06, 0.08, 3, 0.78, 0.05, 27, pal('#3b4350'));
    const g = I.lineGrad(I.p(0, 0.13, 30), I.p(0, 0.13, 5), [[0, '#8fd3ff'], [1, '#4a8fe0']]);
    I.faceV(0.13, 0.1, 0.8, 6, 28, g);
    for (let i = 0; i < 4; i++) I.faceV(0.13, 0.16, 0.16 + 0.12 * (3 - i) + 0.22, 9 + i * 4.5, 10.8 + i * 4.5, 'rgba(255,255,255,0.55)');
    I.faceV(0.7, 0.2, 0.7, 3, 3.1, 'rgba(255,255,255,0.0)');
  },

  document(I) {
    I.shadow(0, 0, 0.65, 0.65, 0.1);
    I.box(0, 0.02, 0, 0.62, 0.62, 3, pal(CORAL));
    I.box(0.05, 0.08, 3, 0.5, 0.5, 1.5, pal('#fffaf0'));
    for (let i = 0; i < 3; i++) {
      I.poly([I.p(0.12, 0.18 + i * 0.12, 4.5), I.p(0.46, 0.18 + i * 0.12, 4.5), I.p(0.46, 0.21 + i * 0.12, 4.5), I.p(0.12, 0.21 + i * 0.12, 4.5)], '#b9b2c9', null);
    }
    I.poly([I.p(0.03, 0.02, 3), I.p(0.28, 0.02, 3), I.p(0.28, 0.12, 3), I.p(0.03, 0.12, 3)], shade(CORAL, -0.18), null);
  },

  wardrobe(I) {
    I.shadow(0, 0, 1, 2);
    I.box(0, 0, 0, 1, 2, 6, pal(shade(TEAL, -0.3)));
    I.box(0, 0, 6, 1, 2, 120, pal(CREAM));
    I.box(-0.02, -0.02, 126, 1.06, 2.04, 8, pal(shade(CREAM, -0.05)));
    // двери на грани +x
    const door = (v0: number, v1: number) => {
      I.faceU(1, v0, v1, 12, 120, I.lineGrad(I.p(1, v0, 120), I.p(1, v1, 12), [[0, shade(TEAL, 0.12)], [1, TEAL]]), OUTLINE);
      I.faceU(1, v0 + 0.1, v1 - 0.1, 24, 108, 'rgba(255,255,255,0.14)', 'rgba(40,60,60,0.25)');
    };
    door(0.08, 0.98); door(1.02, 1.92);
    I.faceU(1, 0.84, 0.9, 62, 74, '#f5d58a', OUTLINE);
    I.faceU(1, 1.1, 1.16, 62, 74, '#f5d58a', OUTLINE);
  },

  tv(I) {
    I.shadow(0, 0, 2, 1);
    I.box(0, 0.05, 0, 2, 0.9, 22, pal(WOOD));
    I.faceV(0.95, 0.1, 0.95, 3, 19, shade(WOOD_DARK, 0.05), OUTLINE);
    I.faceV(0.95, 1.05, 1.9, 3, 19, shade(WOOD_DARK, 0.05), OUTLINE);
    I.box(0.9, 0.38, 22, 0.2, 0.2, 8, pal('#2d3036'));
    I.box(0.15, 0.4, 30, 1.7, 0.1, 62, pal('#23262c'));
    const g = I.lineGrad(I.p(0.2, 0.5, 90), I.p(1.8, 0.5, 33), [[0, '#6a5acd'], [0.55, '#2c3e8f'], [1, '#1c2a5e']]);
    I.faceV(0.5, 0.2, 1.8, 34, 88, g);
    I.poly([I.p(0.2, 0.5, 88), I.p(0.75, 0.5, 88), I.p(0.45, 0.5, 34), I.p(0.2, 0.5, 34)], 'rgba(255,255,255,0.14)', null);
    I.faceV(0.5, 0.85, 1.15, 56, 62, 'rgba(255,255,255,0.28)');
  },

  sofa(I) {
    I.shadow(0, 0, 1, 3);
    const body = CORAL;
    I.box(0, 0, 0, 1, 3, 8, pal(shade(body, -0.35)));
    I.box(0, 0.0, 8, 0.32, 3, 42, pal(shade(body, -0.05)));
    I.box(0.0, 0.0, 8, 1, 0.3, 26, pal(shade(body, -0.1)));
    for (let i = 0; i < 3; i++) I.box(0.32, 0.3 + i * 0.8, 8, 0.68, 0.78, 12, pal(i % 2 ? shade(body, 0.04) : body));
    I.box(0.0, 2.7, 8, 1, 0.3, 26, pal(shade(body, -0.1)));
    // подушка
    I.box(0.35, 0.45, 20, 0.12, 0.45, 14, pal('#ffd98a'));
  },

  rug(I, def) {
    const w = def.w, d = def.d;
    const rim = [I.p(0, 0), I.p(w, 0), I.p(w, d), I.p(0, d)] as const;
    I.poly([...rim], '#e9b872', 'rgba(120,60,40,0.35)');
    const inset = (k: number): [number, number][] => [[k, k], [w - k, k], [w - k, d - k], [k, d - k]];
    const ring = (k: number, col: string) => I.poly(inset(k).map(([u, v]) => I.p(u, v)), col, null);
    ring(0.18, '#f4d9a8'); ring(0.36, '#d86b7a'); ring(0.62, '#f4d9a8'); ring(0.8, '#4aa8a0');
  },

  coffeeTable(I) {
    I.shadow(0, 0, 1, 1.6);
    const legs = pal(WOOD_DARK);
    for (const [u, v] of [[0.1, 0.1], [0.8, 0.1], [0.1, 1.4], [0.8, 1.4]]) I.box(u, v, 0, 0.1, 0.1, 18, legs);
    I.box(0, 0, 18, 1, 1.6, 5, pal(WOOD));
    I.box(0.2, 0.25, 23, 0.22, 0.22, 7, pal('#fffaf0'));        // кружка
    I.box(0.45, 0.85, 23, 0.4, 0.55, 2.5, pal(TEAL));           // книга
  },

  bookshelf(I) {
    I.shadow(0, 0, 1, 1);
    I.box(0.05, 0.1, 0, 0.9, 0.8, 120, pal(WOOD));
    I.faceV(0.9, 0.12, 0.88, 6, 114, shade(WOOD_DARK, -0.1));
    const cols = ['#e86f68', '#4aa8a0', '#f2c14e', '#7a63d6', '#5aa0e0', '#f08fb0'];
    for (let row = 0; row < 4; row++) {
      const z0 = 8 + row * 28;
      let u = 0.14;
      let i = row * 2;
      while (u < 0.8) {
        const w = 0.06 + ((i * 7) % 3) * 0.02;
        const h = 18 + ((i * 5) % 4) * 2;
        I.faceV(0.9, u, u + w, z0 + 1.5, z0 + 1.5 + h, cols[i % cols.length], 'rgba(40,20,30,0.3)');
        u += w + 0.012;
        i++;
      }
      I.faceV(0.9, 0.1, 0.9, z0, z0 + 1.6, WOOD, null);
    }
  },

  plant(I) {
    I.shadow(0.2, 0.2, 0.6, 0.6);
    const cx = I.p(0.5, 0.5, 0);
    const S = I.S;
    I.ellipse(cx[0], cx[1] - 12 * S, 15, 7, shade('#c97b5a', -0.15));
    I.poly([[cx[0] - 15 * S, cx[1] - 14 * S], [cx[0] + 15 * S, cx[1] - 14 * S], [cx[0] + 11 * S, cx[1] + 2 * S], [cx[0] - 11 * S, cx[1] + 2 * S]], '#c97b5a');
    I.ellipse(cx[0], cx[1] - 14 * S, 15, 6, '#5b3a2c');
    const leaves: [number, number, number, number, string][] = [
      [-18, -55, 9, 26, '#3f9d63'], [16, -58, 9, 28, '#4cb274'], [0, -72, 9, 30, '#2f8a55'],
      [-8, -44, 8, 22, '#56bf80'], [10, -42, 8, 22, '#3f9d63'], [-26, -38, 7, 20, '#2f8a55'], [26, -36, 7, 20, '#56bf80'],
    ];
    for (const [dx, dy, rx, ry, col] of leaves) {
      I.ellipse(cx[0] + dx * S, cx[1] + dy * S, rx, ry, col, 'rgba(20,50,30,0.35)', dx * 0.03);
    }
  },

  lamp(I) {
    I.shadow(0.25, 0.25, 0.5, 0.5);
    const b = I.p(0.5, 0.5, 0);
    const S = I.S;
    I.ellipse(b[0], b[1] - 2 * S, 14, 6.5, '#4a4452');
    I.poly([[b[0] - 2 * S, b[1] - 3 * S], [b[0] + 2 * S, b[1] - 3 * S], [b[0] + 2 * S, b[1] - 112 * S], [b[0] - 2 * S, b[1] - 112 * S]], '#6b6475');
    const glow = I.c.createRadialGradient(b[0], b[1] - 124 * S, 4 * S, b[0], b[1] - 124 * S, 52 * S);
    glow.addColorStop(0, 'rgba(255,225,150,0.55)'); glow.addColorStop(1, 'rgba(255,225,150,0)');
    I.c.fillStyle = glow;
    I.c.fillRect(b[0] - 60 * S, b[1] - 180 * S, 120 * S, 120 * S);
    I.poly([[b[0] - 20 * S, b[1] - 108 * S], [b[0] + 20 * S, b[1] - 108 * S], [b[0] + 13 * S, b[1] - 138 * S], [b[0] - 13 * S, b[1] - 138 * S]], '#f6d58a');
    I.ellipse(b[0], b[1] - 138 * S, 13, 4, '#fff0c4', OUTLINE);
  },

  window(I, def) {
    const d = def.d;
    const frame = '#fffaf0';
    I.faceU(0, 0, d, 58, 138, frame, OUTLINE);
    const sky = I.lineGrad(I.p(0, 0, 134), I.p(0, 0, 64), [[0, '#9fd8ff'], [1, '#e6f5ff']]);
    I.faceU(0, 0.07, d - 0.07, 64, 132, sky);
    // облака и бликующая диагональ
    I.faceU(0, 0.25, 0.7, 98, 108, 'rgba(255,255,255,0.8)');
    I.faceU(0, 1.0, 1.4, 108, 116, 'rgba(255,255,255,0.7)');
    I.poly([I.p(0, 0.1, 130), I.p(0, 0.5, 130), I.p(0, 0.2, 66), I.p(0, 0.1, 66)], 'rgba(255,255,255,0.2)', null);
    I.faceU(0, d / 2 - 0.025, d / 2 + 0.025, 62, 134, frame, OUTLINE);
    I.faceU(0, 0.05, d - 0.05, 97, 101, frame, OUTLINE);
    I.faceU(0, -0.06, d + 0.06, 54, 60, shade(frame, -0.06), OUTLINE);
    // шторы
    I.faceU(0, -0.12, 0.2, 52, 142, shade(CORAL, 0.1), OUTLINE);
    I.faceU(0, d - 0.2, d + 0.12, 52, 142, shade(CORAL, 0.1), OUTLINE);
  },

  frames(I, def) {
    const arts: { u: number; w: number; z: number; h: number; bg: string; draw: (u0: number, u1: number, z0: number, z1: number) => void }[] = [
      { u: 0.0, w: 0.7, z: 80, h: 44, bg: '#fff6e6', draw: (a, b, z0, z1) => I.faceV(0, a + 0.06, b - 0.06, z0 + 6, z1 - 6, '#4aa8a0') },
      { u: 0.85, w: 0.7, z: 92, h: 36, bg: '#fff6e6', draw: (a, b, z0, z1) => I.poly([I.p(a + 0.08, 0, z0 + 5), I.p(b - 0.08, 0, z0 + 5), I.p((a + b) / 2, 0, z1 - 5)], CORAL, null) },
      { u: 1.7, w: 0.7, z: 76, h: 52, bg: '#fff6e6', draw: (a, b, z0, z1) => { I.faceV(0, a + 0.06, b - 0.06, z0 + 6, (z0 + z1) / 2, '#f2c14e'); I.faceV(0, a + 0.06, b - 0.06, (z0 + z1) / 2, z1 - 6, '#7a63d6'); } },
    ];
    void def;
    for (const f of arts) {
      const a = f.u, b = f.u + f.w;
      I.faceV(0, a, b, f.z, f.z + f.h, shade(WOOD_DARK, 0.1), OUTLINE);
      I.faceV(0, a + 0.035, b - 0.035, f.z + 3, f.z + f.h - 3, f.bg);
      f.draw(a, b, f.z, f.z + f.h);
    }
  },

  door(I, def) {
    const d = def.d;
    const dark = '#7c4f35';
    I.faceU(0, -0.05, d + 0.05, 0, 126, dark, OUTLINE);
    const g = I.lineGrad(I.p(0, 0, 120), I.p(0, d, 0), [[0, shade(CORAL, 0.1)], [1, shade(CORAL, -0.08)]]);
    I.faceU(0, 0.05, d - 0.05, 0, 120, g, OUTLINE);
    I.faceU(0, 0.18, d - 0.18, 66, 108, 'rgba(255,255,255,0.18)', 'rgba(80,30,30,0.3)');
    I.faceU(0, 0.18, d - 0.18, 12, 56, 'rgba(255,255,255,0.18)', 'rgba(80,30,30,0.3)');
    const h = I.p(0, 0.2, 58);
    I.ellipse(h[0], h[1], 4, 5, '#f5d58a', OUTLINE);
    // табличка над дверью
    I.faceU(0, d / 2 - 0.3, d / 2 + 0.3, 128, 142, '#fffaf0', OUTLINE);
    I.faceU(0, d / 2 - 0.2, d / 2 + 0.2, 132, 138, TEAL);
  },
};
