import type { ActionDef } from './config/room';
import type { Appearance } from './config/wardrobe';
import { Emitter } from './events';

export type PlayerStatus = 'idle' | 'walking' | 'acting' | 'sitting';

export interface BusEvents extends Record<string, unknown> {
  // игра -> интерфейс
  progress: number;                                   // 0..1 загрузка
  ready: void;
  fail: string;                                       // ошибка загрузки
  hover: { label: string | null; x: number; y: number };
  selected: { id: string; label: string } | null;     // выбранный объект (идёт к нему)
  status: PlayerStatus;
  action: { objectId: string; label: string; action: ActionDef };
  toast: string;
  // интерфейс -> игра
  uiOpen: boolean;                                    // открыто окно: блокируем ввод в сцене
  inset: { left: number; right: number; top: number; bottom: number };
  preview: Appearance;                                // показать образ на персонаже (без сохранения)
}

export type Bus = Emitter<BusEvents>;
export const createBus = (): Bus => new Emitter<BusEvents>();
