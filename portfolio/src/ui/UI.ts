import type { Bus } from '../bus';
import type { ActionDef } from '../config/room';
import {
  ABOUT, CTA_DISCUSS, CTA_OFFER, CTA_PRICE, PRICE_NOTE, PROJECTS, SECTIONS, SERVICES, Service, TELEGRAM_URL,
} from '../config/sections';
import { Appearance, CategoryId, DEFAULT_APPEARANCE, GEORGY_APPEARANCE, WARDROBE, WardrobeCategory, WardrobeItem } from '../config/wardrobe';
import { preloadAppearance, renderCharacterCrop, renderCharacterPreview } from '../game/draw/character';
import { HAIR_STYLES, preloadHair } from '../game/draw/hair';
import { findItem } from '../config/wardrobe';
import { saveAppearance } from '../state/appearance';
import { AWARD_ART, EMPTY_PROJECTS_ART, SERVICE_ART } from './art';
import { injectFonts } from './fonts';
import { ICONS } from './icons';
import { CSS } from './styles';

export interface UIOptions {
  appearance: Appearance;
  routing: 'hash' | 'none';
  onRetry: () => void;
  onAppearanceSaved?: (a: Appearance) => void;
}

type Kind = 'modal' | 'panel' | 'sheet';
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.\/)/i;
const WIDTH: Record<string, number> = { about: 720, services: 780, projects: 700, contacts: 460, telegram: 420, wardrobe: 640 };
const DEFAULT_KIND: Record<string, Kind> = { about: 'modal', services: 'modal', projects: 'modal', contacts: 'modal', telegram: 'panel', wardrobe: 'panel' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function tgLink(label: string, cls = 'btn orange'): HTMLAnchorElement {
  const a = el('a', cls);
  a.href = TELEGRAM_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.innerHTML = `${ICONS.plane}<span></span>`;
  a.querySelector('span')!.textContent = label;
  return a;
}

export class UI {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  private hud: HTMLElement;
  private tip: HTMLElement;
  private toastEl: HTMLElement;
  private loader: HTMLElement;
  private bar: HTMLElement;
  private menu: HTMLElement | null = null;
  private win: { el: HTMLElement; scrim: HTMLElement | null; id: string; opener: HTMLElement | null } | null = null;
  private committed: Appearance;
  private working: Appearance;
  private toastTimer = 0;
  private ready = false;
  private baseTitle = document.title;

  constructor(host: HTMLElement, private bus: Bus, private opts: UIOptions) {
    injectFonts();
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root = el('div', 'root');
    this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-label', `${ABOUT.name}: интерактивное портфолио`);
    shadow.append(style, this.root);

    this.committed = { ...opts.appearance };
    this.working = { ...opts.appearance };

    this.stage = el('div', 'stage');
    this.hud = el('div', 'hud');
    this.tip = el('div', 'tip');
    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.loader = el('div', 'loader', `<div><b>Загрузка…</b><div class="bar"><i></i></div></div>`);
    this.bar = this.loader.querySelector('i')!;

    const actions = el('div', 'actions');
    const menuBtn = el('button', 'btn', `${ICONS.menu}<span class="t">Меню</span>`);
    menuBtn.setAttribute('aria-label', 'Меню разделов');
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.addEventListener('click', () => this.toggleMenu(menuBtn));
    actions.append(menuBtn);
    if (document.fullscreenEnabled) {
      const fs = el('button', 'btn icon', ICONS.expand);
      fs.setAttribute('aria-label', 'Во весь экран');
      fs.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void host.requestFullscreen?.(); });
      actions.append(fs);
    }
    this.hud.append(actions, this.tip, this.toastEl);
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
      this.ready = true;
      this.startHint();
      this.onHash();
    });
    this.bus.on('fail', (msg) => this.showError(msg));
    this.bus.on('hover', ({ label, x, y }) => {
      this.tip.classList.toggle('on', !!label && !this.win);
      if (label) { this.tip.textContent = label; this.tip.style.left = `${x}px`; this.tip.style.top = `${y}px`; }
    });
    this.bus.on('toast', (t) => this.toast(t));
    this.bus.on('action', ({ action }) => this.runAction(action));
    this.bus.on('status', (st) => { if (st !== 'idle') this.hideHint(); });
  }

  toast(text: string, ms = 1900): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  private hintEl: HTMLElement | null = null;
  private hintTimers: number[] = [];

  /** Подсказка в начале: появляется на несколько секунд и плавно исчезает (или сразу, как только посетитель начал действовать). */
  private startHint(): void {
    const h = el('div', 'hint');
    h.textContent = 'Нажмите на пол или на предмет в комнате';
    h.setAttribute('role', 'status');
    this.hud.append(h);
    this.hintEl = h;
    this.hintTimers.push(window.setTimeout(() => h.classList.add('on'), 400));
    this.hintTimers.push(window.setTimeout(() => this.hideHint(), 4600));
  }

  private hideHint(): void {
    const h = this.hintEl;
    if (!h) return;
    this.hintEl = null;
    this.hintTimers.forEach(clearTimeout);
    this.hintTimers = [];
    h.classList.remove('on');
    h.classList.add('off');
    window.setTimeout(() => h.remove(), 1500);
  }

  private showError(msg: string): void {
    this.loader.remove();
    const e = el('div', 'error', `<div class="box"><h2>Не удалось загрузить сцену</h2><p></p><div class="row"></div></div>`);
    e.querySelector('p')!.textContent = `Разделы можно открыть списком. (${msg})`;
    const row = e.querySelector('.row')!;
    const retry = el('button', 'btn orange', 'Повторить'); retry.addEventListener('click', () => this.opts.onRetry());
    const list = el('button', 'btn', 'Открыть разделы'); list.addEventListener('click', () => { e.remove(); this.toggleMenu(null, true); });
    row.append(retry, list);
    this.root.append(e);
  }

  // ---------- меню разделов ----------
  private toggleMenu(opener: HTMLElement | null, forceOpen = false): void {
    if (this.menu && !forceOpen) { this.closeMenu(); opener?.setAttribute('aria-expanded', 'false'); return; }
    this.closeWindow();
    this.menu?.remove();
    const m = el('nav', 'menu');
    m.setAttribute('aria-label', 'Разделы');
    for (const s of Object.values(SECTIONS).filter((x) => x.menu)) {
      const a = el('a', '', `${ICONS[s.icon === 'plane' ? 'plane' : s.icon]}<span></span>`);
      a.querySelector('span')!.textContent = s.title;
      a.href = `#/${s.id}`;
      a.addEventListener('click', (ev) => { ev.preventDefault(); this.closeMenu(); this.openById(s.id, a); });
      m.append(a);
    }
    this.root.append(m);
    this.menu = m;
    opener?.setAttribute('aria-expanded', 'true');
    (m.querySelector('a') as HTMLElement | null)?.focus();
  }

  private closeMenu(): void { this.menu?.remove(); this.menu = null; }

  // ---------- адреса разделов ----------
  private onHash = (): void => {
    if (!this.ready) return;
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

  private openById(id: string, opener: HTMLElement | null, fromHash = false, kind?: Kind): void {
    const k = kind ?? DEFAULT_KIND[id] ?? 'modal';
    if (id === 'wardrobe') void this.openWardrobe(opener, fromHash);
    else if (SECTIONS[id]) this.openSection(id, k, opener, fromHash);
  }

  private runAction(a: ActionDef): void {
    switch (a.type) {
      case 'modal': case 'panel':
        if (a.section && SECTIONS[a.section]) this.openById(a.section, null, false, a.type);
        else this.toast('Раздел не найден');
        break;
      case 'wardrobe': void this.openWardrobe(); break;
      case 'link': if (a.url && SAFE_URL.test(a.url)) window.open(a.url, a.newTab === false ? '_self' : '_blank', 'noopener'); break;
      case 'page': if (a.url && SAFE_URL.test(a.url)) window.location.assign(a.url); break;
      case 'special': break; // обрабатывается в сцене
    }
  }

  // ---------- окна ----------
  private openWindow(id: string, kind: Kind, opener: HTMLElement | null, fromHash: boolean): HTMLElement {
    this.closeWindow(true, true);
    this.closeMenu();
    const scrim = kind === 'modal' ? el('div', 'scrim') : null;
    scrim?.addEventListener('click', () => this.closeWindow());
    const w = el('section', `win ${kind}`);
    w.style.setProperty('--w', `${WIDTH[id] ?? 700}px`);
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', kind === 'modal' ? 'true' : 'false');
    w.tabIndex = -1;
    if (id === 'wardrobe') w.classList.add('tall');
    if (scrim) this.root.append(scrim);
    this.root.append(w);
    this.win = { el: w, scrim, id, opener };
    this.tip.classList.remove('on');
    this.toastEl.classList.remove('on');
    this.hideHint();
    this.bus.emit('uiOpen', true);
    queueMicrotask(() => w.focus({ preventScroll: true }));
    if (!fromHash) this.setHash(id);
    return w;
  }

  private header(w: HTMLElement, title: string, onClose: () => void): HTMLElement {
    const h = el('header', '', `<h2></h2>`);
    h.querySelector('h2')!.textContent = title;
    w.setAttribute('aria-label', title);
    const x = el('button', 'close', ICONS.close);
    x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', onClose);
    h.append(x);
    w.append(h);
    return h;
  }

  private applyInset(): void {
    if (!this.win) return;
    if (this.win.el.classList.contains('modal')) { this.bus.emit('inset', { left: 0, right: 0, top: 0, bottom: 0 }); return; }
    const r = this.win.el.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    if (this.win.el.classList.contains('sheet') || rr.width <= 720) this.bus.emit('inset', { left: 0, right: 0, top: 56, bottom: Math.max(0, rr.bottom - r.top) });
    else this.bus.emit('inset', { left: 0, right: Math.max(0, rr.right - r.left), top: 0, bottom: 0 });
  }

  closeWindow(silent = false, replacing = false): void {
    if (!this.win) return;
    const { el: w, scrim, opener, id } = this.win;
    w.remove(); scrim?.remove();
    this.win = null;
    if (id === 'wardrobe') this.bus.emit('preview', { ...this.committed });
    if (replacing) return;
    this.bus.emit('uiOpen', false);
    this.bus.emit('inset', { left: 0, right: 0, top: 0, bottom: 0 });
    if (!silent) this.setHash('');
    if (this.opts.routing === 'hash') document.title = this.baseTitle;
    opener?.focus?.();
  }

  private setTitle(t: string): void { if (this.opts.routing === 'hash') document.title = `${t} — ${ABOUT.name}`; }

  openSection(id: string, kind: Kind, opener: HTMLElement | null = null, fromHash = false): void {
    const s = SECTIONS[id];
    const w = this.openWindow(id, kind, opener, fromHash);
    const hdr = this.header(w, s.title, () => this.closeWindow());
    const body = el('div', 'body');
    w.append(body);
    if (id === 'about') this.renderAbout(body);
    else if (id === 'services') this.renderServices(body, hdr);
    else if (id === 'projects') this.renderProjects(body);
    else if (id === 'telegram') this.renderTelegram(body);
    else this.renderContacts(body);
    this.setTitle(s.title);
    this.applyInset();
  }

  // ---------- Обо мне ----------
  private renderAbout(body: HTMLElement): void {
    const wrap = el('div', 'ab');
    const portrait = el('div', 'portrait');
    const cv = el('canvas');
    portrait.append(cv, el('div', 'ribbon', ''));
    (portrait.querySelector('.ribbon') as HTMLElement).textContent = ABOUT.role;
    void this.paintPortrait(cv, GEORGY_APPEARANCE);

    const right = el('div');
    const name = el('div', 'name', `<div class="star"><svg viewBox="0 0 54 54"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd6ff"/><stop offset="1" stop-color="#2a82c0"/></linearGradient></defs><path d="M27 3l7.400 15.200 16.600 2.400-12 11.800 2.800 16.600L27 40.900 12.200 49l2.800-16.600-12-11.800 16.600-2.400z" fill="url(#sg)" stroke="#0d3a5f" stroke-width="2" stroke-linejoin="round"/></svg><b></b></div><div class="namebar"></div>`);
    name.querySelector('b')!.textContent = ABOUT.yearsBadge;
    name.querySelector('.namebar')!.textContent = ABOUT.name;
    const yrs = el('p', 'yrs'); yrs.textContent = ABOUT.yearsLabel;
    const tags = el('div', 'tags');
    for (const t of ABOUT.tags) { const s = el('span', 'tag'); s.textContent = t; tags.append(s); }
    const text = el('div', 'pnl');
    for (const t of ABOUT.paragraphs) { const p = el('p'); p.textContent = t; text.append(p); }
    right.append(name, yrs, tags, text);
    wrap.append(portrait, right);

    const lbl = el('div', 'lbl'); lbl.textContent = 'Достижения';
    const awards = el('div', 'awards');
    for (const a of ABOUT.awards) {
      const c = el('div', 'award', `<div class="ic">${AWARD_ART[a.icon]}</div><b></b><span></span>`);
      c.querySelector('b')!.textContent = a.title;
      c.querySelector('span')!.textContent = a.text;
      awards.append(c);
    }
    const cta = el('div', 'cta');
    cta.append(tgLink('Написать в Telegram'));
    body.append(wrap, lbl, awards, cta);
  }

  private async paintPortrait(cv: HTMLCanvasElement, a: Appearance): Promise<void> {
    await preloadAppearance(a);
    const src = renderCharacterPreview(a, 'f', 'idle', 0, 3);
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d')!.drawImage(src, 0, 0);
  }

  // ---------- Каталог услуг ----------
  private renderServices(body: HTMLElement, hdr: HTMLElement): void {
    const showList = () => {
      hdr.querySelector('.back')?.remove();
      body.innerHTML = '';
      const grid = el('div', 'sv-grid');
      for (const s of SERVICES) {
        const c = el('button', 'sv-card', `<span class="art">${SERVICE_ART[s.art]}</span><span class="lab"></span>`);
        c.querySelector('.lab')!.textContent = s.title;
        c.addEventListener('click', () => showDetail(s));
        grid.append(c);
      }
      const price = el('div', 'sv-price pnl');
      const t = el('span'); t.textContent = PRICE_NOTE;
      price.append(t, tgLink(CTA_OFFER));
      body.append(grid, price);
    };
    const showDetail = (s: Service) => {
      body.innerHTML = '';
      hdr.querySelector('.back')?.remove();
      const back = el('button', 'btn dark back', `${ICONS.back}<span>Все услуги</span>`);
      back.style.minHeight = '34px'; back.style.padding = '0 12px';
      back.addEventListener('click', showList);
      hdr.prepend(back);
      const d = el('div', 'sv-detail');
      const art = el('div', 'art'); art.innerHTML = SERVICE_ART[s.art];
      const info = el('div');
      const h = el('h3'); h.textContent = s.title;
      const desc = el('div', 'pnl'); const p = el('p'); p.textContent = s.description; desc.append(p);
      info.append(h, desc);
      d.append(art, info);
      const lbl = el('div', 'lbl'); lbl.textContent = 'Что входит';
      const ul = el('ul', 'inc pnl');
      for (const i of s.includes) { const li = el('li'); li.textContent = i; ul.append(li); }
      const note = el('div', 'pnl'); note.style.marginTop = '10px';
      const np = el('p'); np.textContent = s.note; note.append(np);
      const price = el('div', 'sv-price');
      const pt = el('span'); pt.textContent = PRICE_NOTE; price.append(pt);
      const actions = el('div', 'sv-actions');
      actions.append(tgLink(CTA_PRICE), tgLink(CTA_DISCUSS, 'btn'));
      body.append(d, lbl, ul, note, price, actions);
      body.scrollTop = 0;
    };
    showList();
  }

  // ---------- Проекты ----------
  private renderProjects(body: HTMLElement): void {
    if (PROJECTS.length) {
      const grid = el('div', 'pj-grid');
      for (const p of PROJECTS) {
        const c = el('article', 'pj', `<div class="im"></div><div class="tx"><b></b><em></em><p></p><small></small></div>`);
        const im = c.querySelector('.im') as HTMLElement;
        if (p.image && SAFE_URL.test(p.image)) im.style.backgroundImage = `url("${p.image.replace(/"/g, '%22')}")`;
        c.querySelector('b')!.textContent = p.title;
        c.querySelector('em')!.textContent = p.type;
        c.querySelector('p')!.textContent = p.description;
        const sm = c.querySelector('small') as HTMLElement;
        if (p.role) sm.textContent = `Роль: ${p.role}`; else sm.remove();
        grid.append(c);
      }
      body.append(grid);
      return;
    }
    const e = el('div', 'pj-empty', `<div class="art">${EMPTY_PROJECTS_ART}</div><h3>Подборка работ скоро появится</h3><p class="pnl">Пока можно посмотреть каталог услуг или написать мне в Telegram.</p>`);
    const row = el('div', 'sv-actions'); row.style.justifyContent = 'center';
    const services = el('button', 'btn dark', `${ICONS.book}<span>Каталог услуг</span>`);
    services.addEventListener('click', () => this.openById('services', null, false, 'modal'));
    row.append(services, tgLink(CTA_DISCUSS));
    e.append(row);
    body.append(e);
  }

  // ---------- Telegram (телевизор) ----------
  private renderTelegram(body: HTMLElement): void {
    const t = el('div', 'tv', `<div class="screen">${ICONS.telegram}</div><h3>Telegram-канал</h3><p class="url">t.me/g_andyul</p>`);
    t.append(tgLink('Открыть Telegram'));
    body.append(t);
  }

  // ---------- Контакты (дверь) ----------
  private renderContacts(body: HTMLElement): void {
    const box = el('div', 'pnl');
    const p = el('p'); p.textContent = 'Написать мне можно в Telegram.'; box.append(p);
    const cta = el('div', 'cta'); cta.append(tgLink('Открыть Telegram'));
    body.append(box, cta);
  }

  // ---------- Гардероб ----------
  private async openWardrobe(opener: HTMLElement | null = null, fromHash = false): Promise<void> {
    const mobile = this.root.getBoundingClientRect().width <= 720;
    const w = this.openWindow('wardrobe', mobile ? 'sheet' : 'panel', opener, fromHash);
    this.working = { ...this.committed };
    const cancel = () => { this.working = { ...this.committed }; this.closeWindow(); };
    this.header(w, 'Гардероб', cancel);

    const wd = el('div', 'wd');
    const portrait = el('div', 'portrait');
    const pcv = el('canvas');
    portrait.append(pcv);
    const cats = el('div', 'col'); cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Категории');
    const cells = el('div', 'cells'); cells.setAttribute('role', 'radiogroup');
    const left = el('div', 'col'); left.append(cats);
    const preset = el('button', 'btn orange preset', `${ICONS.user}<span>Образ Георгия</span>`);
    preset.setAttribute('aria-label', 'Применить образ Георгия');
    preset.addEventListener('click', () => {
      this.working = { ...GEORGY_APPEARANCE };
      this.bus.emit('preview', { ...this.working });
      void repaintPortrait(); void renderCells(true);
      renderCats();
    });
    left.append(preset);
    wd.append(portrait, left, cells);
    w.append(wd);

    let active: CategoryId = 'hairStyle';
    let seq = 0;
    const repaintPortrait = async () => {
      const mine = ++seq;
      await preloadAppearance(this.working);
      if (mine !== seq) return;
      const src = renderCharacterPreview(this.working, 'f', 'idle', 0, 3);
      pcv.width = src.width; pcv.height = src.height;
      pcv.getContext('2d')!.drawImage(src, 0, 0);
    };
    const renderCats = () => {
      cats.innerHTML = '';
      for (const c of WARDROBE) {
        const b = el('button', 'cat'); b.textContent = c.label;
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(c.id === active));
        b.addEventListener('click', () => { active = c.id; renderCats(); void renderCells(); });
        cats.append(b);
      }
    };
    const apply = (cat: WardrobeCategory, it: WardrobeItem) => {
      this.working = { ...this.working, [cat.id]: it.id };
      this.bus.emit('preview', { ...this.working });
      void repaintPortrait();
      cells.querySelectorAll('.cell').forEach((n) => n.setAttribute('aria-checked', String((n as HTMLElement).dataset.id === it.id)));
      // цвет волос и кожа меняют вид миниатюр других категорий
      if (cat.id === 'hairColor' || cat.id === 'skin') void renderCells(true);
    };
    const renderCells = async (keepScroll = false) => {
      const cat = WARDROBE.find((c) => c.id === active)!;
      const top = cells.scrollTop;
      cells.setAttribute('aria-label', cat.label);
      if (cat.id === 'hairStyle') {
        const col = findItem('hairColor', this.working.hairColor).color!;
        await Promise.all(HAIR_STYLES.map((s) => preloadHair(s, col)));
      } else await preloadAppearance(this.working);
      if (active !== cat.id) return;
      cells.innerHTML = '';
      for (const it of cat.items) {
        const b = el('button', 'cell');
        b.dataset.id = it.id;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(this.working[cat.id] === it.id));
        b.setAttribute('aria-label', it.label);
        const th = el('span', 'th');
        if (cat.kind === 'color') { const sw = el('span', 'sw'); sw.style.background = it.color ?? '#fff'; th.append(sw); }
        else {
          const crop = CROPS[cat.id];
          th.append(renderCharacterCrop({ ...this.working, [cat.id]: it.id }, crop[0], crop[1], crop[2], crop[3], 3));
        }
        const label = el('span'); label.textContent = it.label;
        b.append(th, label);
        b.addEventListener('click', () => apply(cat, it));
        cells.append(b);
      }
      if (keepScroll) cells.scrollTop = top;
    };
    renderCats();
    await Promise.all([renderCells(), repaintPortrait()]);

    const foot = el('div', 'foot');
    const bReset = el('button', 'btn dark grow', `${ICONS.reset}<span class="tx">Сбросить</span>`);
    bReset.setAttribute('aria-label', 'Сбросить к стандартному образу');
    const bCancel = el('button', 'btn dark', `<span>Отмена</span>`);
    const bOk = el('button', 'btn orange', `${ICONS.check}<span>Подтвердить</span>`);
    bReset.addEventListener('click', () => {
      this.working = { ...DEFAULT_APPEARANCE };
      this.bus.emit('preview', { ...this.working });
      void repaintPortrait(); void renderCells(true);
    });
    bCancel.addEventListener('click', cancel);
    bOk.addEventListener('click', () => {
      this.committed = { ...this.working };
      saveAppearance(this.committed);
      this.opts.onAppearanceSaved?.(this.committed);
      this.closeWindow();
      this.toast('Образ сохранён');
    });
    foot.append(bReset, bCancel, bOk);
    w.append(foot);
    this.setTitle('Гардероб');
    this.applyInset();
  }

  // ---------- клавиатура ----------
  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.win) this.closeWindow();
    else if (this.menu) this.closeMenu();
  };
}

/** Области миниатюр на холсте персонажа (x, y, ширина, высота). */
const CROPS: Record<CategoryId, [number, number, number, number]> = {
  skin: [0, 0, 1, 1], hairColor: [0, 0, 1, 1],
  hairStyle: [10, 0, 52, 64], accessory: [10, 0, 52, 66], brows: [10, 0, 52, 64], beard: [10, 0, 52, 64],
  top: [8, 44, 56, 46], bottom: [12, 70, 48, 34], shoes: [14, 90, 44, 20],
};
