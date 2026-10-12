import Phaser from 'phaser';
import { Appearance, findItem } from '../../config/wardrobe';
import { SETTINGS } from '../../config/settings';
import { hairImage, preloadHair } from './hair';
import { shade } from './iso2d';

// Составной 2D-персонаж: независимые слои, у каждого свои кадры анимации.
// Причёски — векторные ресурсы (hair.ts), остальное рисуется кодом с единым освещением слева-сверху.
// Любой слой можно заменить на спрайт-атлас, сохранив ключи кадров (frameKey).
export type View = 'f' | 'b'; // спереди / сзади (поворот влево-вправо делается отражением)
export type AnimName = 'idle' | 'walk' | 'interact' | 'sit';
export const ANIMS: Record<AnimName, { frames: number; fps: number; loop: boolean }> = {
  idle: { frames: 2, fps: 1.6, loop: true },
  walk: { frames: 6, fps: 11, loop: true },
  interact: { frames: 4, fps: 8, loop: false },
  sit: { frames: 1, fps: 1, loop: true },
};
export const LAYERS = ['hairBack', 'body', 'beard', 'bottom', 'shoes', 'top', 'hairFront', 'accessory'] as const;
export type Layer = (typeof LAYERS)[number];

const TOP = 8;                              // запас над головой для причёсок
export const CHAR_W = 72;
export const CHAR_H = 108 + TOP;
export const CHAR_ORIGIN = { x: 36, y: 100 + TOP }; // точка «стоит на полу»

interface Look { skin: string; hairStyle: string; hairColor: string; brows: string; beard: string; top: { style: string; color: string }; bottom: { style: string; color: string }; shoes: { style: string; color: string }; acc: { style: string; color: string } }

export function resolveLook(a: Appearance): Look {
  const it = (cat: 'top' | 'bottom' | 'shoes' | 'accessory') => {
    const i = findItem(cat, a[cat]);
    return { style: i.style ?? 'none', color: i.color ?? '#888888' };
  };
  return {
    skin: findItem('skin', a.skin).color!,
    hairStyle: findItem('hairStyle', a.hairStyle).style!,
    hairColor: findItem('hairColor', a.hairColor).color!,
    brows: findItem('brows', a.brows).style ?? 'normal',
    beard: findItem('beard', a.beard).style ?? 'none',
    top: it('top'), bottom: it('bottom'), shoes: it('shoes'), acc: it('accessory'),
  };
}

/** Подпись варианта слоя: меняется только когда меняется то, от чего реально зависит слой. */
export function layerSignature(layer: Layer, a: Appearance): string {
  const l = resolveLook(a);
  switch (layer) {
    case 'hairBack': case 'hairFront': return `${layer}|${l.hairStyle}|${l.hairColor}`;
    case 'body': return `body|${l.skin}|${l.brows}|${l.hairColor}`;
    case 'beard': return `beard|${l.beard}|${l.hairColor}|${l.skin}`;
    case 'bottom': return `bottom|${l.bottom.style}|${l.bottom.color}`;
    case 'shoes': return `shoes|${l.shoes.style}|${l.shoes.color}`;
    case 'top': return `top|${l.top.style}|${l.top.color}`;
    case 'accessory': return `accessory|${l.acc.style}|${l.acc.color}`;
  }
}

export function frameKey(sig: string, view: View, anim: AnimName, frame: number): string {
  return `ch/${sig}/${view}/${anim}/${frame}`;
}

// ---------- поза ----------
interface Pose { bob: number; lift: [number, number]; swing: [number, number]; arm: [number, number]; raise: number; sit: boolean }

function poseFor(anim: AnimName, f: number): Pose {
  const base: Pose = { bob: 0, lift: [0, 0], swing: [0, 0], arm: [0, 0], raise: 0, sit: false };
  if (anim === 'idle') return { ...base, bob: f === 0 ? 0 : 0.9, arm: [f ? 0.06 : 0, f ? -0.06 : 0] };
  if (anim === 'walk') {
    const ph = (f / ANIMS.walk.frames) * Math.PI * 2;
    const s = Math.sin(ph);
    return { ...base, bob: Math.abs(Math.cos(ph)) * 1.8, lift: [Math.max(0, s), Math.max(0, -s)], swing: [s, -s], arm: [-s * 0.55, s * 0.55] };
  }
  if (anim === 'interact') return { ...base, raise: [0.4, 1, 0.85, 1][f] ?? 1, bob: f === 1 ? 0.6 : 0 };
  return { ...base, sit: true, bob: 0 };
}

interface Geo { legX: [number, number]; knee: ([number, number] | null)[]; foot: [[number, number], [number, number]]; sh: [[number, number], [number, number]]; hand: [[number, number], [number, number]]; head: [number, number]; bob: number; hipY: number }

function geometry(p: Pose, view: View): Geo {
  const hipY = 68;
  const legX: [number, number] = [30.5, 41.5];
  // сидение: бёдра направлены к зрителю (сильно укорочены), колени согнуты, голени вертикально, ноги чуть врозь; сзади ноги скрыты телом
  const knee = [0, 1].map((i) => (p.sit && view === 'f' ? ([legX[i] + (i ? 1.6 : -1.6), 75.5] as [number, number]) : null));
  const foot = [0, 1].map((i) => {
    if (p.sit) return (view === 'f' ? [legX[i] + (i ? 2.6 : -2.6), 90] : [legX[i] + 1, 88]) as [number, number];
    return [legX[i] + p.swing[i] * 2.2, 91 - p.lift[i] * 4.5] as [number, number];
  }) as Geo['foot'];
  const sh: Geo['sh'] = [[24.5, 48 - p.bob], [47.5, 48 - p.bob]];
  const hand = [0, 1].map((i) => {
    const a = p.arm[i];
    if (p.sit) return [legX[i] + (i ? 4.2 : -4.2), 72.5 - p.bob * 0.3] as [number, number]; // руки лежат на коленях
    let hx = sh[i][0] + (i ? 3.5 : -3.5) + Math.sin(a) * 3;
    let hy = sh[i][1] + 20 * Math.cos(a) - Math.sin(a) * 2;
    if (i === 1 && p.raise > 0) {
      hx = hx + 8 * p.raise + Math.sin(p.raise * 9) * 2;
      hy = sh[i][1] + 20 - 34 * p.raise;
    }
    return [hx, hy] as [number, number];
  }) as Geo['hand'];
  return { legX, knee, foot, sh, hand, head: [36, 26 - p.bob], bob: p.bob, hipY };
}

// ---------- примитивы рисования ----------
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Единое освещение: слева светлее, справа темнее. */
function lg(c: CanvasRenderingContext2D, color: string): CanvasGradient {
  const g = c.createLinearGradient(14, 0, 58, 0);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.24));
  return g;
}

function fillStroke(c: CanvasRenderingContext2D, color: string, lw = 1.3): void {
  c.fillStyle = lg(c, color); c.fill();
  c.strokeStyle = rgba(shade(color, -0.66), 0.78); c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}

function capsule(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, color: string): void {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.strokeStyle = rgba(shade(color, -0.66), 0.78); c.lineWidth = r * 2 + 2.4; c.stroke();
  c.strokeStyle = lg(c, color); c.lineWidth = r * 2; c.stroke();
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y); c.lineTo(x + w - rr, y); c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr); c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function line(c: CanvasRenderingContext2D, pts: [number, number][], color: string, lw = 1, a = 0.5): void {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = rgba(color, a); c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}

/** Точки ноги (бедро, колено, щиколотка), обрезанные до длины len — для шорт и т. п. */
function legChain(g: Geo, i: number, len = Infinity): [number, number][] {
  const full: [number, number][] = [[g.legX[i], g.hipY - 1]];
  if (g.knee[i]) full.push(g.knee[i]!);
  full.push([g.foot[i][0], g.foot[i][1] - 4]);
  const out: [number, number][] = [full[0]];
  let left = len;
  for (let k = 1; k < full.length; k++) {
    const [ax, ay] = full[k - 1], [bx, by] = full[k];
    const d = Math.hypot(bx - ax, by - ay);
    if (d >= left) { const t = left / d; out.push([ax + (bx - ax) * t, ay + (by - ay) * t]); return out; }
    out.push(full[k]); left -= d;
  }
  return out;
}

function chainCapsule(c: CanvasRenderingContext2D, pts: [number, number][], r: number, color: string): void {
  for (let k = 1; k < pts.length; k++) capsule(c, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], r, color);
}

// ---------- слои ----------
function drawBody(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const skin = look.skin;
  const dark = shade(skin, -0.32);
  for (let i = 0; i < 2; i++) chainCapsule(c, legChain(g, i), 4.6, skin);
  for (let i = 0; i < 2; i++) {
    capsule(c, g.sh[i][0], g.sh[i][1], g.hand[i][0], g.hand[i][1], 3.8, skin);
    ell(c, g.hand[i][0], g.hand[i][1] + 1.2, 4.3, 4.5); fillStroke(c, skin);
  }
  const [hx, hy] = g.head;
  // шея и тень под подбородком
  rrect(c, 31.5, hy + 10, 9, 12, 3.5); fillStroke(c, shade(skin, -0.06));
  ell(c, hx, hy + 14.5, 9, 4); c.fillStyle = rgba(dark, 0.35); c.fill();
  // уши
  for (const dx of [-15, 15]) { ell(c, hx + dx, hy + 2.4, 3.3, 4.4); fillStroke(c, shade(skin, -0.03), 1.1); ell(c, hx + dx * 0.97, hy + 2.6, 1.2, 2, 0); c.fillStyle = rgba(dark, 0.35); c.fill(); }
  ell(c, hx, hy, 15, 14.5); fillStroke(c, skin);
  if (view === 'f') {
    for (const dx of [-6, 6]) {
      const ex = hx + dx, ey = hy + 3.4;
      ell(c, ex, ey, 3.3, 3.9); c.fillStyle = '#ffffff'; c.fill();
      ell(c, ex + dx * 0.04, ey + 0.5, 2.6, 3.1); c.fillStyle = '#6a4030'; c.fill();
      ell(c, ex + dx * 0.04, ey + 0.7, 1.45, 1.8); c.fillStyle = '#1c1220'; c.fill();
      ell(c, ex + 1, ey - 1, 1, 1.1); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.ellipse(ex, ey, 3.5, 4.1, 0, Math.PI * 1.08, Math.PI * 1.92);
      c.strokeStyle = '#2a1a22'; c.lineWidth = 1.5; c.lineCap = 'round'; c.stroke();
      line(c, [[ex + (dx > 0 ? 3.2 : -3.2), ey - 1.6], [ex + (dx > 0 ? 4.6 : -4.6), ey - 2.6]], '#2a1a22', 1.1, 0.9);
      // бровь
      c.beginPath();
      if (look.brows === 'thick') { c.moveTo(ex - 4.2, hy - 1.6); c.quadraticCurveTo(ex, hy - 3.9, ex + 4.2, hy - 2.0); }
      else { c.moveTo(ex - 3.6, hy - 2.4); c.quadraticCurveTo(ex, hy - 4.6, ex + 3.6, hy - 2.6); }
      c.strokeStyle = rgba(shade(look.hairColor, look.brows === 'thick' ? -0.05 : -0.1), 0.92); c.lineWidth = look.brows === 'thick' ? 1.9 : 1.4; c.lineCap = 'round'; c.stroke();
    }
    // нос и рот
    c.beginPath(); c.moveTo(hx - 1, hy + 8.6); c.quadraticCurveTo(hx, hy + 9.8, hx + 1.2, hy + 8.8);
    c.strokeStyle = rgba(dark, 0.7); c.lineWidth = 1; c.stroke();
    drawMouth(c, hx, hy);
  }
}

function drawMouth(c: CanvasRenderingContext2D, hx: number, hy: number): void {
  c.beginPath(); c.moveTo(hx - 3.2, hy + 11.7); c.quadraticCurveTo(hx, hy + 14.4, hx + 3.2, hy + 11.7);
  c.strokeStyle = '#9a4a52'; c.lineWidth = 1.4; c.lineCap = 'round'; c.stroke();
  line(c, [[hx - 1.2, hy + 13.1], [hx + 1.2, hy + 13.1]], '#ffffff', 0.8, 0.5);
}

/** Борода и щетина: рисуются поверх лица (вид спереди), рот перерисовывается сверху. */
function drawBeard(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  if (look.beard === 'none' || view === 'b') return;
  const [hx, hy] = g.head;
  const k = look.hairColor;
  const x = (v: number) => hx - 36 + v, y = (v: number) => hy - 26 + v;
  const path = () => {
    c.beginPath();
    c.moveTo(x(21.9), y(28.5));
    c.bezierCurveTo(x(21.8), y(34.5), x(24.6), y(39.2), x(30), y(40.8));
    c.bezierCurveTo(x(33.5), y(41.7), x(38.5), y(41.7), x(42), y(40.8));
    c.bezierCurveTo(x(47.4), y(39.2), x(50.2), y(34.5), x(50.1), y(28.5));
    c.lineTo(x(48.5), y(29.5));
    c.bezierCurveTo(x(48.6), y(33.5), x(46.8), y(36.2), x(43.5), y(36.2));
    c.bezierCurveTo(x(41), y(36), x(39), y(34.4), x(36), y(34.4));
    c.bezierCurveTo(x(33), y(34.4), x(31), y(36), x(28.5), y(36.2));
    c.bezierCurveTo(x(25.2), y(36.2), x(23.4), y(33.5), x(23.5), y(29.5));
    c.closePath();
  };
  c.save();
  path(); c.clip();
  if (look.beard === 'stubble') {
    // ухоженная щетина: ровная мягкая тень, плотнее у подбородка, лёгкая мелкая фактура
    const sg = c.createLinearGradient(0, y(30), 0, y(41.6));
    sg.addColorStop(0, rgba(shade(k, 0.3), 0.3));
    sg.addColorStop(0.55, rgba(shade(k, 0.22), 0.44));
    sg.addColorStop(1, rgba(shade(k, 0.12), 0.58));
    c.fillStyle = sg; c.fillRect(0, 0, CHAR_W, CHAR_H);
    let seed = 91;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = rgba(shade(k, 0.1), 0.1 + rnd() * 0.1);
      c.beginPath(); c.arc(x(22 + rnd() * 28), y(30 + rnd() * 11), 0.2 + rnd() * 0.12, 0, Math.PI * 2); c.fill();
    }
  } else {
    c.fillStyle = lg(c, k); c.fillRect(0, 0, CHAR_W, CHAR_H);
    for (let i = 0; i < 9; i++) line(c, [[x(24 + i * 3.1), y(33)], [x(25 + i * 3 + (i - 4) * 0.4), y(41.4)]], shade(k, 0.4), 0.8, 0.35);
  }
  c.restore();
  if (look.beard === 'full') { path(); c.strokeStyle = rgba(shade(k, -0.6), 0.75); c.lineWidth = 1.1; c.lineJoin = 'round'; c.stroke(); }
  drawMouth(c, hx, hy);
}

function drawBottom(c: CanvasRenderingContext2D, g: Geo, look: Look): void {
  const { style, color } = look.bottom;
  const edge = shade(color, -0.4);
  if (style === 'skirt') {
    c.beginPath(); c.moveTo(23.5, g.hipY - 7); c.lineTo(48.5, g.hipY - 7); c.lineTo(54, g.hipY + 13); c.quadraticCurveTo(36, g.hipY + 17, 18, g.hipY + 13); c.closePath(); fillStroke(c, color);
    for (const x of [26, 31, 36, 41, 46]) line(c, [[x, g.hipY - 3], [x + (x - 36) * 0.45, g.hipY + 14]], edge, 0.9, 0.45);
    rrect(c, 23.5, g.hipY - 8, 25, 4.5, 2); fillStroke(c, shade(color, -0.14), 1.1);
    return;
  }
  const lenTo = style === 'shorts' ? 13 : Infinity;
  for (let i = 0; i < 2; i++) {
    const pts = legChain(g, i, lenTo);
    chainCapsule(c, pts, style === 'shorts' ? 6 : 5.6, color);
    if (style === 'pants' && pts.length > 1) {
      const e = pts[pts.length - 1];
      line(c, [[g.legX[i] + (i ? 4.4 : -4.4), g.hipY + 4], [e[0] + (i ? 4.2 : -4.2), e[1] - 2]], shade(color, 0.5), 0.9, 0.55);
    }
  }
  rrect(c, 23.5, g.hipY - 9, 25, 12, 4.5); fillStroke(c, color);
  rrect(c, 23.5, g.hipY - 9, 25, 4.2, 2); c.fillStyle = rgba(shade(color, -0.3), 0.55); c.fill();
  line(c, [[36, g.hipY - 5], [36, g.hipY + 2]], edge, 1, 0.55);
  ell(c, 36, g.hipY - 7, 1.7, 1.5); c.fillStyle = '#e9c46a'; c.fill();
}

function drawShoes(c: CanvasRenderingContext2D, g: Geo, look: Look): void {
  const { style, color } = look.shoes;
  for (let i = 0; i < 2; i++) {
    const [fx, fy] = g.foot[i];
    if (style === 'boots') {
      capsule(c, fx, fy - 14, fx, fy - 4, 5.8, color);
      rrect(c, fx - 6.2, fy - 15.4, 12.4, 3.4, 1.6); fillStroke(c, shade(color, 0.16), 1.1);
    }
    ell(c, fx, fy - 1.6, 7.6, 5); fillStroke(c, color);
    c.beginPath(); c.ellipse(fx, fy + 0.9, 7.4, 2.4, 0, 0, Math.PI);
    c.strokeStyle = style === 'boots' ? shade(color, -0.45) : '#f5f1f8'; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.ellipse(fx, fy + 1.6, 7.4, 2.2, 0, 0, Math.PI);
    c.strokeStyle = 'rgba(40,24,40,0.4)'; c.lineWidth = 0.9; c.stroke();
    if (style === 'sneakers') {
      ell(c, fx, fy - 4.2, 3.6, 1.8); c.fillStyle = rgba(shade(color, -0.2), 0.7); c.fill();
      for (const k of [-1.6, 0.4, 2.4]) line(c, [[fx - 2.2, fy - 4.6 + k * 0.1], [fx + 2.2, fy - 4.6 + k * 0.1 + 0.001]], '#ffffff', 0.9, 0.9);
    }
  }
}

/** Рисунок вертикальной полоски для рубашки. */
function stripes(c: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 24;
  const k = cv.getContext('2d')!;
  k.fillStyle = color; k.fillRect(0, 0, 24, 24);
  k.fillStyle = 'rgba(255,255,255,0.78)'; k.fillRect(7, 0, 3, 24);
  k.fillStyle = 'rgba(255,255,255,0.45)'; k.fillRect(17, 0, 1.6, 24);
  const pat = c.createPattern(cv, 'repeat');
  if (!pat) return color;
  pat.setTransform(new DOMMatrix().scale(0.3));
  return pat;
}

function drawShirt(c: CanvasRenderingContext2D, g: Geo, color: string, view: View): void {
  const b = g.bob;
  const st = stripes(c, color);
  const edge = rgba(shade(color, -0.66), 0.78);
  const light = () => { const gr = c.createLinearGradient(14, 0, 58, 0); gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,40,0.26)'); return gr; };
  const sleeve = (i: number) => {
    const [sx, sy] = g.sh[i]; const [hx, hy] = g.hand[i];
    const ex = sx + (hx - sx) * 0.62, ey = sy + (hy - sy) * 0.62;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.strokeStyle = edge; c.lineWidth = 5.6 * 2 + 2.4; c.stroke();
    c.strokeStyle = st; c.lineWidth = 5.6 * 2; c.stroke();
    c.strokeStyle = light(); c.stroke();
  };
  sleeve(0); sleeve(1);
  const panel = (pts: [number, number][]) => {
    c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
    c.fillStyle = st; c.fill(); c.fillStyle = light(); c.fill();
    c.strokeStyle = edge; c.lineWidth = 1.3; c.lineJoin = 'round'; c.stroke();
  };
  if (view === 'b') {
    rrect(c, 23, 44 - b, 26, 29 + b, 7.5); c.fillStyle = st; c.fill(); c.fillStyle = light(); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.3; c.stroke();
    rrect(c, 27, 41.5 - b, 18, 5, 2.5); c.fillStyle = shade(color, -0.12); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.1; c.stroke();
    return;
  }
  // белая футболка в просвете рубашки
  rrect(c, 28, 44 - b, 16, 28 + b, 5); fillStroke(c, '#f6f6f8', 1.2);
  c.beginPath(); c.ellipse(36, 44 - b, 6.6, 4, 0, 0, Math.PI); c.strokeStyle = 'rgba(70,70,90,0.55)'; c.lineWidth = 1.3; c.stroke();
  // полы рубашки
  panel([[23.6, 47 - b], [24.5, 44 - b], [31.6, 44 - b], [30.4, 73], [23.6, 73]]);
  panel([[48.4, 47 - b], [47.5, 44 - b], [40.4, 44 - b], [41.6, 73], [48.4, 73]]);
  // воротник
  const collar = (m: number) => { c.beginPath(); c.moveTo(36 + m * 5.4, 42.6 - b); c.lineTo(36 + m * 10.2, 44.4 - b); c.lineTo(36 + m * 4.4, 53.6 - b); c.lineTo(36 + m * 2.6, 46.4 - b); c.closePath(); c.fillStyle = shade(color, 0.12); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.2; c.lineJoin = 'round'; c.stroke(); };
  collar(-1); collar(1);
  // пуговицы и карман
  for (const yy of [57, 64]) { ell(c, 40.9, yy, 0.9, 0.9); c.fillStyle = '#f3f6ff'; c.fill(); }
  rrect(c, 25.4, 58 - b * 0.3, 4.4, 5, 0.8); c.strokeStyle = edge; c.lineWidth = 0.9; c.stroke();
}

function drawTop(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const { style, color } = look.top;
  if (style === 'shirt') { drawShirt(c, g, color, view); return; }
  const b = g.bob;
  const dark = shade(color, -0.3);
  const long = style !== 'tee';
  if (style === 'hoodie' && view === 'b') { ell(c, 36, 47 - b, 13.5, 8.5); fillStroke(c, shade(color, -0.12)); }
  for (let i = 0; i < 2; i++) {
    const [sx, sy] = g.sh[i]; const [hx, hy] = g.hand[i];
    const k = long ? 0.86 : 0.42;
    const ex = sx + (hx - sx) * k, ey = sy + (hy - sy) * k;
    capsule(c, sx, sy, ex, ey, 5.3, color);
    if (long) { ell(c, ex, ey, 4.9, 2.7, Math.atan2(hy - sy, hx - sx) + Math.PI / 2); fillStroke(c, shade(color, -0.16), 1.1); }
    else line(c, [[ex - 4, ey + 0.4], [ex + 4, ey + 0.4]], dark, 1, 0.5);
  }
  const bottomY = style === 'tee' ? 69 : 72;
  rrect(c, 23, 44 - b, 26, bottomY - 44 + b, 7.5); fillStroke(c, color);
  // складки и свет
  line(c, [[27, 56 - b], [31, 62 - b * 0.5]], dark, 1, 0.3);
  line(c, [[45, 55 - b], [41.5, 63 - b * 0.5]], dark, 1, 0.3);
  rrect(c, 23, bottomY - 3.6, 26, 3.6, 1.8); c.fillStyle = rgba(dark, 0.45); c.fill();
  if (style === 'hoodie') {
    if (view === 'f') {
      c.beginPath(); c.ellipse(36, 45 - b, 11.5, 5, 0, 0, Math.PI); fillStroke(c, shade(color, -0.1), 1.2);
      ell(c, 36, 45 - b, 11.5, 2.6); c.fillStyle = rgba(shade(color, -0.45), 0.6); c.fill();
      rrect(c, 28, 59 - b, 16, 9, 3.5); fillStroke(c, shade(color, -0.07), 1.1);
      for (const dx of [-3, 3]) { line(c, [[36 + dx, 47 - b], [36 + dx * 1.2, 55 - b]], '#f6f1e8', 1.4, 0.95); ell(c, 36 + dx * 1.2, 55.8 - b, 0.9, 1.2); c.fillStyle = '#f6f1e8'; c.fill(); }
    }
  } else if (style === 'jacket') {
    line(c, [[36, 46 - b], [36, bottomY - 1]], '#20152a', 1.2, 0.7);
    if (view === 'f') {
      c.beginPath(); c.moveTo(29, 43 - b); c.lineTo(36, 53 - b); c.lineTo(43, 43 - b); c.lineTo(40, 43 - b); c.lineTo(36, 48 - b); c.lineTo(32, 43 - b); c.closePath(); fillStroke(c, shade(color, -0.22), 1.1);
      rrect(c, 26.5, 61 - b, 7, 1.8, 0.8); c.fillStyle = rgba(dark, 0.7); c.fill();
      rrect(c, 38.5, 61 - b, 7, 1.8, 0.8); c.fillStyle = rgba(dark, 0.7); c.fill();
      ell(c, 36, 53.6 - b, 1.2, 1.5); c.fillStyle = '#e9c46a'; c.fill();
    } else { rrect(c, 27, 42 - b, 18, 5, 2.5); fillStroke(c, shade(color, -0.22), 1.1); }
  } else if (view === 'f') {
    c.beginPath(); c.ellipse(36, 44 - b, 6.6, 3.9, 0, 0, Math.PI);
    c.strokeStyle = rgba(shade(color, -0.55), 0.8); c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.ellipse(36, 44.8 - b, 5.6, 3, 0, 0.1, Math.PI - 0.1);
    c.strokeStyle = rgba(shade(color, 0.4), 0.55); c.lineWidth = 0.9; c.stroke();
  }
}

function drawHairBack(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  if (view === 'b') return;
  const img = hairImage(look.hairStyle, look.hairColor, 'behind');
  if (img) c.drawImage(img, 0, -TOP - g.bob, CHAR_W, CHAR_H);
}

function drawHairFront(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  if (look.hairStyle === 'bald') {
    const [bx, by] = g.head;
    ell(c, bx - 4.5, by - 9, 6.6, 3.2, -0.3); c.fillStyle = 'rgba(255,255,255,0.26)'; c.fill();
    return;
  }
  const img = hairImage(look.hairStyle, look.hairColor, view === 'f' ? 'over' : 'back');
  if (img) c.drawImage(img, 0, -TOP - g.bob, CHAR_W, CHAR_H);
}

function drawAccessory(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const { style, color } = look.acc;
  const [hx, hy] = g.head; const b = g.bob;
  if (style === 'glasses') {
    if (view === 'f') {
      for (const dx of [-6.2, 6.2]) { rrect(c, hx + dx - 5, hy - 0.6, 10, 8.2, 3.2); c.fillStyle = 'rgba(190,230,255,0.22)'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke(); line(c, [[hx + dx - 3, hy + 1.4], [hx + dx - 1, hy + 0.4]], '#ffffff', 0.9, 0.8); }
      line(c, [[hx - 1.2, hy + 2.4], [hx + 1.2, hy + 2.4]], color, 1.3, 1);
      line(c, [[hx - 11.2, hy + 2.4], [hx - 15, hy + 1.6]], color, 1.2, 1); line(c, [[hx + 11.2, hy + 2.4], [hx + 15, hy + 1.6]], color, 1.2, 1);
    } else line(c, [[hx - 15, hy + 2], [hx - 11, hy + 2.6], [hx + 11, hy + 2.6], [hx + 15, hy + 2]], color, 1.6, 1);
  } else if (style === 'cap') {
    c.beginPath(); c.ellipse(hx, hy - 5.4, 16, 11.4, 0, Math.PI, Math.PI * 2); c.closePath(); fillStroke(c, color);
    if (view === 'f') {
      c.beginPath(); c.ellipse(hx, hy - 5.2, 17.4, 4.6, 0, 0, Math.PI); c.closePath(); fillStroke(c, shade(color, -0.2));
      line(c, [[hx - 12, hy - 8], [hx - 6, hy - 14]], '#ffffff', 1.3, 0.5);
    } else { rrect(c, hx - 16, hy - 6.4, 32, 3.4, 1.6); fillStroke(c, shade(color, -0.2), 1.1); rrect(c, hx - 5, hy - 4.6, 10, 3, 1.4); fillStroke(c, shade(color, -0.12), 1); }
    ell(c, hx, hy - 16.6, 2, 2); c.fillStyle = shade(color, -0.3); c.fill();
  } else if (style === 'headphones') {
    c.beginPath(); c.arc(hx, hy + 1.2, 16.4, Math.PI * 1.03, Math.PI * 1.97);
    c.strokeStyle = rgba(shade(color, -0.6), 0.85); c.lineWidth = 5.4; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = lg(c, '#4a4458'); c.lineWidth = 3.2; c.stroke();
    for (const dx of [-19.4, 12.4]) {
      rrect(c, hx + dx, hy - 5.6, 7, 15, 3.4); fillStroke(c, '#e9506a', 1.2);
      rrect(c, hx + dx + 1.2, hy - 3, 4.6, 10, 2.2); c.fillStyle = rgba(shade('#e9506a', 0.45), 0.6); c.fill();
    }
  } else if (style === 'chain') {
    if (view === 'f') {
      c.beginPath(); c.moveTo(30.2, 41.4 - b); c.quadraticCurveTo(36, 56 - b, 41.8, 41.4 - b);
      c.setLineDash([1.7, 0.9]); c.lineCap = 'butt';
      c.strokeStyle = 'rgba(40,50,70,0.75)'; c.lineWidth = 2.1; c.stroke();
      c.strokeStyle = '#e9eef6'; c.lineWidth = 1.3; c.stroke();
      c.setLineDash([]); c.lineCap = 'round';
    } else {
      c.beginPath(); c.moveTo(30.4, 42.6 - b); c.quadraticCurveTo(36, 45 - b, 41.6, 42.6 - b);
      c.strokeStyle = '#e9eef6'; c.lineWidth = 1.2; c.stroke();
    }
  } else if (style === 'scarf') {
    rrect(c, 24.6, 40 - b, 22.8, 10, 5); fillStroke(c, color);
    line(c, [[28, 43 - b], [44, 46 - b]], shade(color, -0.4), 1, 0.45);
    if (view === 'f') {
      c.beginPath(); c.moveTo(34, 47 - b); c.lineTo(43, 47 - b); c.lineTo(45.4, 62 - b); c.lineTo(36.2, 64 - b); c.closePath(); fillStroke(c, shade(color, -0.1));
      for (const y of [53, 58]) line(c, [[35.4, y - b], [44.4, y + 0.6 - b]], '#ffffff', 1.3, 0.55);
    }
  }
}

const DRAW: Record<Layer, (c: CanvasRenderingContext2D, g: Geo, look: Look, view: View) => void> = {
  hairBack: drawHairBack, body: drawBody, beard: drawBeard, bottom: (c, g, l) => drawBottom(c, g, l), shoes: (c, g, l) => drawShoes(c, g, l),
  top: drawTop, hairFront: drawHairFront, accessory: drawAccessory,
};

export function renderLayerFrame(layer: Layer, look: Look, view: View, anim: AnimName, frame: number, S = SETTINGS.texScale): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * S; cv.height = CHAR_H * S;
  const c = cv.getContext('2d')!;
  c.setTransform(S, 0, 0, S, 0, TOP * S);
  DRAW[layer](c, geometry(poseFor(anim, frame), view), look, view);
  return cv;
}

/** Рисует персонажа целиком (превью). Причёска должна быть подготовлена через preloadHair / ensureCharacterTextures. */
export function renderCharacterPreview(a: Appearance, view: View = 'f', anim: AnimName = 'idle', frame = 0, S = 3): HTMLCanvasElement {
  const look = resolveLook(a);
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * S; cv.height = CHAR_H * S;
  const c = cv.getContext('2d')!;
  for (const layer of LAYERS) c.drawImage(renderLayerFrame(layer, look, view, anim, frame, S), 0, 0);
  return cv;
}

/** Вырезка области персонажа (в координатах холста CHAR_W x CHAR_H) — для миниатюр в гардеробе. */
export function renderCharacterCrop(a: Appearance, x: number, y: number, w: number, h: number, S = 3): HTMLCanvasElement {
  const full = renderCharacterPreview(a, 'f', 'idle', 0, S);
  const cv = document.createElement('canvas');
  cv.width = w * S; cv.height = h * S;
  cv.getContext('2d')!.drawImage(full, x * S, y * S, w * S, h * S, 0, 0, w * S, h * S);
  return cv;
}

export const preloadAppearance = (a: Appearance): Promise<void> => {
  const l = resolveLook(a);
  return preloadHair(l.hairStyle, l.hairColor);
};

// ---------- кэш текстур Phaser ----------
const created = new Map<string, string[]>(); // signature -> ключи текстур

export async function ensureCharacterTextures(scene: Phaser.Scene, a: Appearance): Promise<void> {
  await preloadAppearance(a);
  const look = resolveLook(a);
  for (const layer of LAYERS) {
    const sig = layerSignature(layer, a);
    if (created.has(sig)) continue;
    const keys: string[] = [];
    for (const view of ['f', 'b'] as View[]) {
      for (const anim of Object.keys(ANIMS) as AnimName[]) {
        for (let f = 0; f < ANIMS[anim].frames; f++) {
          const key = frameKey(sig, view, anim, f);
          if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderLayerFrame(layer, look, view, anim, f));
          keys.push(key);
        }
      }
    }
    created.set(sig, keys);
  }
}

/** Удаляет текстуры вариантов, которые больше не нужны, чтобы не копить память. */
export function releaseUnusedCharacterTextures(scene: Phaser.Scene, keep: Appearance[]): void {
  const keepSigs = new Set<string>();
  for (const a of keep) for (const l of LAYERS) keepSigs.add(layerSignature(l, a));
  for (const [sig, keys] of [...created]) {
    if (keepSigs.has(sig)) continue;
    keys.forEach((k) => { if (scene.textures.exists(k)) scene.textures.remove(k); });
    created.delete(sig);
  }
}
