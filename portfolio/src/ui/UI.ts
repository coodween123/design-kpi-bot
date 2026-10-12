import type { Bus } from '../bus';
import { ActionDef, FURNITURE } from '../config/room';
import { Block, Section, SECTIONS } from '../config/sections';
import { SITE } from '../config/settings';
import { Appearance, CategoryId, DEFAULT_APPEARANCE, WARDROBE } from '../config/wardrobe';
import { renderCharacterPreview } from '../game/draw/character';
import { saveAppearance } from '../state/appearance';
import { ICONS } from './icons';
import { CSS } from './styles';

export interface UIOptions {
  appearance: Appearance;
  routing: 'hash' | 'none';
  onRetry: () => void;
  /** Подойти к предмету в комнате (для кнопок текстового меню — не используется, меню открывает раздел сразу) */
  onAppearanceSaved?: (a: Appearance) => void;
}

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.\/)/i;
const INTRO_KEY = 'avatar-portfolio:intro-seen';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class UI {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  private hud: HTMLElement;
  private tip: HTMLElement;
  private toastEl: HTMLElement;
  private statusEl: HTMLElement;
  private loader: HTMLElement;
  private bar: HTMLElement;
  private intro: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private win: { el: HTMLElement; scrim: HTMLElement | null; id: string; opener: HTMLElement | null } | null = null;
  private committed: Appearance;
  private working: Appearance;
  private toastTimer = 0;
  private openedFromHash = false;

  constructor(host: HTMLElement, private bus: Bus, private opts: UIOptions) {
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root = el('div', 'root');
    this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-label', `${SITE.title}: интерактивная комната`);
    shadow.append(style, this.root);

    this.committed = { ...opts.appearance };
    this.working = { ...opts.appearance };

    this.stage = el('div', 'stage');
    this.hud = el('div', 'hud');
    this.tip = el('div', 'tip');
    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.statusEl = el('div', 'status');
    this.statusEl.setAttribute('aria-live', 'polite');
    this.loader = el('div', 'loader', `<div><b>Готовим комнату…</b><div class="bar"><i></i></div></div>`);
    this.bar = this.loader.querySelector('i')!;

    const brand = el('div', 'brand', `<b></b><span></span>`);
    brand.querySelector('b')!.textContent = SITE.title;
    brand.querySelector('span')!.textContent = SITE.subtitle;

    const actions = el('div', 'actions');
    const mk = (icon: string, label: string, fn: () => void) => {
      const b = el('button', 'btn', `${ICONS[icon]}<span class="lbl"></span>`);
      b.querySelector('.lbl')!.textContent = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      return b;
    };
    const menuBtn = mk('menu', SITE.menuTitle, () => this.toggleMenu(menuBtn));
    menuBtn.setAttribute('aria-haspopup', 'true');
    actions.append(
      menuBtn,
      mk('hanger', 'Гардероб', () => this.openWardrobe()),
      mk('help', 'Подсказка', () => this.showIntro(true)),
    );
    if (document.fullscreenEnabled) {
      const fs = mk('expand', 'Во весь экран', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void host.requestFullscreen?.();
      });
      fs.classList.add('icon');
      actions.append(fs);
    }
    this.hud.append(brand, actions, this.tip, this.toastEl, this.statusEl);
    this.root.append(this.stage, this.hud, this.loader);

    this.wireBus();
    document.addEventListener('keydown', this.onKey);
    if (opts.routing === 'hash') window.addEventListener('hashchange', this.onHash);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('hashchange', this.onHash);
  }

  // ---------- события из сцены ----------
  private wireBus(): void {
    this.bus.on('progress', (p) => { this.bar.style.width = `${Math.round(p * 100)}%`; });
    this.bus.on('ready', () => {
      this.loader.remove();
      this.showIntro(false);
      this.openedFromHash = true;
      this.onHash();
    });
    this.bus.on('fail', (msg) => this.showError(msg));
    this.bus.on('hover', ({ label, x, y }) => {
      this.tip.classList.toggle('on', !!label && !this.win);
      if (label) { this.tip.textContent = label; this.tip.style.left = `${x}px`; this.tip.style.top = `${y}px`; }
    });
    this.bus.on('selected', (s) => {
      this.statusEl.textContent = s ? `Идёт к: ${s.label}` : '';
      this.statusEl.classList.toggle('on', !!s);
    });
    this.bus.on('toast', (t) => this.toast(t));
    this.bus.on('action', ({ action }) => this.runAction(action));
    this.bus.on('status', (s) => { if (s === 'walking') this.hideIntro(); });
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), 1800);
  }

  private showError(msg: string): void {
    this.loader.remove();
    const e = el('div', 'error', `<div class="box"><h2>Не удалось загрузить сцену</h2><p></p><div class="row"></div></div>`);
    e.querySelector('p')!.textContent = `Можно открыть разделы списком. (${msg})`;
    const row = e.querySelector('.row')!;
    const retry = el('button', 'btn primary', 'Повторить'); retry.addEventListener('click', () => this.opts.onRetry());
    const list = el('button', 'btn', 'Открыть разделы'); list.addEventListener('click', () => { e.remove(); this.toggleMenu(null, true); });
    row.append(retry, list);
    this.root.append(e);
  }

  // ---------- подсказка ----------
  private showIntro(force: boolean): void {
    if (!force) { try { if (localStorage.getItem(INTRO_KEY)) return; } catch { /* нет доступа к хранилищу */ } }
    this.intro?.remove();
    this.intro = el('div', 'intro', `
      <h2>Как пользоваться</h2>
      <ul>
        <li>Нажмите на пол — персонаж пойдёт туда.</li>
        <li>Нажмите на предмет — персонаж подойдёт и откроется раздел.</li>
        <li class="kb">С клавиатуры: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> или <kbd>WASD</kbd> — ходьба, <kbd>E</kbd> — действие рядом, <kbd>Esc</kbd> — закрыть окно.</li>
      </ul>`);
    const ok = el('button', 'btn primary', 'Понятно');
    ok.addEventListener('click', () => this.hideIntro());
    this.intro.append(ok);
    this.root.append(this.intro);
  }

  private hideIntro(): void {
    if (!this.intro) return;
    this.intro.remove(); this.intro = null;
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* ignore */ }
  }

  // ---------- меню разделов ----------
  private toggleMenu(opener: HTMLElement | null, forceOpen = false): void {
    if (this.menu && !forceOpen) { this.menu.remove(); this.menu = null; opener?.setAttribute('aria-expanded', 'false'); return; }
    this.closeWindow();
    this.menu?.remove();
    const m = el('nav', 'menu', `<h2></h2>`);
    m.querySelector('h2')!.textContent = SITE.menuTitle;
    m.setAttribute('aria-label', SITE.menuTitle);
    const entries: { id: string; title: string; icon: string }[] = [
      ...Object.values(SECTIONS).map((s) => ({ id: s.id, title: s.title, icon: s.icon })),
      { id: 'wardrobe', title: 'Гардероб', icon: 'hanger' },
    ];
    for (const e of entries) {
      const a = el('a', '', `<span class="ico">${ICONS[e.icon]}</span><span></span>`);
      a.querySelector('span:last-child')!.textContent = e.title;
      a.href = `#/${e.id}`;
      a.addEventListener('click', (ev) => { ev.preventDefault(); this.menu?.remove(); this.menu = null; this.openById(e.id, a); });
      m.append(a);
    }
    this.root.append(m);
    this.menu = m;
    opener?.setAttribute('aria-expanded', 'true');
    (m.querySelector('a') as HTMLElement | null)?.focus();
  }

  // ---------- маршрутизация по адресу ----------
  private onHash = (): void => {
    if (!this.openedFromHash) return;
    const id = location.hash.replace(/^#\/?/, '');
    if (!id) { if (this.win) this.closeWindow(true); return; }
    if (this.win?.id === id) return;
    if (id === 'wardrobe' || SECTIONS[id]) this.openById(id, null, true);
  };

  private setHash(id: string): void {
    if (this.opts.routing !== 'hash') return;
    const want = id ? `#/${id}` : '';
    if (location.hash === want) return;
    if (id) location.hash = want;
    else history.replaceState(null, '', location.pathname + location.search);
  }

  private openById(id: string, opener: HTMLElement | null, fromHash = false): void {
    if (id === 'wardrobe') this.openWardrobe(opener, fromHash);
    else if (SECTIONS[id]) this.openSection(SECTIONS[id], 'modal', opener, fromHash);
  }

  // ---------- действия ----------
  private runAction(a: ActionDef): void {
    switch (a.type) {
      case 'modal': case 'panel':
        if (a.section && SECTIONS[a.section]) this.openSection(SECTIONS[a.section], a.type);
        else this.toast('Раздел не найден');
        break;
      case 'wardrobe': this.openWardrobe(); break;
      case 'link': if (a.url && SAFE_URL.test(a.url)) window.open(a.url, a.newTab === false ? '_self' : '_blank', 'noopener'); break;
      case 'page': if (a.url && SAFE_URL.test(a.url)) window.location.assign(a.url); break;
      case 'special': break; // обрабатывается в сцене
    }
  }

  // ---------- окна ----------
  private openWindow(id: string, kind: 'modal' | 'panel' | 'sheet', opener: HTMLElement | null, fromHash = false): HTMLElement {
    this.closeWindow(true);
    this.hideIntro();
    this.menu?.remove(); this.menu = null;
    const scrim = kind === 'modal' ? el('div', 'scrim') : null;
    scrim?.addEventListener('click', () => this.closeWindow());
    const w = el('section', `win ${kind}`);
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', kind === 'modal' ? 'true' : 'false');
    if (scrim) this.root.append(scrim);
    this.root.append(w);
    this.win = { el: w, scrim, id, opener };
    this.tip.classList.remove('on');
    this.bus.emit('uiOpen', true);
    if (!fromHash) this.setHash(id);
    return w;
  }

  private header(w: HTMLElement, icon: string, title: string, subtitle: string | undefined, onClose: () => void): void {
    const h = el('header', '', `<span class="ico">${ICONS[icon]}</span><div class="grow"><h2></h2><p></p></div>`);
    h.querySelector('h2')!.textContent = title;
    const p = h.querySelector('p') as HTMLElement;
    if (subtitle) p.textContent = subtitle; else p.remove();
    w.setAttribute('aria-label', title);
    const x = el('button', 'close', ICONS.close);
    x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', onClose);
    h.append(x);
    w.append(h);
    queueMicrotask(() => x.focus());
  }

  private applyInset(): void {
    if (!this.win) return;
    const kind = this.win.el.classList.contains('modal') ? 'modal' : 'other';
    if (kind === 'modal') { this.bus.emit('inset', { left: 0, right: 0, top: 0, bottom: 0 }); return; }
    const r = this.win.el.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    if (this.win.el.classList.contains('sheet') || rr.width <= 720) this.bus.emit('inset', { left: 0, right: 0, top: 56, bottom: Math.max(0, rr.bottom - r.top) });
    else this.bus.emit('inset', { left: 0, right: Math.max(0, rr.right - r.left) , top: 0, bottom: 0 });
  }

  closeWindow(silent = false): void {
    if (!this.win) return;
    const { el: w, scrim, opener, id } = this.win;
    w.remove(); scrim?.remove();
    this.win = null;
    if (id === 'wardrobe') this.bus.emit('preview', { ...this.committed });
    this.bus.emit('uiOpen', false);
    this.bus.emit('inset', { left: 0, right: 0, top: 0, bottom: 0 });
    if (!silent) this.setHash('');
    opener?.focus?.();
  }

  openSection(s: Section, kind: 'modal' | 'panel', opener: HTMLElement | null = null, fromHash = false): void {
    const w = this.openWindow(s.id, kind, opener, fromHash);
    this.header(w, s.icon, s.title, s.subtitle, () => this.closeWindow());
    const body = el('div', 'body');
    for (const b of s.blocks) body.append(this.renderBlock(b));
    w.append(body);
    document.title = `${s.title} — ${SITE.title}`;
    this.applyInset();
  }

  private renderBlock(b: Block): HTMLElement {
    switch (b.t) {
      case 'h': { const h = el('h3'); h.textContent = b.text; return h; }
      case 'p': { const p = el('p'); p.textContent = b.text; return p; }
      case 'list': { const ul = el('ul'); b.items.forEach((t) => { const li = el('li'); li.textContent = t; ul.append(li); }); return ul; }
      case 'kv': {
        const dl = el('dl');
        b.items.forEach(([k, v]) => { const dt = el('dt'); dt.textContent = k; const dd = el('dd'); dd.textContent = v; dl.append(dt, dd); });
        return dl;
      }
      case 'cards': {
        const g = el('div', 'cards');
        b.items.forEach((c) => {
          const card = el('article', 'card');
          if (c.tag) { const s = el('small'); s.textContent = c.tag; card.append(s); }
          const t = el('b'); t.textContent = c.title;
          const p = el('div'); p.textContent = c.text;
          card.append(t, p);
          g.append(card);
        });
        return g;
      }
      case 'links': {
        const d = el('div', 'links');
        b.items.forEach((l) => {
          const a = el('a', '', `<span></span>${ICONS.external}`);
          a.querySelector('span')!.textContent = l.label;
          if (SAFE_URL.test(l.href)) a.href = l.href;
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          d.append(a);
        });
        return d;
      }
      case 'media': {
        if (b.src && SAFE_URL.test(b.src)) {
          const v = el('video', 'media'); v.src = b.src; v.controls = true; v.preload = 'metadata';
          return v;
        }
        const m = el('div', 'media', `<div>${ICONS.play}<div></div></div>`);
        m.querySelector('div > div')!.textContent = b.caption;
        return m;
      }
    }
  }

  // ---------- гардероб ----------
  openWardrobe(opener: HTMLElement | null = null, fromHash = false): void {
    const mobile = this.root.getBoundingClientRect().width <= 720;
    const w = this.openWindow('wardrobe', mobile ? 'sheet' : 'panel', opener, fromHash);
    this.working = { ...this.committed };
    const cancel = () => { this.working = { ...this.committed }; this.closeWindow(); };
    this.header(w, 'hanger', 'Гардероб', 'Изменения видны сразу', cancel);

    const wrap = el('div', 'body wd');
    const top = el('div', 'top');
    const prev = el('canvas');
    const hint = el('p', '', 'Выберите категорию и вариант. «Подтвердить» сохранит образ, «Отмена» вернёт прежний.');
    top.append(prev, hint);
    const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist');
    const grid = el('div', 'items'); grid.setAttribute('role', 'radiogroup');
    wrap.append(top, tabs, grid);

    const drawPreview = () => {
      const src = renderCharacterPreview(this.working, 'f', 'idle', 0, 3);
      prev.width = src.width; prev.height = src.height;
      prev.getContext('2d')!.drawImage(src, 0, 0);
    };
    let active: CategoryId = 'top';
    const renderItems = () => {
      grid.innerHTML = '';
      const cat = WARDROBE.find((c) => c.id === active)!;
      grid.setAttribute('aria-label', cat.label);
      for (const it of cat.items) {
        const b = el('button', 'item');
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(this.working[cat.id] === it.id));
        const sw = el('span', cat.kind === 'color' ? 'sw' : 'chip');
        sw.style.background = it.color ?? '#fff';
        const label = el('span'); label.textContent = it.label;
        b.append(sw, label);
        b.addEventListener('click', () => {
          this.working = { ...this.working, [cat.id]: it.id };
          this.bus.emit('preview', { ...this.working });
          grid.querySelectorAll('.item').forEach((n) => n.setAttribute('aria-checked', 'false'));
          b.setAttribute('aria-checked', 'true');
          drawPreview();
        });
        grid.append(b);
      }
    };
    const renderTabs = () => {
      tabs.innerHTML = '';
      for (const c of WARDROBE) {
        const t = el('button', 'tab'); t.textContent = c.label;
        t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(c.id === active));
        t.addEventListener('click', () => { active = c.id; renderTabs(); renderItems(); });
        tabs.append(t);
      }
    };
    renderTabs(); renderItems(); drawPreview();
    w.append(wrap);

    const foot = el('div', 'foot');
    const bCancel = el('button', 'btn', `${ICONS.undo}<span>Отмена</span>`);
    const bOk = el('button', 'btn primary', `${ICONS.check}<span>Подтвердить</span>`);
    bCancel.addEventListener('click', cancel);
    bOk.addEventListener('click', () => {
      this.committed = { ...this.working };
      saveAppearance(this.committed);
      this.opts.onAppearanceSaved?.(this.committed);
      this.closeWindow();
      this.toast('Образ сохранён');
    });
    foot.append(bCancel, bOk);
    w.append(foot);
    document.title = `Гардероб — ${SITE.title}`;
    this.applyInset();
  }

  resetAppearance(): void { this.committed = { ...DEFAULT_APPEARANCE }; }

  // ---------- клавиатура ----------
  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.win) this.closeWindow();
    else if (this.menu) { this.menu.remove(); this.menu = null; }
  };

  /** Список id предметов-кнопок для текстового меню/проверок. */
  static interactiveIds(): string[] { return FURNITURE.filter((f) => f.interactive?.enabled).map((f) => f.id); }
}
