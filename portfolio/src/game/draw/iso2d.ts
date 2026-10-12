import { TILE_H, TILE_W } from '../iso';

export type Pt2 = [number, number];

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  r = Math.round(r + (t - r) * k);
  g = Math.round(g + (t - g) * k);
  b = Math.round(b + (t - b) * k);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export interface BoxPal { top: string; left: string; right: string }

/** Палитра коробки из одного базового цвета (свет сверху-слева). */
export function pal(base: string): BoxPal {
  return { top: shade(base, 0.22), left: shade(base, -0.06), right: shade(base, -0.24) };
}

export const OUTLINE = 'rgba(48,28,40,0.38)';

/**
 * Изометрический «холст» с координатами предмета: (u, v) — клетки от верхней вершины основания, z — высота в px.
 * Все размеры в логических px, умножаются на S (масштаб текстуры).
 */
export class Iso {
  constructor(readonly c: CanvasRenderingContext2D, readonly S: number, readonly ox: number, readonly oy: number) {}

  p(u: number, v: number, z = 0): Pt2 {
    return [(this.ox + (u - v) * (TILE_W / 2)) * this.S, (this.oy + (u + v) * (TILE_H / 2) - z) * this.S];
  }

  poly(pts: Pt2[], fill: string | CanvasGradient, stroke: string | null = OUTLINE, lw = 1): void {
    const c = this.c;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw * this.S;
      c.lineJoin = 'round';
      c.stroke();
    }
  }

  /** Коробка: видны верх, грань +y (слева на экране) и грань +x (справа на экране). С градиентами и бликом на рёбрах. */
  box(u0: number, v0: number, z0: number, du: number, dv: number, dz: number, pl: BoxPal, stroke: string | null = OUTLINE): void {
    const u1 = u0 + du, v1 = v0 + dv, z1 = z0 + dz;
    const grad = (a: Pt2, b: Pt2, c0: string, c1: string): CanvasGradient => this.lineGrad(a, b, [[0, c0], [1, c1]]);
    this.poly([this.p(u0, v1, z0), this.p(u1, v1, z0), this.p(u1, v1, z1), this.p(u0, v1, z1)],
      grad(this.p(u0, v1, z1), this.p(u0, v1, z0), shade(pl.left, 0.1), shade(pl.left, -0.16)), stroke);
    this.poly([this.p(u1, v0, z0), this.p(u1, v1, z0), this.p(u1, v1, z1), this.p(u1, v0, z1)],
      grad(this.p(u1, v1, z1), this.p(u1, v1, z0), shade(pl.right, 0.08), shade(pl.right, -0.18)), stroke);
    this.poly([this.p(u0, v0, z1), this.p(u1, v0, z1), this.p(u1, v1, z1), this.p(u0, v1, z1)],
      grad(this.p(u0, v0, z1), this.p(u1, v1, z1), shade(pl.top, 0.1), shade(pl.top, -0.07)), stroke);
    if (dz > 2 && du > 0.12 && dv > 0.12) {
      this.edge(this.p(u0, v1, z1), this.p(u1, v1, z1), 0.5);
      this.edge(this.p(u1, v1, z1), this.p(u1, v0, z1), 0.28);
    }
  }

  /** Тонкий светлый блик вдоль ребра. */
  edge(a: Pt2, b: Pt2, alpha = 0.4, color = '255,255,255'): void {
    const c = this.c;
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    c.strokeStyle = `rgba(${color},${alpha})`; c.lineWidth = 1.1 * this.S; c.lineCap = 'round'; c.stroke();
  }

  /** Линии древесных волокон на верхней грани (вдоль оси u). */
  grain(u0: number, v0: number, du: number, dv: number, z: number, color = '120,70,30', n = 5, alpha = 0.16): void {
    for (let i = 1; i <= n; i++) {
      const v = v0 + (dv * i) / (n + 1);
      this.edge(this.p(u0 + du * 0.04, v, z), this.p(u0 + du * (0.55 + 0.4 * ((i * 37) % 10) / 10), v, z), alpha, color);
    }
  }

  /** Прямоугольник на плоскости v = const (грань, обращённая к +y). */
  faceV(v: number, u0: number, u1: number, z0: number, z1: number, fill: string | CanvasGradient, stroke: string | null = null): void {
    this.poly([this.p(u0, v, z0), this.p(u1, v, z0), this.p(u1, v, z1), this.p(u0, v, z1)], fill, stroke);
  }

  /** Прямоугольник на плоскости u = const (грань, обращённая к +x). */
  faceU(u: number, v0: number, v1: number, z0: number, z1: number, fill: string | CanvasGradient, stroke: string | null = null): void {
    this.poly([this.p(u, v0, z0), this.p(u, v1, z0), this.p(u, v1, z1), this.p(u, v0, z1)], fill, stroke);
  }

  /** Тени под мебелью отключены по решению заказчика (тень оставлена только у персонажа). Метод оставлен, чтобы не менять рисовалки. */
  shadow(_u0: number, _v0: number, _du: number, _dv: number, _a = 0.16): void { /* без теней */ }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string | null = null, rot = 0): void {
    const c = this.c, S = this.S;
    c.beginPath();
    c.ellipse(cx, cy, rx * S, ry * S, rot, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = S; c.stroke(); }
  }

  lineGrad(a: Pt2, b: Pt2, stops: [number, string][]): CanvasGradient {
    const g = this.c.createLinearGradient(a[0], a[1], b[0], b[1]);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }
}
