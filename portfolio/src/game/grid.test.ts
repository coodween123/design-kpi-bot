import { describe, expect, it } from 'vitest';
import { NavGrid } from './grid';
import { gridToWorld, worldToGrid } from './iso';

describe('NavGrid', () => {
  it('находит путь в пустой сетке', () => {
    const g = new NavGrid(5, 5);
    const p = g.findPath({ x: 0, y: 0 }, { x: 4, y: 4 })!;
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p[p.length - 1]).toEqual({ x: 4, y: 4 });
  });
  it('обходит препятствия и не режет углы', () => {
    const g = new NavGrid(5, 5);
    for (let y = 0; y < 4; y++) g.setBlocked(2, y);
    const p = g.findPath({ x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(p.some((c) => c.x === 2 && c.y === 4)).toBe(true);
    for (const c of p) expect(g.isWalkable(c.x, c.y)).toBe(true);
  });
  it('возвращает null, если цель замурована', () => {
    const g = new NavGrid(5, 5);
    for (const [x, y] of [[3, 3], [4, 3], [3, 4]]) g.setBlocked(x, y);
    expect(g.findPath({ x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
  });
  it('nearestReachable выбирает ближайшую достижимую клетку', () => {
    const g = new NavGrid(5, 5);
    g.setBlocked(2, 2);
    expect(g.nearestReachable({ x: 0, y: 0 }, 2, 2)).not.toEqual({ x: 2, y: 2 });
  });
});

describe('iso', () => {
  it('проекция обратима', () => {
    const w = gridToWorld(3.5, 7.25);
    const g = worldToGrid(w.x, w.y);
    expect(g.x).toBeCloseTo(3.5);
    expect(g.y).toBeCloseTo(7.25);
  });
});
