import { ROOM_SIZE, WALL_HEIGHT } from '../../config/room';
import { SETTINGS } from '../../config/settings';
import { gridToWorld } from '../iso';
import { shade } from './iso2d';

// Оболочка комнаты: пол (доски с волокнами), две стены с панелями и рейками, толстый светлый кант стен и среза пола.
// Рисуется один раз в статичный спрайт.
const N = ROOM_SIZE;
const H = WALL_HEIGHT;
const SLAB = 22;           // толщина среза пола, px
const WT = 0.3;            // толщина стен, клеток
export const SHELL_BOUNDS = {
  x0: -N * 32 - 24, y0: -H - 30,
  x1: N * 32 + 24, y1: N * 32 + SLAB + 14,
};

const INK = 'rgba(14,34,52,0.55)';

export function drawShell(S = SETTINGS.texScale): HTMLCanvasElement {
  const b = SHELL_BOUNDS;
  const cv = document.createElement('canvas');
  cv.width = (b.x1 - b.x0) * S; cv.height = (b.y1 - b.y0) * S;
  const c = cv.getContext('2d')!;
  type P = [number, number];
  const wp = (gx: number, gy: number, z = 0): P => {
    const w = gridToWorld(gx, gy);
    return [(w.x - b.x0) * S, (w.y - z - b.y0) * S];
  };
  const path = (pts: P[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const poly = (pts: P[], fill: string | CanvasGradient, stroke: string | null = INK, lw = 1.1) => {
    path(pts);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw * S; c.lineJoin = 'round'; c.stroke(); }
  };
  const grad = (a: P, z: P, stops: [number, string][]) => {
    const g = c.createLinearGradient(a[0], a[1], z[0], z[1]);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  };
  const seg = (a: P, z: P, col: string, lw = 1, al = 1) => {
    c.beginPath(); c.moveTo(...a); c.lineTo(...z);
    c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw * S; c.lineCap = 'round'; c.stroke(); c.globalAlpha = 1;
  };

  // ============ ЛЕВАЯ СТЕНА (плоскость gx = 0, вдоль gy) ============
  const L = (gy0: number, gy1: number, z0: number, z1: number): P[] => [wp(0, gy0, z0), wp(0, gy1, z0), wp(0, gy1, z1), wp(0, gy0, z1)];
  // верхняя часть: тёплый светлый «морской» тон, свет от окна
  poly(L(0, N, 0, H), grad(wp(0, 0, H), wp(0, N, 0), [[0, '#9fd0df'], [0.5, '#82bcd0'], [1, '#6aa6bf']]), null);
  // нижние панели (вайнскот)
  poly(L(0, N, 0, 50), grad(wp(0, 0, 50), wp(0, N, 0), [[0, '#2f6a8a'], [1, '#235877']]), null);
  for (let i = 0; i < N; i += 1.25) {
    const a = i + 0.12, z = Math.min(N, i + 1.13);
    poly([wp(0, a, 9), wp(0, z, 9), wp(0, z, 41), wp(0, a, 41)], 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.25)', 0.8);
    seg(wp(0, a, 41), wp(0, z, 41), 'rgba(0,0,0,0.3)', 1);
  }
  poly(L(0, N, 50, 55), '#f4f8fa', 'rgba(14,34,52,0.35)', 0.8);                      // рейка
  poly(L(0, N, H - 9, H), 'rgba(255,255,255,0.55)', null);                            // карниз
  poly(L(0, N, 0, 11), '#f6f2ea', 'rgba(14,34,52,0.35)', 0.8);                        // плинтус
  // лёгкая вертикальная фактура верхней части
  for (let i = 0.4; i < N; i += 0.7) seg(wp(0, i, 58), wp(0, i, H - 12), 'rgba(255,255,255,0.12)', 1);

  // ============ ПРАВАЯ СТЕНА (плоскость gy = 0, вдоль gx) ============
  const R = (gx0: number, gx1: number, z0: number, z1: number): P[] => [wp(gx0, 0, z0), wp(gx1, 0, z0), wp(gx1, 0, z1), wp(gx0, 0, z1)];
  poly(R(0, N, 0, H), grad(wp(0, 0, H), wp(N, 0, 0), [[0, '#86bdd0'], [0.55, '#6eaac2'], [1, '#5894b0']]), null);
  poly(R(0, N, 0, 50), grad(wp(0, 0, 50), wp(N, 0, 0), [[0, '#295f7f'], [1, '#1f4f6d']]), null);
  for (let i = 0; i < N; i += 1.25) {
    const a = i + 0.12, z = Math.min(N, i + 1.13);
    poly([wp(a, 0, 9), wp(z, 0, 9), wp(z, 0, 41), wp(a, 0, 41)], 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.22)', 0.8);
  }
  // деревянные рейки за столом (акцентная панель)
  const SX0 = 1.7, SX1 = 5.7;
  poly(R(SX0, SX1, 0, H - 9), grad(wp(SX0, 0, H), wp(SX1, 0, 0), [[0, '#c78a4c'], [1, '#a46c37']]), 'rgba(14,34,52,0.45)', 1);
  for (let x = SX0 + 0.1; x < SX1; x += 0.2) {
    poly(R(x, x + 0.13, 3, H - 12), grad(wp(x, 0, H), wp(x + 0.13, 0, 0), [[0, '#e0a869'], [0.5, '#c58846'], [1, '#9c6532']]), 'rgba(60,30,10,0.5)', 0.6);
    seg(wp(x + 0.03, 0, H - 14), wp(x + 0.03, 0, 6), 'rgba(255,230,190,0.5)', 0.8);
  }
  poly(R(0, N, 50, 55), '#f4f8fa', 'rgba(14,34,52,0.35)', 0.8);
  poly(R(0, N, H - 9, H), 'rgba(255,255,255,0.55)', null);
  poly(R(0, N, 0, 11), '#efe9df', 'rgba(14,34,52,0.35)', 0.8);

  // ============ КАНТ СТЕН (толщина сверху и торцы) ============
  // верхние грани
  poly([wp(-WT, -WT, H), wp(-WT, N, H), wp(0, N, H), wp(0, 0, H), wp(N, 0, H), wp(N, -WT, H)],
    grad(wp(0, 0, H), wp(0, N, H), [[0, '#fbfdfe'], [1, '#e6edf1']]), 'rgba(14,34,52,0.5)', 1.1);
  // торец левой стены (на ближнем конце gy = N)
  poly([wp(-WT, N, H), wp(0, N, H), wp(0, N, 0), wp(-WT, N, 0)], '#c3ced5', 'rgba(14,34,52,0.5)', 1);
  poly([wp(-WT, N, H), wp(0, N, H), wp(0, N, H - 4), wp(-WT, N, H - 4)], 'rgba(255,255,255,0.5)', null);
  // торец правой стены (на ближнем конце gx = N)
  poly([wp(N, 0, H), wp(N, -WT, H), wp(N, -WT, 0), wp(N, 0, 0)], '#a9b8c1', 'rgba(14,34,52,0.5)', 1);
  poly([wp(N, 0, H), wp(N, -WT, H), wp(N, -WT, H - 4), wp(N, 0, H - 4)], 'rgba(255,255,255,0.4)', null);

  // ============ ПОЛ ============
  poly([wp(0, 0), wp(N, 0), wp(N, N), wp(0, N)], '#b8743e', null);
  c.save();
  path([wp(0, 0), wp(N, 0), wp(N, N), wp(0, N)]); c.clip();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tones = ['#c07c46', '#b8723c', '#c98650', '#b06b38', '#c47f49'];
  for (let j = 0; j < N * 2; j++) {
    const y0 = j / 2, y1 = (j + 1) / 2;
    let x = -rnd() * 1.6;
    while (x < N) {
      const len = 1.5 + rnd() * 2.4;
      const xa = Math.max(0, x), xb = Math.min(N, x + len);
      const tone = tones[Math.floor(rnd() * tones.length)];
      poly([wp(xa, y0), wp(xb, y0), wp(xb, y1), wp(xa, y1)], grad(wp(xa, y0), wp(xa, y1), [[0, shade(tone, 0.07)], [1, shade(tone, -0.06)]]), 'rgba(70,30,10,0.38)', 0.7);
      // волокна и блик
      for (let k = 0; k < 3; k++) {
        const yy = y0 + (y1 - y0) * (0.25 + 0.25 * k);
        seg(wp(xa + (xb - xa) * 0.06, yy), wp(xa + (xb - xa) * (0.35 + rnd() * 0.55), yy), 'rgba(80,36,12,0.2)', 0.7);
      }
      seg(wp(xa + 0.05, y0 + 0.04), wp(xb - 0.05, y0 + 0.04), 'rgba(255,225,180,0.28)', 0.8);
      x += len;
    }
  }
  // свет из окна
  const lg = c.createLinearGradient(...wp(0, 5), ...wp(3.8, 6.6));
  lg.addColorStop(0, 'rgba(255,244,205,0.42)'); lg.addColorStop(1, 'rgba(255,244,205,0)');
  poly([wp(0, 4.2), wp(0, 5.9), wp(3.8, 7.0), wp(3.8, 5.3)], lg, null);
  // общий блик на полу
  const sh = c.createRadialGradient(...wp(5.5, 5.5), 4 * S, ...wp(5.5, 5.5), 190 * S);
  sh.addColorStop(0, 'rgba(255,225,170,0.16)'); sh.addColorStop(1, 'rgba(255,225,170,0)');
  c.fillStyle = sh; c.fillRect(0, 0, cv.width, cv.height);
  c.restore();

  // ============ СРЕЗ ПОЛА (толстый светлый кант) ============
  poly([wp(0, N, 0), wp(N, N, 0), wp(N, N, -SLAB), wp(0, N, -SLAB)], grad(wp(0, N, 0), wp(0, N, -SLAB), [[0, '#e3eaee'], [1, '#bcc8cf']]), 'rgba(14,34,52,0.5)', 1.1);
  poly([wp(N, N, 0), wp(N, 0, 0), wp(N, 0, -SLAB), wp(N, N, -SLAB)], grad(wp(N, N, 0), wp(N, N, -SLAB), [[0, '#c2cdd4'], [1, '#97a6b0']]), 'rgba(14,34,52,0.5)', 1.1);
  seg(wp(0, N, -4), wp(N, N, -4), 'rgba(14,34,52,0.18)', 1);
  seg(wp(N, N, -4), wp(N, 0, -4), 'rgba(14,34,52,0.2)', 1);
  seg(wp(0, N, -0.8), wp(N, N, -0.8), 'rgba(255,255,255,0.7)', 1);
  c.beginPath(); c.moveTo(...wp(0, N)); c.lineTo(...wp(N, N)); c.lineTo(...wp(N, 0));
  c.strokeStyle = 'rgba(14,34,52,0.5)'; c.lineWidth = 1.2 * S; c.stroke();
  return cv;
}
