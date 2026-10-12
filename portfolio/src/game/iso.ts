// Изометрическая проекция: сетка (gx, gy) <-> экранные (мировые) координаты.
// gx растёт вправо-вниз, gy растёт влево-вниз. Угол комнаты (0,0) — верхняя вершина.
export const TILE_W = 64;
export const TILE_H = 32;
export const ORIGIN_X = 0;
export const ORIGIN_Y = 0;

export interface Pt { x: number; y: number }

export function gridToWorld(gx: number, gy: number): Pt {
  return {
    x: ORIGIN_X + (gx - gy) * (TILE_W / 2),
    y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  };
}

export function worldToGrid(x: number, y: number): Pt {
  const a = (x - ORIGIN_X) / (TILE_W / 2); // gx - gy
  const b = (y - ORIGIN_Y) / (TILE_H / 2); // gx + gy
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Вид персонажа по вектору движения в сетке: front/back + отражение по X. */
export function facingFromDelta(dx: number, dy: number): { back: boolean; flip: boolean } {
  const sx = dx - dy; // экранное смещение по X
  const sy = dx + dy; // экранное смещение по Y
  return { back: sy < 0 || (sy === 0 && false), flip: sx < 0 };
}
