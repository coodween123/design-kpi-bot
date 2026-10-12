// Описание комнаты: размер, мебель, интерактивные объекты.
// Чтобы добавить предмет: допишите объект в FURNITURE (kind — ключ рисовалки из game/draw/furniture.ts).
// Чтобы превратить его в кнопку раздела: заполните поле interactive.

export const ROOM_SIZE = 10;     // комната ROOM_SIZE x ROOM_SIZE клеток
export const WALL_HEIGHT = 150;  // высота стен, px

export type ActionType = 'modal' | 'panel' | 'page' | 'link' | 'special' | 'wardrobe';

export interface ActionDef {
  type: ActionType;
  /** id раздела из config/sections.ts (для modal / panel) */
  section?: string;
  /** адрес (для page / link) */
  url?: string;
  newTab?: boolean;
  /** ключ специального действия (для special), см. game/specials.ts */
  special?: string;
}

export interface InteractiveDef {
  enabled: boolean;                       // состояние доступности
  hint: string;                           // подсказка при наведении
  approach: { x: number; y: number }[];   // клетки, откуда можно взаимодействовать (первая доступная)
  face: [number, number];                 // куда смотреть при взаимодействии (вектор в сетке)
  action: ActionDef;
}

export interface FurnitureDef {
  id: string;
  label: string;
  kind: string;
  gx: number; gy: number;   // позиция (может быть дробной)
  w: number; d: number;     // размер по осям сетки, клеток
  z?: number;               // подъём над полом (предмет на столе), px
  blocks?: boolean;         // занимает клетки пола (по умолчанию true)
  wall?: boolean;           // предмет на стене: рисуется позади всего
  on?: string;              // id предмета-опоры (рисуется поверх него)
  /** высота спрайта, px (для расчёта размера текстуры) */
  h: number;
  interactive?: InteractiveDef;
}

export const FURNITURE: FurnitureDef[] = [
  // --- стены (декор) ---
  { id: 'window-left', label: 'Окно', kind: 'window', gx: 0, gy: 4.2, w: 0, d: 1.7, h: 150, wall: true, blocks: false },
  { id: 'frames-right', label: 'Рамки', kind: 'frames', gx: 2.2, gy: 0, w: 2.4, d: 0, h: 150, wall: true, blocks: false },
  {
    id: 'door', label: 'Дверь', kind: 'door', gx: 0, gy: 7.85, w: 0, d: 1.4, h: 150, wall: true, blocks: false,
    interactive: { enabled: true, hint: 'Контакты', approach: [{ x: 0, y: 8 }, { x: 1, y: 8 }], face: [-1, 0], action: { type: 'modal', section: 'contacts' } },
  },
  // --- мебель ---
  { id: 'lamp', label: 'Торшер', kind: 'lamp', gx: 0, gy: 0, w: 1, d: 1, h: 150 },
  {
    id: 'wardrobe', label: 'Шкаф', kind: 'wardrobe', gx: 0, gy: 1, w: 1, d: 2, h: 135,
    interactive: { enabled: true, hint: 'Гардероб', approach: [{ x: 1, y: 1 }, { x: 1, y: 2 }], face: [-1, 0], action: { type: 'wardrobe' } },
  },
  {
    id: 'sofa', label: 'Диван', kind: 'sofa', gx: 0, gy: 4, w: 1, d: 3, h: 80,
    interactive: { enabled: true, hint: 'Присесть', approach: [{ x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 6 }], face: [-1, 0], action: { type: 'special', special: 'sit' } },
  },
  { id: 'rug', label: 'Ковёр', kind: 'rug', gx: 3, gy: 3.2, w: 3.4, d: 3.4, h: 6, blocks: false },
  { id: 'coffee-table', label: 'Журнальный столик', kind: 'coffeeTable', gx: 2, gy: 4.2, w: 1, d: 1.6, h: 40 },
  { id: 'desk', label: 'Стол', kind: 'desk', gx: 2, gy: 0, w: 3, d: 1, h: 50 },
  { id: 'chair', label: 'Стул', kind: 'chair', gx: 3, gy: 1, w: 1, d: 1, h: 70 },
  {
    id: 'laptop', label: 'Ноутбук', kind: 'laptop', gx: 2.35, gy: 0.12, w: 0.9, d: 0.75, z: 40, h: 40, blocks: false, on: 'desk',
    interactive: { enabled: true, hint: 'Проекты', approach: [{ x: 2, y: 1 }, { x: 4, y: 1 }], face: [0, -1], action: { type: 'modal', section: 'projects' } },
  },
  {
    id: 'document', label: 'Резюме', kind: 'document', gx: 3.95, gy: 0.2, w: 0.65, d: 0.65, z: 40, h: 12, blocks: false, on: 'desk',
    interactive: { enabled: true, hint: 'Резюме', approach: [{ x: 4, y: 1 }, { x: 2, y: 1 }], face: [0, -1], action: { type: 'modal', section: 'resume' } },
  },
  {
    id: 'tv', label: 'Телевизор', kind: 'tv', gx: 6, gy: 0, w: 2, d: 1, h: 110,
    interactive: { enabled: true, hint: 'Видео', approach: [{ x: 6, y: 1 }, { x: 7, y: 1 }], face: [0, -1], action: { type: 'panel', section: 'video' } },
  },
  { id: 'bookshelf', label: 'Стеллаж', kind: 'bookshelf', gx: 8, gy: 0, w: 1, d: 1, h: 130 },
  { id: 'plant', label: 'Растение', kind: 'plant', gx: 9, gy: 0, w: 1, d: 1, h: 110 },
];

/** Стартовая клетка персонажа. */
export const PLAYER_START = { x: 5, y: 6 };
