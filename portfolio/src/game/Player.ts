import Phaser from 'phaser';
import type { Appearance } from '../config/wardrobe';
import { SETTINGS } from '../config/settings';
import { NavGrid, Cell } from './grid';
import { gridToWorld } from './iso';
import {
  ANIMS, AnimName, CHAR_H, CHAR_ORIGIN, CHAR_W, ensureCharacterTextures, frameKey, LAYERS, layerSignature,
  releaseUnusedCharacterTextures, View,
} from './draw/character';

const SIT_DROP = 7; // насколько персонаж «проседает» на сиденье, px

/** Персонаж: контейнер из слоёв-спрайтов. Умеет ходить по пути, поворачиваться, играть анимации и садиться. */
export class Player extends Phaser.GameObjects.Container {
  gx: number; gy: number;                    // позиция в сетке (центры клеток = i + 0.5)
  private layers: Phaser.GameObjects.Image[] = [];
  private shadowImg: Phaser.GameObjects.Image;
  private anim: AnimName = 'idle';
  private frame = 0;
  private frameT = 0;
  private view: View = 'f';
  private flip = false;
  private path: Cell[] = [];
  private onArrive: (() => void) | null = null;
  private onceDone: (() => void) | null = null;
  private appearance: Appearance;
  private sitting = false;
  depthOverride: number | null = null;

  constructor(scene: Phaser.Scene, private nav: NavGrid, cell: Cell, appearance: Appearance) {
    super(scene, 0, 0);
    this.gx = cell.x + 0.5;
    this.gy = cell.y + 0.5;
    this.appearance = { ...appearance };
    ensureCharacterTextures(scene, this.appearance);

    this.shadowImg = scene.add.image(0, 0, 'shadow').setScale(1 / SETTINGS.texScale * SETTINGS.texScale * 0.9);
    this.add(this.shadowImg);
    const sc = 1 / SETTINGS.texScale;
    for (const layer of LAYERS) {
      const img = scene.add.image(0, 0, frameKey(layerSignature(layer, this.appearance), 'f', 'idle', 0));
      img.setOrigin(CHAR_ORIGIN.x / CHAR_W, CHAR_ORIGIN.y / CHAR_H).setScale(sc);
      this.layers.push(img);
      this.add(img);
    }
    scene.add.existing(this);
    this.syncWorld();
  }

  get cell(): Cell { return { x: Math.floor(this.gx), y: Math.floor(this.gy) }; }
  get isMoving(): boolean { return this.path.length > 0; }
  get isSitting(): boolean { return this.sitting; }
  get animName(): AnimName { return this.anim; }

  setAppearance(a: Appearance): void {
    this.appearance = { ...a };
    ensureCharacterTextures(this.scene, this.appearance);
    this.applyFrame();
  }

  /** Сообщает кэшу текстур, какие образы ещё нужны (текущий + сохранённый). */
  trimTextures(keep: Appearance[]): void {
    releaseUnusedCharacterTextures(this.scene, [this.appearance, ...keep]);
  }

  // ---------- движение ----------
  walk(path: Cell[], onArrive: (() => void) | null): void {
    this.cancelSit();
    this.onceDone = null;
    this.path = path.slice(1);
    this.onArrive = onArrive;
    if (this.path.length) this.setAnim('walk');
    else this.finishMove();
  }

  stop(): void {
    this.path = [];
    this.onArrive = null;
    this.onceDone = null;
    if (!this.sitting) this.setAnim('idle');
  }

  faceVector(dx: number, dy: number): void {
    const sx = dx - dy, sy = dx + dy;
    if (sx !== 0 || sy !== 0) {
      this.view = sy < 0 ? 'b' : 'f';
      if (sx !== 0) this.flip = sx < 0;
      else if (sy < 0) this.flip = false;
    }
    this.applyFrame();
  }

  playOnce(anim: AnimName, done: () => void): void {
    this.path = [];
    this.onceDone = done;
    this.setAnim(anim);
  }

  /** Садится в точку (gx, gy) сетки, лицом к вектору face. */
  sitAt(gx: number, gy: number, face: [number, number], depth: number): void {
    this.path = [];
    this.sitting = true;
    this.depthOverride = depth;
    this.faceVector(face[0], face[1]);
    this.scene.tweens.add({
      targets: this, gx, gy, duration: 380, ease: 'Sine.easeInOut',
      onUpdate: () => this.syncWorld(),
      onComplete: () => { this.setAnim('sit'); this.syncWorld(); },
    });
    this.setAnim('idle');
  }

  private cancelSit(): void {
    if (!this.sitting) return;
    this.sitting = false;
    this.depthOverride = null;
    this.scene.tweens.killTweensOf(this);
    // встаём на ближайшую свободную клетку
    const c = this.cell;
    if (!this.nav.isWalkable(c.x, c.y)) {
      const near = this.nav.nearestReachable({ x: 1, y: 5 }, c.x, c.y) ?? { x: 1, y: 5 };
      this.gx = near.x + 0.5; this.gy = near.y + 0.5;
    }
  }

  private finishMove(): void {
    this.path = [];
    this.setAnim('idle');
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  private setAnim(a: AnimName): void {
    if (this.anim === a) return;
    this.anim = a; this.frame = 0; this.frameT = 0;
    this.applyFrame();
  }

  // ---------- кадр за кадром ----------
  update(dt: number): void {
    const def = ANIMS[this.anim];
    this.frameT += dt;
    const step = 1 / def.fps;
    while (this.frameT >= step) {
      this.frameT -= step;
      if (this.frame + 1 < def.frames) this.frame++;
      else if (def.loop) this.frame = 0;
      else if (this.onceDone) {
        const cb = this.onceDone; this.onceDone = null;
        this.setAnim('idle');
        cb();
        break;
      }
    }
    this.applyFrame();

    if (this.path.length) {
      const target = this.path[0];
      const tx = target.x + 0.5, ty = target.y + 0.5;
      const dx = tx - this.gx, dy = ty - this.gy;
      const dist = Math.hypot(dx, dy);
      const stepLen = SETTINGS.walkSpeed * dt;
      this.faceVector(Math.sign(Math.round(dx * 4) / 4), Math.sign(Math.round(dy * 4) / 4));
      if (dist <= stepLen) {
        this.gx = tx; this.gy = ty;
        this.path.shift();
        if (!this.path.length) this.finishMove();
      } else {
        const nx = this.gx + (dx / dist) * stepLen, ny = this.gy + (dy / dist) * stepLen;
        // страховка от столкновений: не заходим в заблокированную клетку
        if (this.nav.isWalkable(Math.floor(nx), Math.floor(ny))) { this.gx = nx; this.gy = ny; }
        else { this.gx = tx; this.gy = ty; }
      }
    }
    this.syncWorld();
  }

  private applyFrame(): void {
    const view = this.view;
    LAYERS.forEach((layer, i) => {
      const key = frameKey(layerSignature(layer, this.appearance), view, this.anim, this.frame);
      if (this.scene.textures.exists(key)) this.layers[i].setTexture(key);
    });
    this.layers.forEach((l) => l.setScale((this.flip ? -1 : 1) / SETTINGS.texScale, 1 / SETTINGS.texScale));
  }

  private syncWorld(): void {
    const w = gridToWorld(this.gx, this.gy);
    this.setPosition(w.x, w.y + (this.sitting ? SIT_DROP : 0));
    this.setDepth(this.depthOverride ?? this.gx + this.gy + 0.9);
  }
}
