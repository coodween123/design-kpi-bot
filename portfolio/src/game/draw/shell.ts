import { ROOM_SIZE, WALL_HEIGHT } from '../../config/room';
import { SETTINGS } from '../../config/settings';
import { gridToWorld } from '../iso';
import { shade } from './iso2d';

// Оболочка комнаты: пол (доски), две стены, плинтусы, срез пола. Один статичный спрайт.
const N = ROOM_SIZE;
const H = WALL_HEIGHT;
const SLAB = 16;
export const SHELL_BOUNDS = {
  x0: -N * 32 - 16, y0: -H - 16,
  x1: N * 32 + 16, y1: N * 32 + SLAB + 10,
};

export function drawShell(S = SETTINGS.texScale): HTMLCanvasElement {
  const b = SHELL_BOUNDS;
  const cv = document.createElement('canvas');
  cv.width = (b.x1 - b.x0) * S; cv.height = (b.y1 - b.y0) * S;
  const c = cv.getContext('2d')!;
  const wp = (gx: number, gy: number, z = 0): [number, number] => {
    const w = gridToWorld(gx, gy);
    return [(w.x - b.x0) * S, (w.y - z - b.y0) * S];
  };
  const poly = (pts: [number, number][], fill: string | CanvasGradient, stroke: string | null = 'rgba(48,28,40,0.35)', lw = 1.2) => {
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw * S; c.lineJoin = 'round'; c.stroke(); }
  };

  // --- стены ---
  const wallL = c.createLinearGradient(...wp(0, 0, H), ...wp(0, N, 0));
  wallL.addColorStop(0, '#bfe6dc'); wallL.addColorStop(1, '#9fd2c6');
  const wallR = c.createLinearGradient(...wp(0, 0, H), ...wp(N, 0, 0));
  wallR.addColorStop(0, '#a9dacd'); wallR.addColorStop(1, '#86c2b5');
  poly([wp(0, 0, 0), wp(0, N, 0), wp(0, N, H), wp(0, 0, H)], wallL);
  poly([wp(0, 0, 0), wp(N, 0, 0), wp(N, 0, H), wp(0, 0, H)], wallR);
  // фризовая панель и вертикальный декор
  for (let i = 0.5; i < N; i += 1) {
    poly([wp(0, i, 12), wp(0, i + 0.5, 12), wp(0, i + 0.5, 46), wp(0, i, 46)], 'rgba(255,255,255,0.07)', null);
    poly([wp(i, 0, 12), wp(i + 0.5, 0, 12), wp(i + 0.5, 0, 46), wp(i, 0, 46)], 'rgba(255,255,255,0.07)', null);
  }
  poly([wp(0, 0, 46), wp(0, N, 46), wp(0, N, 50), wp(0, 0, 50)], 'rgba(255,255,255,0.45)', null);
  poly([wp(0, 0, 46), wp(N, 0, 46), wp(N, 0, 50), wp(0, 0, 50)], 'rgba(255,255,255,0.45)', null);
  // плинтусы
  poly([wp(0, 0, 0), wp(0, N, 0), wp(0, N, 12), wp(0, 0, 12)], '#fbf3e4');
  poly([wp(0, 0, 0), wp(N, 0, 0), wp(N, 0, 12), wp(0, 0, 12)], shade('#fbf3e4', -0.05));
  // верхний кант стен
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(...wp(0, N, H)); c.lineTo(...wp(0, 0, H)); c.lineTo(...wp(N, 0, H));
  c.strokeStyle = 'rgba(48,28,40,0.4)'; c.lineWidth = 9 * S; c.stroke();
  c.strokeStyle = '#fbf3e4'; c.lineWidth = 6 * S; c.stroke();
  // --- пол ---
  poly([wp(0, 0), wp(N, 0), wp(N, N), wp(0, N)], '#e3bd8e', null);
  c.save();
  c.beginPath(); [wp(0, 0), wp(N, 0), wp(N, N), wp(0, N)].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tones = ['#e6c295', '#dfb788', '#e9c79c', '#dcb283'];
  for (let j = 0; j < N * 2; j++) {
    const y0 = j / 2, y1 = (j + 1) / 2;
    let x = -rnd() * 1.5;
    while (x < N) {
      const len = 1.6 + rnd() * 2.2;
      const x1 = Math.min(N, x + len);
      poly([wp(Math.max(0, x), y0), wp(x1, y0), wp(x1, y1), wp(Math.max(0, x), y1)], tones[Math.floor(rnd() * tones.length)], 'rgba(120,70,40,0.22)', 0.8);
      x += len;
    }
  }
  // тёплый свет из окна
  const lg = c.createLinearGradient(...wp(0, 5), ...wp(3.4, 6));
  lg.addColorStop(0, 'rgba(255,248,214,0.38)'); lg.addColorStop(1, 'rgba(255,248,214,0)');
  poly([wp(0, 4.2), wp(0, 5.9), wp(3.4, 6.9), wp(3.4, 5.2)], lg, null);
  c.restore();
  // срез пола
  poly([wp(0, N, 0), wp(N, N, 0), wp(N, N, -SLAB), wp(0, N, -SLAB)], '#b98757');
  poly([wp(N, N, 0), wp(N, 0, 0), wp(N, 0, -SLAB), wp(N, N, -SLAB)], '#9b6c44');
  c.beginPath(); c.moveTo(...wp(0, N, 0)); c.lineTo(...wp(N, N, 0)); c.lineTo(...wp(N, 0, 0));
  c.strokeStyle = 'rgba(48,28,40,0.4)'; c.lineWidth = 1.4 * S; c.stroke();
  return cv;
}
