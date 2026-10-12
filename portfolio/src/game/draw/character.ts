import Phaser from 'phaser';
import { Appearance, findItem } from '../../config/wardrobe';
import { SETTINGS } from '../../config/settings';
import { shade } from './iso2d';

// Составной 2D-персонаж: независимые слои, у каждого свои кадры анимации.
// Слои рисуются процедурно; позже любой слой можно заменить на спрайт-атлас,
// сохранив ключи кадров (frameKey) — остальной код не изменится.
export type View = 'f' | 'b'; // спереди / сзади (поворот влево-вправо делается отражением)
export type AnimName = 'idle' | 'walk' | 'interact' | 'sit';
export const ANIMS: Record<AnimName, { frames: number; fps: number; loop: boolean }> = {
  idle: { frames: 2, fps: 1.6, loop: true },
  walk: { frames: 6, fps: 11, loop: true },
  interact: { frames: 4, fps: 8, loop: false },
  sit: { frames: 1, fps: 1, loop: true },
};
export const LAYERS = ['hairBack', 'body', 'bottom', 'shoes', 'top', 'hairFront', 'accessory'] as const;
export type Layer = (typeof LAYERS)[number];

export const CHAR_W = 72;
export const CHAR_H = 108;
export const CHAR_ORIGIN = { x: 36, y: 100 }; // точка «стоит на полу»

interface Look { skin: string; hairStyle: string; hairColor: string; top: { style: string; color: string }; bottom: { style: string; color: string }; shoes: { style: string; color: string }; acc: { style: string; color: string } }

export function resolveLook(a: Appearance): Look {
  const it = (cat: 'top' | 'bottom' | 'shoes' | 'accessory') => {
    const i = findItem(cat, a[cat]);
    return { style: i.style ?? 'none', color: i.color ?? '#888888' };
  };
  return {
    skin: findItem('skin', a.skin).color!,
    hairStyle: findItem('hairStyle', a.hairStyle).style!,
    hairColor: findItem('hairColor', a.hairColor).color!,
    top: it('top'), bottom: it('bottom'), shoes: it('shoes'), acc: it('accessory'),
  };
}

/** Подпись варианта слоя: меняется только когда меняется то, от чего реально зависит слой. */
export function layerSignature(layer: Layer, a: Appearance): string {
  const l = resolveLook(a);
  switch (layer) {
    case 'hairBack': case 'hairFront': return `${layer}|${l.hairStyle}|${l.hairColor}`;
    case 'body': return `body|${l.skin}`;
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

// ---------- рисование ----------
const INK = 'rgba(52,30,44,0.62)';

function fillStroke(c: CanvasRenderingContext2D, fill: string, lw = 1.4): void {
  c.fillStyle = fill; c.fill();
  c.strokeStyle = INK; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}

function capsule(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, fill: string): void {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.strokeStyle = INK; c.lineWidth = r * 2 + 2.6; c.stroke();
  c.strokeStyle = fill; c.lineWidth = r * 2; c.stroke();
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

function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

interface Geo { legX: [number, number]; foot: [[number, number], [number, number]]; sh: [[number, number], [number, number]]; hand: [[number, number], [number, number]]; head: [number, number]; bob: number; hipY: number }

function geometry(p: Pose): Geo {
  const hipY = 68;
  const legX: [number, number] = [30, 42];
  const foot = [0, 1].map((i) => {
    const fy = p.sit ? 85 : 91 - p.lift[i] * 4.5;
    return [legX[i] + p.swing[i] * 2.2, fy] as [number, number];
  }) as Geo['foot'];
  const sh: Geo['sh'] = [[25.5, 47 - p.bob], [46.5, 47 - p.bob]];
  const hand = [0, 1].map((i) => {
    const a = p.arm[i];
    let hx = sh[i][0] + (i ? 3.5 : -3.5) + Math.sin(a) * 3;
    let hy = sh[i][1] + 19 * Math.cos(a) - Math.sin(a) * 2;
    if (i === 1 && p.raise > 0) {
      hx = hx + 8 * p.raise + Math.sin(p.raise * 9) * 2;
      hy = sh[i][1] + 19 - 33 * p.raise;
    }
    return [hx, hy] as [number, number];
  }) as Geo['hand'];
  return { legX, foot, sh, hand, head: [36, 27 - p.bob], bob: p.bob, hipY };
}

function drawBody(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const skin = look.skin;
  for (let i = 0; i < 2; i++) capsule(c, g.legX[i], g.hipY, g.foot[i][0], g.foot[i][1] - 4, 4.3, skin);
  for (let i = 0; i < 2; i++) {
    capsule(c, g.sh[i][0], g.sh[i][1], g.hand[i][0], g.hand[i][1], 3.6, skin);
    ell(c, g.hand[i][0], g.hand[i][1] + 1, 4, 4.2); fillStroke(c, skin);
  }
  rrect(c, 32, 37 - g.bob, 8, 9, 3); fillStroke(c, shade(skin, -0.08));
  const [hx, hy] = g.head;
  ell(c, hx - 14, hy + 2, 3, 4); fillStroke(c, shade(skin, -0.04));
  ell(c, hx + 14, hy + 2, 3, 4); fillStroke(c, shade(skin, -0.04));
  ell(c, hx, hy, 14, 13); fillStroke(c, skin);
  if (view === 'f') {
    for (const dx of [-6, 6]) {
      ell(c, hx + dx, hy + 2, 2.3, 3.1); c.fillStyle = '#2d2030'; c.fill();
      ell(c, hx + dx + 0.8, hy + 0.8, 0.95, 1.1); c.fillStyle = '#ffffff'; c.fill();
      ell(c, hx + dx * 1.45, hy + 7, 3, 1.8); c.fillStyle = 'rgba(255,110,120,0.32)'; c.fill();
    }
    c.beginPath(); c.moveTo(hx - 2.6, hy + 7.4); c.quadraticCurveTo(hx, hy + 10, hx + 2.6, hy + 7.4);
    c.strokeStyle = 'rgba(120,50,60,0.85)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.stroke();
  }
}

function drawBottom(c: CanvasRenderingContext2D, g: Geo, look: Look): void {
  const { style, color } = look.bottom;
  if (style === 'skirt') {
    c.beginPath(); c.moveTo(24, g.hipY - 6); c.lineTo(48, g.hipY - 6); c.lineTo(53, g.hipY + 12); c.lineTo(19, g.hipY + 12); c.closePath(); fillStroke(c, color);
    c.beginPath(); c.moveTo(22, g.hipY + 8); c.lineTo(50, g.hipY + 8); c.strokeStyle = shade(color, -0.2); c.lineWidth = 1.2; c.stroke();
    return;
  }
  const lenTo = style === 'shorts' ? 11 : 99;
  for (let i = 0; i < 2; i++) {
    const [fx, fy] = g.foot[i];
    const ty = Math.min(fy - 6, g.hipY + lenTo);
    const t = (ty - g.hipY) / Math.max(1, fy - 4 - g.hipY);
    capsule(c, g.legX[i], g.hipY - 1, g.legX[i] + (fx - g.legX[i]) * t, ty, style === 'shorts' ? 5.7 : 5.2, color);
  }
  rrect(c, 24, g.hipY - 8, 24, 11, 4); fillStroke(c, color);
  c.beginPath(); c.moveTo(24.5, g.hipY - 5); c.lineTo(47.5, g.hipY - 5); c.strokeStyle = shade(color, -0.22); c.lineWidth = 1.3; c.stroke();
}

function drawShoes(c: CanvasRenderingContext2D, g: Geo, look: Look): void {
  const { style, color } = look.shoes;
  for (let i = 0; i < 2; i++) {
    const [fx, fy] = g.foot[i];
    if (style === 'boots') { capsule(c, fx, fy - 12, fx, fy - 3, 5.4, color); }
    ell(c, fx, fy - 1.5, 7.2, 4.8); fillStroke(c, color);
    c.beginPath(); c.ellipse(fx, fy + 0.8, 7, 2.2, 0, 0, Math.PI); c.strokeStyle = style === 'boots' ? shade(color, -0.35) : '#e9e4ee'; c.lineWidth = 2.2; c.stroke();
    if (style === 'sneakers') { ell(c, fx, fy - 3.2, 3.2, 1.7); c.fillStyle = shade(color, -0.14); c.fill(); }
  }
}

function drawTop(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const { style, color } = look.top;
  const b = g.bob;
  const dark = shade(color, -0.2);
  const long = style !== 'tee';
  for (let i = 0; i < 2; i++) {
    const [sx, sy] = g.sh[i]; const [hx, hy] = g.hand[i];
    const k = long ? 0.84 : 0.42;
    const ex = sx + (hx - sx) * k, ey = sy + (hy - sy) * k;
    capsule(c, sx, sy, ex, ey, 5.1, color);
    if (style === 'jacket') { ell(c, ex, ey, 4.6, 2.6); fillStroke(c, dark, 1.2); }
  }
  if (style === 'hoodie' && view === 'b') { ell(c, 36, 47 - b, 13, 8); fillStroke(c, dark); }
  const bottomY = style === 'tee' ? 68 : 71;
  rrect(c, 24, 43 - b, 24, bottomY - 43 + b * 0, 7); fillStroke(c, color);
  c.beginPath(); c.moveTo(25, 43 - b + 4); c.quadraticCurveTo(36, 43 - b + 1, 47, 43 - b + 4); c.strokeStyle = shade(color, 0.28); c.lineWidth = 1.6; c.stroke();
  if (style === 'hoodie') {
    if (view === 'f') {
      ell(c, 36, 44 - b, 11, 4.8); fillStroke(c, dark);
      rrect(c, 29, 58 - b, 14, 8, 3); fillStroke(c, shade(color, -0.1), 1.1);
      for (const dx of [-3, 3]) { c.beginPath(); c.moveTo(36 + dx, 46 - b); c.lineTo(36 + dx, 54 - b); c.strokeStyle = '#f4efe6'; c.lineWidth = 1.2; c.stroke(); }
    }
  } else if (style === 'jacket') {
    c.beginPath(); c.moveTo(36, 44 - b); c.lineTo(36, bottomY); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    rrect(c, 24, bottomY - 4, 24, 5, 2); fillStroke(c, dark, 1.1);
    if (view === 'f') {
      c.beginPath(); c.moveTo(30, 43 - b); c.lineTo(36, 51 - b); c.lineTo(42, 43 - b); c.closePath(); fillStroke(c, dark, 1.1);
    }
  } else if (view === 'f') {
    c.beginPath(); c.moveTo(31, 43 - b); c.quadraticCurveTo(36, 49 - b, 41, 43 - b); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
  }
}

function hairPath(c: CanvasRenderingContext2D, hx: number, hy: number, style: string): void {
  // чёлка (вид спереди): внешняя дуга и волнистая линия лба
  const dy = hy - 27;
  c.beginPath();
  if (style === 'spiky') {
    const pts: [number, number][] = [[21.5, 31], [18.5, 17], [25, 20], [25.5, 7], [31, 15], [36, 3], [41, 15], [46.5, 7], [47, 20], [53.5, 17], [50.5, 31], [47.5, 25], [43, 22], [36, 25], [29, 22], [24.5, 25]];
    pts.forEach(([x, y], i) => (i ? c.lineTo(x + hx - 36, y + dy) : c.moveTo(x + hx - 36, y + dy)));
    c.closePath();
    return;
  }
  c.moveTo(21.5 + hx - 36, 31 + dy);
  c.bezierCurveTo(19 + hx - 36, 6 + dy, 53 + hx - 36, 6 + dy, 50.5 + hx - 36, 31 + dy);
  c.lineTo(47.5 + hx - 36, 25 + dy);
  c.bezierCurveTo(44 + hx - 36, 19 + dy, 40 + hx - 36, 25 + dy, 36 + hx - 36, 20 + dy);
  c.bezierCurveTo(32 + hx - 36, 25 + dy, 28 + hx - 36, 19 + dy, 24.5 + hx - 36, 25 + dy);
  c.closePath();
}

function drawHairBack(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  if (view === 'b') return;
  const [hx, hy] = g.head; const col = look.hairColor;
  if (look.hairStyle === 'bob') { rrect(c, hx - 16.5, hy - 10, 33, 31, 13); fillStroke(c, shade(col, -0.1)); }
  else if (look.hairStyle === 'long') { rrect(c, hx - 17, hy - 11, 34, 48, 14); fillStroke(c, shade(col, -0.1)); }
  else if (look.hairStyle === 'bun') { ell(c, hx, hy - 15, 7.5, 7); fillStroke(c, col); }
}

function drawHairFront(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const [hx, hy] = g.head; const col = look.hairColor; const st = look.hairStyle;
  if (view === 'f') {
    hairPath(c, hx, hy, st); fillStroke(c, col);
    if (st === 'bob') { rrect(c, hx - 15.5, hy - 1, 5, 18, 2.5); fillStroke(c, col); rrect(c, hx + 10.5, hy - 1, 5, 18, 2.5); fillStroke(c, col); }
    if (st === 'long') { rrect(c, hx - 15.5, hy - 1, 5.5, 27, 2.5); fillStroke(c, col); rrect(c, hx + 10, hy - 1, 5.5, 27, 2.5); fillStroke(c, col); }
    c.beginPath(); c.moveTo(hx - 9, hy - 9); c.quadraticCurveTo(hx - 2, hy - 13, hx + 6, hy - 11);
    c.strokeStyle = shade(col, 0.32); c.lineWidth = 1.7; c.lineCap = 'round'; c.stroke();
    return;
  }
  // вид сзади: волосы закрывают всю голову
  ell(c, hx, hy + 0.5, 14.9, 13.8); fillStroke(c, col);
  if (st === 'bob') { rrect(c, hx - 16, hy - 4, 32, 24, 11); fillStroke(c, col); }
  if (st === 'long') { rrect(c, hx - 16.5, hy - 4, 33, 41, 12); fillStroke(c, col); }
  if (st === 'bun') { ell(c, hx, hy - 15, 7.5, 7); fillStroke(c, col); }
  if (st === 'spiky') { hairPath(c, hx, hy, 'spiky'); fillStroke(c, col); }
  c.beginPath(); c.moveTo(hx - 7, hy - 8); c.quadraticCurveTo(hx, hy - 12, hx + 7, hy - 8);
  c.strokeStyle = shade(col, 0.3); c.lineWidth = 1.7; c.lineCap = 'round'; c.stroke();
}

function drawAccessory(c: CanvasRenderingContext2D, g: Geo, look: Look, view: View): void {
  const { style, color } = look.acc;
  const [hx, hy] = g.head; const b = g.bob;
  if (style === 'glasses') {
    if (view === 'f') {
      for (const dx of [-6, 6]) { ell(c, hx + dx, hy + 2, 5.4, 4.8); c.fillStyle = 'rgba(190,230,255,0.35)'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.7; c.stroke(); }
      c.beginPath(); c.moveTo(hx - 1, hy + 1.5); c.lineTo(hx + 1, hy + 1.5); c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
    } else {
      c.beginPath(); c.moveTo(hx - 14, hy + 1); c.lineTo(hx - 11, hy + 1); c.moveTo(hx + 11, hy + 1); c.lineTo(hx + 14, hy + 1); c.strokeStyle = color; c.lineWidth = 1.7; c.stroke();
    }
  } else if (style === 'cap') {
    c.beginPath(); c.ellipse(hx, hy - 4, 15.2, 11, 0, Math.PI, Math.PI * 2); c.closePath(); fillStroke(c, color);
    if (view === 'f') { c.beginPath(); c.ellipse(hx, hy - 3.5, 16.5, 5.2, 0, 0, Math.PI); c.closePath(); fillStroke(c, shade(color, -0.18)); }
    else { rrect(c, hx - 15.2, hy - 5, 30.4, 3.2, 1.5); fillStroke(c, shade(color, -0.18), 1.1); }
    ell(c, hx, hy - 15, 1.8, 1.8); c.fillStyle = shade(color, -0.25); c.fill();
  } else if (style === 'headphones') {
    c.beginPath(); c.arc(hx, hy + 1, 15.4, Math.PI * 1.02, Math.PI * 1.98); c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = color; c.lineWidth = 3; c.stroke();
    for (const dx of [-17, 11]) { rrect(c, hx + dx, hy - 5, 6, 14, 3); fillStroke(c, color); rrect(c, hx + dx + 1, hy - 3, 4, 10, 2); c.fillStyle = shade(color, 0.3); c.fill(); }
  } else if (style === 'scarf') {
    rrect(c, 25, 38 - b, 22, 9, 4.5); fillStroke(c, color);
    if (view === 'f') { c.beginPath(); c.moveTo(35, 45 - b); c.lineTo(43, 45 - b); c.lineTo(45, 59 - b); c.lineTo(37, 61 - b); c.closePath(); fillStroke(c, shade(color, -0.12)); }
  }
}

const DRAW: Record<Layer, (c: CanvasRenderingContext2D, g: Geo, look: Look, view: View) => void> = {
  hairBack: drawHairBack, body: drawBody, bottom: (c, g, l) => drawBottom(c, g, l), shoes: (c, g, l) => drawShoes(c, g, l),
  top: drawTop, hairFront: drawHairFront, accessory: drawAccessory,
};

export function renderLayerFrame(layer: Layer, look: Look, view: View, anim: AnimName, frame: number, S = SETTINGS.texScale): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * S; cv.height = CHAR_H * S;
  const c = cv.getContext('2d')!;
  c.setTransform(S, 0, 0, S, 0, 0);
  DRAW[layer](c, geometry(poseFor(anim, frame)), look, view);
  return cv;
}

/** Рисует персонажа целиком (для превью в гардеробе). */
export function renderCharacterPreview(a: Appearance, view: View = 'f', anim: AnimName = 'idle', frame = 0, S = 3): HTMLCanvasElement {
  const look = resolveLook(a);
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * S; cv.height = CHAR_H * S;
  const c = cv.getContext('2d')!;
  for (const layer of LAYERS) c.drawImage(renderLayerFrame(layer, look, view, anim, frame, S), 0, 0);
  return cv;
}

// ---------- кэш текстур Phaser ----------
const created = new Map<string, string[]>(); // signature -> ключи текстур

export function ensureCharacterTextures(scene: Phaser.Scene, a: Appearance): void {
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
