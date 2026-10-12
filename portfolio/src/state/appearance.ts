import { Appearance, DEFAULT_APPEARANCE, WARDROBE } from '../config/wardrobe';

const KEY = 'avatar-portfolio:appearance:v1';

/** Загружает сохранённый образ; при любой ошибке или устаревших id — безопасно возвращает значения по умолчанию. */
export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const data = JSON.parse(raw) as Partial<Appearance>;
    const out = { ...DEFAULT_APPEARANCE };
    for (const cat of WARDROBE) {
      const v = data[cat.id];
      if (typeof v === 'string' && cat.items.some((i) => i.id === v)) out[cat.id] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance): void {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* хранилище может быть недоступно */ }
}
