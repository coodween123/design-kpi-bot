import Phaser from 'phaser';
import { createBus } from './bus';
import { SETTINGS } from './config/settings';
import { RoomScene } from './game/RoomScene';
import { loadAppearance } from './state/appearance';
import { UI } from './ui/UI';

export interface MountOptions {
  /** 'hash' — у разделов свои адреса (#/projects); 'none' — не трогать адрес страницы (удобно для вставки в Tilda) */
  routing?: 'hash' | 'none';
}

export interface PortfolioHandle { destroy(): void; game: Phaser.Game }

/** Собирает сайт-комнату внутри элемента host. Интерфейс живёт в Shadow DOM, стили страницы его не затрагивают. */
export function mountPortfolio(host: HTMLElement, options: MountOptions = {}): PortfolioHandle {
  const bus = createBus();
  const appearance = loadAppearance();
  let game: Phaser.Game | null = null;
  let ro: ResizeObserver | null = null;

  const ui = new UI(host, bus, {
    appearance,
    routing: options.routing ?? 'hash',
    onRetry: () => { handle.destroy(); mountPortfolio(host, options); },
  });

  const start = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(320, ui.stage.clientWidth), h = Math.max(240, ui.stage.clientHeight);
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ui.stage,
        width: Math.round(w * dpr), height: Math.round(h * dpr),
        transparent: true,
        scale: { mode: Phaser.Scale.NONE },
        render: { antialias: true, roundPixels: false },
        input: { touch: { capture: false }, mouse: { preventDefaultWheel: false } },
        banner: false,
        audio: { noAudio: true },
        scene: [],
      });
      game.scene.add('room', RoomScene, true, { bus, appearance });
      ro = new ResizeObserver(() => {
        const cw = ui.stage.clientWidth, ch = ui.stage.clientHeight;
        if (cw > 0 && ch > 0) game?.scale.resize(Math.round(cw * dpr), Math.round(ch * dpr));
      });
      ro.observe(ui.stage);
      (host as HTMLElement & { __portfolio?: unknown }).__portfolio = { game, bus, scene: () => game?.scene.getScene('room') };
    } catch (e) {
      bus.emit('fail', e instanceof Error ? e.message : String(e));
    }
  };
  // ждём, пока контейнер получит размер (важно при вставке в Tilda)
  requestAnimationFrame(start);
  void SETTINGS;

  const handle: PortfolioHandle = {
    get game() { return game as Phaser.Game; },
    destroy() {
      ro?.disconnect();
      ui.destroy();
      game?.destroy(true);
      host.shadowRoot && (host.shadowRoot.innerHTML = '');
    },
  };
  return handle;
}
