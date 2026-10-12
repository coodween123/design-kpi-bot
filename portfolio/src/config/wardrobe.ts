// Каталог гардероба. Чтобы добавить вариант — допишите элемент в нужную категорию.
// style — ключ рисовалки в game/draw/character.ts, color — основной цвет элемента.
export type CategoryId = 'skin' | 'hairStyle' | 'hairColor' | 'top' | 'bottom' | 'shoes' | 'accessory';

export interface WardrobeItem {
  id: string;
  label: string;
  style?: string;
  color?: string;
}

export interface WardrobeCategory {
  id: CategoryId;
  label: string;
  /** 'color' — показывать кружки цвета, 'style' — текстовые плитки */
  kind: 'color' | 'style';
  items: WardrobeItem[];
}

export const WARDROBE: WardrobeCategory[] = [
  {
    id: 'skin', label: 'Кожа', kind: 'color',
    items: [
      { id: 'skin-1', label: 'Светлая', color: '#ffdcc2' },
      { id: 'skin-2', label: 'Тёплая', color: '#f3c19b' },
      { id: 'skin-3', label: 'Смуглая', color: '#d29566' },
      { id: 'skin-4', label: 'Бронзовая', color: '#a8693f' },
      { id: 'skin-5', label: 'Тёмная', color: '#6d4429' },
    ],
  },
  {
    id: 'hairStyle', label: 'Причёска', kind: 'style',
    items: [
      { id: 'short', label: 'Короткая', style: 'short' },
      { id: 'bob', label: 'Каре', style: 'bob' },
      { id: 'long', label: 'Длинные', style: 'long' },
      { id: 'spiky', label: 'Ёжик', style: 'spiky' },
      { id: 'bun', label: 'Пучок', style: 'bun' },
    ],
  },
  {
    id: 'hairColor', label: 'Цвет волос', kind: 'color',
    items: [
      { id: 'hc-black', label: 'Чёрный', color: '#2b2230' },
      { id: 'hc-brown', label: 'Каштановый', color: '#6a4330' },
      { id: 'hc-blond', label: 'Светлый', color: '#e2bf6b' },
      { id: 'hc-red', label: 'Рыжий', color: '#c55a2b' },
      { id: 'hc-pink', label: 'Розовый', color: '#e06fa5' },
      { id: 'hc-blue', label: 'Голубой', color: '#4aa3df' },
    ],
  },
  {
    id: 'top', label: 'Верх', kind: 'style',
    items: [
      { id: 'tee-coral', label: 'Футболка, коралл', style: 'tee', color: '#ef6f5e' },
      { id: 'tee-mint', label: 'Футболка, мята', style: 'tee', color: '#4fc4a3' },
      { id: 'hoodie-violet', label: 'Худи, фиолет', style: 'hoodie', color: '#7a63d6' },
      { id: 'hoodie-gray', label: 'Худи, серое', style: 'hoodie', color: '#7d8795' },
      { id: 'jacket-navy', label: 'Куртка, синяя', style: 'jacket', color: '#2f4a7a' },
      { id: 'jacket-mustard', label: 'Куртка, горчица', style: 'jacket', color: '#d9a43a' },
    ],
  },
  {
    id: 'bottom', label: 'Низ', kind: 'style',
    items: [
      { id: 'jeans-blue', label: 'Джинсы', style: 'pants', color: '#3f5f9a' },
      { id: 'pants-black', label: 'Брюки', style: 'pants', color: '#2d2d3a' },
      { id: 'shorts-sand', label: 'Шорты', style: 'shorts', color: '#cdb48a' },
      { id: 'skirt-plum', label: 'Юбка', style: 'skirt', color: '#a84f86' },
    ],
  },
  {
    id: 'shoes', label: 'Обувь', kind: 'style',
    items: [
      { id: 'sneakers-white', label: 'Кеды, белые', style: 'sneakers', color: '#f2f2f2' },
      { id: 'sneakers-red', label: 'Кеды, красные', style: 'sneakers', color: '#d9473f' },
      { id: 'boots-brown', label: 'Ботинки', style: 'boots', color: '#6b4630' },
    ],
  },
  {
    id: 'accessory', label: 'Аксессуары', kind: 'style',
    items: [
      { id: 'none', label: 'Без', style: 'none' },
      { id: 'glasses', label: 'Очки', style: 'glasses', color: '#2b2230' },
      { id: 'cap', label: 'Кепка', style: 'cap', color: '#e0524c' },
      { id: 'headphones', label: 'Наушники', style: 'headphones', color: '#2b2230' },
      { id: 'scarf', label: 'Шарф', style: 'scarf', color: '#e8b13a' },
    ],
  },
];

export type Appearance = Record<CategoryId, string>;

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 'skin-2',
  hairStyle: 'short',
  hairColor: 'hc-brown',
  top: 'hoodie-violet',
  bottom: 'jeans-blue',
  shoes: 'sneakers-white',
  accessory: 'none',
};

export function findItem(cat: CategoryId, id: string): WardrobeItem {
  const c = WARDROBE.find((x) => x.id === cat)!;
  return c.items.find((i) => i.id === id) ?? c.items[0];
}
