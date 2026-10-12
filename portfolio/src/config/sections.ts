// Разделы портфолио. ВСЕ данные ниже — временные демо-заглушки: замените на реальные.
// Блоки контента описываются простыми объектами, интерфейс сам их отрисует.
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'kv'; items: [string, string][] }
  | { t: 'cards'; items: { title: string; text: string; tag?: string; href?: string }[] }
  | { t: 'links'; items: { label: string; href: string }[] }
  | { t: 'media'; kind: 'video' | 'image'; src?: string; caption: string };

export interface Section {
  id: string;
  title: string;
  subtitle?: string;
  /** ключ значка из ui/icons.ts */
  icon: 'doc' | 'laptop' | 'tv' | 'door' | 'hanger';
  blocks: Block[];
}

export const SECTIONS: Record<string, Section> = {
  resume: {
    id: 'resume', title: 'Резюме', subtitle: 'Демо-данные', icon: 'doc',
    blocks: [
      { t: 'p', text: 'Здесь будет ваше резюме. Это временный текст — замените его в src/config/sections.ts.' },
      { t: 'kv', items: [['Должность', 'Укажите должность'], ['Опыт', 'Укажите опыт'], ['Город', 'Укажите город']] },
      { t: 'h', text: 'Навыки' },
      { t: 'list', items: ['Навык 1', 'Навык 2', 'Навык 3'] },
    ],
  },
  projects: {
    id: 'projects', title: 'Проекты', subtitle: 'Демо-данные', icon: 'laptop',
    blocks: [
      { t: 'p', text: 'Карточки ниже — заглушки. Добавляйте проекты, ссылки и теги.' },
      {
        t: 'cards',
        items: [
          { title: 'Проект 1', text: 'Короткое описание проекта.', tag: 'Айдентика' },
          { title: 'Проект 2', text: 'Короткое описание проекта.', tag: 'Digital' },
          { title: 'Проект 3', text: 'Короткое описание проекта.', tag: 'Маркетинг' },
        ],
      },
    ],
  },
  video: {
    id: 'video', title: 'Видео и презентации', subtitle: 'Демо-данные', icon: 'tv',
    blocks: [
      { t: 'media', kind: 'video', caption: 'Сюда добавляется видео или презентация (поле src).' },
      { t: 'p', text: 'Подпись к материалу.' },
    ],
  },
  contacts: {
    id: 'contacts', title: 'Контакты', subtitle: 'Демо-данные', icon: 'door',
    blocks: [
      { t: 'p', text: 'Реальные контакты не указаны. Добавьте ссылки ниже.' },
      { t: 'links', items: [{ label: 'Ссылка 1 (заглушка)', href: '#' }, { label: 'Ссылка 2 (заглушка)', href: '#' }] },
    ],
  },
};
