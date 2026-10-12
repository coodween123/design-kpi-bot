// Навигационная сетка и поиск пути A* (8 направлений, без срезания углов).
export interface Cell { x: number; y: number }

export class NavGrid {
  private blocked: boolean[];
  constructor(readonly cols: number, readonly rows: number) {
    this.blocked = new Array(cols * rows).fill(false);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  setBlocked(x: number, y: number, v = true): void {
    if (this.inBounds(x, y)) this.blocked[y * this.cols + x] = v;
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.blocked[y * this.cols + x];
  }

  /** Ближайшая проходимая клетка к (x, y) среди достижимых из from. */
  nearestReachable(from: Cell, x: number, y: number): Cell | null {
    const reach = this.reachableSet(from);
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const key of reach) {
      const cx = key % this.cols;
      const cy = Math.floor(key / this.cols);
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    return best;
  }

  private reachableSet(from: Cell): Set<number> {
    const seen = new Set<number>();
    if (!this.isWalkable(from.x, from.y)) return seen;
    const stack = [from.y * this.cols + from.x];
    seen.add(stack[0]);
    while (stack.length) {
      const k = stack.pop()!;
      const cx = k % this.cols;
      const cy = Math.floor(k / this.cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        const nk = ny * this.cols + nx;
        if (this.isWalkable(nx, ny) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    return seen;
  }

  /** Путь включает стартовую и конечную клетки. null — если дойти нельзя. */
  findPath(start: Cell, goal: Cell): Cell[] | null {
    if (!this.isWalkable(start.x, start.y) || !this.isWalkable(goal.x, goal.y)) return null;
    if (start.x === goal.x && start.y === goal.y) return [start];
    const key = (x: number, y: number) => y * this.cols + x;
    const g = new Map<number, number>([[key(start.x, start.y), 0]]);
    const parent = new Map<number, number>();
    const open: { k: number; f: number }[] = [{ k: key(start.x, start.y), f: 0 }];
    const closed = new Set<number>();
    const h = (x: number, y: number) => {
      const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); // октильное расстояние
    };
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (closed.has(cur.k)) continue;
      closed.add(cur.k);
      const cx = cur.k % this.cols;
      const cy = Math.floor(cur.k / this.cols);
      if (cx === goal.x && cy === goal.y) {
        const path: Cell[] = [];
        let k: number | undefined = cur.k;
        while (k !== undefined) {
          path.push({ x: k % this.cols, y: Math.floor(k / this.cols) });
          k = parent.get(k);
        }
        return path.reverse();
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.isWalkable(nx, ny)) continue;
          if (dx && dy && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) continue;
          const nk = key(nx, ny);
          if (closed.has(nk)) continue;
          const ng = g.get(cur.k)! + (dx && dy ? Math.SQRT2 : 1);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            parent.set(nk, cur.k);
            open.push({ k: nk, f: ng + h(nx, ny) });
          }
        }
      }
    }
    return null;
  }
}
