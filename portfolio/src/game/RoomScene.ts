import Phaser from 'phaser';
import { FURNITURE, FurnitureDef, PLAYER_START, ROOM_SIZE } from '../config/room';
import { SETTINGS } from '../config/settings';
import { Appearance } from '../config/wardrobe';
import type { Bus } from '../bus';
import { NavGrid, Cell } from './grid';
import { gridToWorld, worldToGrid } from './iso';
import { makeFurnitureTexture, makeMiscTextures, makeOutlineTexture, makeShellTexture, SHELL_BOUNDS } from './draw/textures';
import { ensureCharacterTextures } from './draw/character';
import { Player } from './Player';

interface Obj {
  def: FurnitureDef;
  sprite: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  outline?: Phaser.GameObjects.Image;
  depth: number;
}

export interface SceneInit { bus: Bus; appearance: Appearance }

/** Единственная сцена: комната, мебель, персонаж, ввод. Вся логика предметов — по данным из config/room.ts. */
export class RoomScene extends Phaser.Scene {
  private bus!: Bus;
  private appearance!: Appearance;
  private nav!: NavGrid;
  private player!: Player;
  private objs = new Map<string, Obj>();
  private tile!: Phaser.GameObjects.Image;
  private uiOpen = false;
  private token = 0;                 // каждый новый приказ делает прежние недействительными
  private hoverId: string | null = null;
  private selectedId: string | null = null;
  private inset = { left: 0, right: 0, top: 0, bottom: 0 };
  private cam = { zoom: 1, cx: 0, cy: 90 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastStatus = '';

  constructor() { super('room'); }

  init(data: SceneInit): void { this.bus = data.bus; this.appearance = data.appearance; }

  create(): void {
    this.buildWorld().then(() => this.bus.emit('ready', undefined)).catch((e: unknown) => {
      console.error(e);
      this.bus.emit('fail', e instanceof Error ? e.message : String(e));
    });
  }

  // ---------- построение мира (по шагам, чтобы показывать прогресс) ----------
  private async buildWorld(): Promise<void> {
    const tasks: (() => void | Promise<void>)[] = [];
    const texs = new Map<string, ReturnType<typeof makeFurnitureTexture>>();
    tasks.push(() => { makeShellTexture(this); makeMiscTextures(this); });
    for (const def of FURNITURE) tasks.push(() => { texs.set(def.id, makeFurnitureTexture(this, def)); });
    tasks.push(() => ensureCharacterTextures(this, this.appearance));
    for (let i = 0; i < tasks.length; i++) {
      await tasks[i]();
      this.bus.emit('progress', (i + 1) / (tasks.length + 1));
      await new Promise((r) => setTimeout(r, 0));
    }

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    const shell = this.add.image(SHELL_BOUNDS.x0, SHELL_BOUNDS.y0, 'shell').setOrigin(0, 0).setScale(1 / SETTINGS.texScale).setDepth(-1000);
    void shell;

    this.nav = new NavGrid(ROOM_SIZE, ROOM_SIZE);
    const byId = new Map(FURNITURE.map((f) => [f.id, f]));
    const depthOf = (f: FurnitureDef): number => {
      if (f.wall) return -500;
      if (f.on) return depthOf(byId.get(f.on)!) + 0.1;
      if (f.blocks === false && !f.interactive && f.kind === 'rug') return -100;
      return f.gx + f.w + f.gy + f.d + f.gy * 0.001 + f.gx * 0.0001;
    };

    for (const def of FURNITURE) {
      if (def.blocks !== false) this.blockFootprint(def);
      const tex = texs.get(def.id)!;
      const w = gridToWorld(def.gx, def.gy);
      const sprite = this.add.image(w.x, w.y - (def.z ?? 0), tex.key).setOrigin(tex.originX, tex.originY).setScale(1 / SETTINGS.texScale);
      const depth = depthOf(def);
      sprite.setDepth(depth);
      const obj: Obj = { def, sprite, depth };
      if (def.interactive?.enabled) {
        // мелкие плоские предметы (папка на столе) трудно поймать по пикселям — даём прямоугольную область
        if (def.h <= 20) sprite.setInteractive({ useHandCursor: true });
        else sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 40, useHandCursor: true });
        // подсветка при наведении: светящийся контур позади предмета + лёгкое осветление поверх
        makeOutlineTexture(this, tex.key, `${tex.key}/o`);
        obj.outline = this.add.image(sprite.x, sprite.y, `${tex.key}/o`).setOrigin(tex.originX, tex.originY).setScale(1 / SETTINGS.texScale)
          .setAlpha(0).setDepth(depth - 0.01);
        obj.glow = this.add.image(sprite.x, sprite.y, tex.key).setOrigin(tex.originX, tex.originY).setScale(1 / SETTINGS.texScale)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(depth + 0.02);
        sprite.on('pointerover', () => this.setHover(def.id));
        sprite.on('pointerout', () => this.setHover(null, def.id));
      }
      this.objs.set(def.id, obj);
    }

    this.tile = this.add.image(0, 0, 'tile').setScale(1 / SETTINGS.texScale).setDepth(-50).setVisible(false);
    this.player = new Player(this, this.nav, PLAYER_START, this.appearance);
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E,ENTER,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.scale.on('resize', () => this.fit(false));
    this.bus.on('uiOpen', (open) => { this.uiOpen = open; if (open) this.setHover(null); });
    this.bus.on('inset', (i) => { this.inset = i; this.fit(true); });
    this.bus.on('preview', (a) => { this.appearance = a; void this.player.setAppearance(a).then(() => this.player.trimTextures([])); });
    this.fit(false);
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 500 });
    this.introPulse();
  }

  private blockFootprint(def: FurnitureDef): void {
    const x0 = Math.floor(def.gx + 1e-6), y0 = Math.floor(def.gy + 1e-6);
    const x1 = Math.ceil(def.gx + def.w - 1e-6), y1 = Math.ceil(def.gy + def.d - 1e-6);
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) this.nav.setBlocked(x, y);
  }

  // ---------- камера ----------
  private fit(animate: boolean): void {
    const cam = this.cameras.main;
    const dpr = this.scale.width / (this.scale.canvas.getBoundingClientRect().width || this.scale.width);
    const vw = Math.max(80, (this.scale.width / dpr) - this.inset.left - this.inset.right);
    const vh = Math.max(80, (this.scale.height / dpr) - this.inset.top - this.inset.bottom);
    const room = { w: 700, h: 540, cx: 0, cy: 96 };
    const fitZoom = Math.min(vw / room.w, vh / room.h, SETTINGS.maxZoom);
    // на узком вертикальном экране комната целиком получается мелкой: приближаем и следуем за персонажем
    const portrait = vw / vh < 0.8;
    const closeZoom = Math.min(vh / 330, vw / 440, SETTINGS.maxZoom);
    this.follow = portrait && closeZoom > fitZoom * 1.15;
    const css = this.follow ? closeZoom : fitZoom;
    const shiftX = (this.inset.left - this.inset.right) / 2 / css;
    const shiftY = (this.inset.top - this.inset.bottom) / 2 / css;
    this.viewCss = { w: vw, h: vh, zoom: css, shiftX, shiftY };
    const c = this.follow ? this.followCenter() : { x: room.cx - shiftX, y: room.cy - shiftY };
    const target = { zoom: css * dpr, cx: c.x, cy: c.y };
    this.tweens.killTweensOf(this.cam);
    if (!animate) { this.cam = target; cam.setZoom(target.zoom); cam.centerOn(target.cx, target.cy); return; }
    this.tweens.add({
      targets: this.cam, ...target, duration: 320, ease: 'Sine.easeInOut',
      onUpdate: () => { cam.setZoom(this.cam.zoom); cam.centerOn(this.cam.cx, this.cam.cy); },
    });
  }

  private follow = false;
  private viewCss = { w: 1, h: 1, zoom: 1, shiftX: 0, shiftY: 0 };

  /** Центр камеры при следовании: на персонаже, но не за краями комнаты. */
  private followCenter(): { x: number; y: number } {
    const v = this.viewCss;
    const p = gridToWorld(this.player.gx, this.player.gy);
    const halfW = v.w / 2 / v.zoom, halfH = v.h / 2 / v.zoom;
    const clamp = (val: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Phaser.Math.Clamp(val, lo, hi));
    return {
      x: clamp(p.x, SHELL_BOUNDS.x0 + halfW - v.shiftX, SHELL_BOUNDS.x1 - halfW - v.shiftX) - v.shiftX,
      y: clamp(p.y - 30, SHELL_BOUNDS.y0 + halfH - v.shiftY, SHELL_BOUNDS.y1 - halfH - v.shiftY) - v.shiftY,
    };
  }

  /** Экранные CSS-координаты (относительно холста) для мировой точки. */
  private toScreen(wx: number, wy: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const r = this.scale.canvas.getBoundingClientRect();
    const k = r.width / this.scale.width;
    return { x: (wx - cam.worldView.x) * cam.zoom * k, y: (wy - cam.worldView.y) * cam.zoom * k };
  }

  // ---------- ввод ----------
  private cellAt(pointer: Phaser.Input.Pointer): Cell | null {
    const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const g = worldToGrid(p.x, p.y);
    const c = { x: Math.floor(g.x), y: Math.floor(g.y) };
    return this.nav.inBounds(c.x, c.y) ? c : null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.uiOpen || !this.player) return;
    const c = this.cellAt(pointer);
    const over = this.hoverId !== null;
    if (c && !over && this.nav.isWalkable(c.x, c.y)) {
      const w = gridToWorld(c.x + 0.5, c.y + 0.5);
      this.tile.setPosition(w.x, w.y).setVisible(true);
    } else this.tile.setVisible(false);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.uiOpen) return;
    const hit = over.find((o) => [...this.objs.values()].some((ob) => ob.sprite === o));
    if (hit) {
      const obj = [...this.objs.values()].find((ob) => ob.sprite === hit)!;
      this.goInteract(obj.def.id);
      return;
    }
    const c = this.cellAt(pointer);
    if (!c) return;
    this.goToCell(c);
  }

  private setHover(id: string | null, leaving?: string): void {
    if (id === null && leaving && this.hoverId !== leaving) return;
    this.hoverId = id;
    for (const o of this.objs.values()) this.setLit(o, o.def.id === id || o.def.id === this.selectedId);
    if (id) this.tile.setVisible(false);
    const o = id ? this.objs.get(id) : null;
    if (o) {
      const d = o.def;
      const c = gridToWorld(d.gx + d.w / 2, d.gy + d.d / 2);
      const s = this.toScreen(c.x, c.y - (d.z ?? 0) - (d.markerZ ?? d.h) - 40);
      this.bus.emit('hover', { label: o.def.interactive!.hint, x: s.x, y: s.y });
    } else this.bus.emit('hover', { label: null, x: 0, y: 0 });
  }

  private setLit(o: Obj, on: boolean): void {
    if (!o.outline) return;
    this.tweens.killTweensOf([o.outline, o.glow]);
    this.tweens.add({ targets: o.outline, alpha: on ? 0.55 : 0, duration: 180 });
    this.tweens.add({ targets: o.glow, alpha: on ? 0.06 : 0, duration: 180 });
  }

  /** Один раз при старте коротко подсвечивает все интерактивные предметы — чтобы было видно, на что можно нажать. */
  private introPulse(): void {
    let i = 0;
    for (const o of this.objs.values()) {
      if (!o.outline) continue;
      this.tweens.add({ targets: o.outline, alpha: 0.5, duration: 320, yoyo: true, hold: 200, delay: 700 + i++ * 140, ease: 'Sine.easeInOut' });
    }
  }

  private select(id: string | null): void {
    this.selectedId = id;
    for (const o of this.objs.values()) this.setLit(o, o.def.id === id || o.def.id === this.hoverId);
    const o = id ? this.objs.get(id) : null;
    this.bus.emit('selected', o ? { id: o.def.id, label: o.def.interactive!.hint } : null);
  }

  // ---------- команды движения ----------
  private goToCell(target: Cell, then?: () => void): boolean {
    const token = ++this.token;
    this.select(null);
    const from = this.player.cell;
    let dest = target;
    if (!this.nav.isWalkable(dest.x, dest.y)) {
      const near = this.nav.nearestReachable(from, dest.x, dest.y);
      if (!near) { this.bus.emit('toast', 'Туда не пройти'); return false; }
      dest = near;
    }
    const start = this.nav.isWalkable(from.x, from.y) ? from : (this.nav.nearestReachable({ x: 5, y: 5 }, from.x, from.y) ?? from);
    const path = this.nav.findPath(start, dest);
    if (!path) { this.bus.emit('toast', 'Туда не пройти'); return false; }
    this.player.walk(path, () => { if (token === this.token) then?.(); });
    return true;
  }

  private goInteract(id: string): void {
    const obj = this.objs.get(id);
    const it = obj?.def.interactive;
    if (!obj || !it || !it.enabled) return;
    const token = this.token + 1;
    const cell = it.approach.find((c) => this.nav.isWalkable(c.x, c.y));
    if (!cell) { this.bus.emit('toast', 'Сюда не подойти'); return; }
    const ok = this.goToCell(cell, () => this.arrive(id, token));
    if (!ok) return;
    this.select(id);
  }

  private arrive(id: string, token: number): void {
    if (token !== this.token) return;
    const obj = this.objs.get(id)!;
    const it = obj.def.interactive!;
    this.player.faceVector(it.face[0], it.face[1]);
    if (it.action.type === 'special' && it.action.special === 'sit') {
      this.select(null);
      this.sitOn(obj);
      return;
    }
    this.player.playOnce('interact', () => {
      if (token !== this.token) return;
      this.select(null);
      this.bus.emit('action', { objectId: id, label: it.hint, action: it.action });
    });
  }

  private sitOn(obj: Obj): void {
    const d = obj.def;
    const seat = { x: d.gx + d.w * 0.62, y: d.gy + d.d / 2 };
    // позиция сиденья: ближайшая к клетке подхода часть дивана
    const c = this.player.cell;
    seat.y = Phaser.Math.Clamp(c.y + 0.5, d.gy + 0.5, d.gy + d.d - 0.5);
    this.player.sitAt(seat.x, seat.y, [1, 0], obj.depth + 0.5);
  }

  // ---------- цикл ----------
  update(_t: number, delta: number): void {
    if (!this.player) return;
    const dt = Math.min(delta, 50) / 1000;
    this.player.update(dt);
    if (!this.player.isSitting) this.player.depthOverride = this.playerDepth();
    this.handleKeys();
    if (this.follow && !this.tweens.isTweening(this.cam)) {
      const t = this.followCenter();
      this.cam.cx += (t.x - this.cam.cx) * Math.min(1, dt * 5);
      this.cam.cy += (t.y - this.cam.cy) * Math.min(1, dt * 5);
      this.cameras.main.centerOn(this.cam.cx, this.cam.cy);
    }
    const status = this.player.isSitting ? 'sitting' : this.player.isMoving ? 'walking' : this.player.animName === 'interact' ? 'acting' : 'idle';
    if (status !== this.lastStatus) { this.lastStatus = status; this.bus.emit('status', status as 'idle'); }
  }

  /**
   * Порядок отрисовки персонажа относительно мебели по положению на плоскости пола:
   * впереди предмета, если он правее или ниже его прямоугольника; позади, если левее или выше.
   */
  private playerDepth(): number {
    const fx = this.player.gx, fy = this.player.gy;
    let low = -Infinity, high = Infinity;
    for (const o of this.objs.values()) {
      const d = o.def;
      if (d.wall || d.blocks === false) continue;
      const x0 = d.gx, y0 = d.gy, x1 = d.gx + d.w, y1 = d.gy + d.d;
      const front = fx >= x1 || fy >= y1;
      const behind = fx <= x0 || fy <= y0;
      if (front && !behind) low = Math.max(low, o.depth);
      else if (behind && !front) high = Math.min(high, o.depth);
    }
    const base = fx + fy + 0.9;
    if (low === -Infinity && high === Infinity) return base;
    if (low === -Infinity) return Math.min(base, high - 0.01);
    if (high === Infinity) return Math.max(base, low + 0.01);
    return low < high ? (low + high) / 2 : base;
  }

  private handleKeys(): void {
    if (this.uiOpen) return;
    const k = this.keys;
    const down = (a: string, b: string) => k[a].isDown || k[b].isDown;
    if (Phaser.Input.Keyboard.JustDown(k.E) || Phaser.Input.Keyboard.JustDown(k.ENTER) || Phaser.Input.Keyboard.JustDown(k.SPACE)) {
      const near = this.nearestInteractive();
      if (near) this.goInteract(near);
      return;
    }
    let sx = 0, sy = 0;
    if (down('UP', 'W')) { sx -= 1; sy -= 1; }
    if (down('DOWN', 'S')) { sx += 1; sy += 1; }
    if (down('LEFT', 'A')) { sx -= 1; sy += 1; }
    if (down('RIGHT', 'D')) { sx += 1; sy -= 1; }
    sx = Math.sign(sx); sy = Math.sign(sy);
    if ((!sx && !sy) || (this.player.isMoving && this.player.animName === 'walk' && this.keyboardStep)) return;
    if (this.player.isMoving) return;
    const c = this.player.cell;
    const tries: [number, number][] = [[sx, sy]];
    if (sx && sy) tries.push([sx, 0], [0, sy]); else if (sx) tries.push([sx, 0]); else tries.push([0, sy]);
    for (const [dx, dy] of tries) {
      const t = { x: c.x + dx, y: c.y + dy };
      if (!dx && !dy) continue;
      if (this.nav.isWalkable(t.x, t.y) && (!dx || !dy || (this.nav.isWalkable(c.x + dx, c.y) && this.nav.isWalkable(c.x, c.y + dy)))) {
        this.token++;
        this.select(null);
        this.keyboardStep = true;
        this.player.walk([c, t], () => { this.keyboardStep = false; });
        return;
      }
    }
  }
  private keyboardStep = false;

  private nearestInteractive(): string | null {
    const c = this.player.cell;
    let best: string | null = null; let bd = 3.2;
    for (const o of this.objs.values()) {
      const it = o.def.interactive;
      if (!it?.enabled) continue;
      for (const a of it.approach) {
        const d = Math.hypot(a.x - c.x, a.y - c.y);
        if (d < bd) { bd = d; best = o.def.id; }
      }
    }
    return best;
  }

  // ---------- API для интерфейса и тестов ----------
  /** Подойти к предмету по id и выполнить его действие (используется ссылками-якорями и текстовым меню). */
  interact(id: string): void { this.goInteract(id); }
  trimTextures(keep: Appearance[]): void { this.player.trimTextures(keep); }
  debugState(): { cell: Cell; moving: boolean; sitting: boolean; anim: string } {
    return { cell: this.player.cell, moving: this.player.isMoving, sitting: this.player.isSitting, anim: this.player.animName };
  }
  /** Точка на странице (clientX/Y) для клетки сетки или предмета — нужна автотестам. */
  clientPosOfCell(x: number, y: number): { x: number; y: number } {
    const w = gridToWorld(x + 0.5, y + 0.5);
    const s = this.toScreen(w.x, w.y);
    const r = this.scale.canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }
  clientPosOfPoint(gx: number, gy: number, z: number): { x: number; y: number } {
    const w = gridToWorld(gx, gy);
    const s = this.toScreen(w.x, w.y - z);
    const r = this.scale.canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }
  clientPosOfObject(id: string): { x: number; y: number } {
    const d = this.objs.get(id)!.def;
    const c = gridToWorld(d.gx + d.w / 2, d.gy + d.d / 2);
    const s = this.toScreen(c.x, c.y - (d.z ?? 0) - Math.min(d.h, 60) / 2);
    const r = this.scale.canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }
}
