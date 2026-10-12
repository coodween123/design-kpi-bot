import Phaser from 'phaser';
import type { FurnitureDef } from '../../config/room';
import { SETTINGS } from '../../config/settings';
import { Iso } from './iso2d';
import { DRAWERS } from './furniture';
import { drawShell, SHELL_BOUNDS } from './shell';

export interface FurnTex { key: string; originX: number; originY: number }

/** Создаёт текстуру предмета. Начало координат спрайта — верхняя вершина основания предмета. */
export function makeFurnitureTexture(scene: Phaser.Scene, def: FurnitureDef): FurnTex {
  const S = SETTINGS.texScale;
  const pad = 14;
  const wd = def.w + def.d;
  const W = Math.ceil(wd * 32 + pad * 2);
  const Hh = Math.ceil(wd * 16 + def.h + pad * 2);
  const ox = def.d * 32 + pad;
  const oy = def.h + pad;
  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = Hh * S;
  const c = cv.getContext('2d')!;
  const draw = DRAWERS[def.kind];
  if (!draw) throw new Error(`Нет рисовалки для вида предмета «${def.kind}» (config/room.ts → kind)`);
  draw(new Iso(c, S, ox, oy), def);
  const key = `furn/${def.id}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
  return { key, originX: ox / W, originY: oy / Hh };
}

/** Светящийся контур предмета (для подсветки при наведении): силуэт, расширенный на r px, залитый цветом. */
export function makeOutlineTexture(scene: Phaser.Scene, srcKey: string, outKey: string, r = 3): void {
  if (scene.textures.exists(outKey)) return;
  const src = scene.textures.get(srcKey).getSourceImage() as HTMLCanvasElement;
  const S = SETTINGS.texScale;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d')!;
  const rr = r * S;
  for (let a = 0; a < 16; a++) c.drawImage(src, Math.cos((a / 16) * Math.PI * 2) * rr, Math.sin((a / 16) * Math.PI * 2) * rr);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#fff4a8';
  c.fillRect(0, 0, cv.width, cv.height);
  scene.textures.addCanvas(outKey, cv);
}

export function makeShellTexture(scene: Phaser.Scene): string {
  const key = 'shell';
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawShell());
  return key;
}
export { SHELL_BOUNDS };

/** Мелкие служебные текстуры: тень персонажа, подсветка клетки, маркер над предметом. */
export function makeMiscTextures(scene: Phaser.Scene): void {
  const S = SETTINGS.texScale;
  const mk = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const cv = document.createElement('canvas');
    cv.width = w * S; cv.height = h * S;
    const c = cv.getContext('2d')!;
    c.setTransform(S, 0, 0, S, 0, 0);
    draw(c);
    scene.textures.addCanvas(key, cv);
  };
  mk('shadow', 40, 20, (c) => {
    const g = c.createRadialGradient(20, 10, 1, 20, 10, 20);
    g.addColorStop(0, 'rgba(50,25,40,0.38)'); g.addColorStop(1, 'rgba(50,25,40,0)');
    c.fillStyle = g; c.save(); c.scale(1, 0.5); c.beginPath(); c.arc(20, 20, 20, 0, Math.PI * 2); c.fill(); c.restore();
  });
  mk('tile', 64, 32, (c) => {
    c.beginPath(); c.moveTo(32, 1.5); c.lineTo(62.5, 16); c.lineTo(32, 30.5); c.lineTo(1.5, 16); c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.stroke();
  });
}
