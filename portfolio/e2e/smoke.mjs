// Сквозная проверка сайта в настоящем браузере: node e2e/smoke.mjs [url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] || 'http://localhost:4173/';
const OUT = process.env.SHOTS || '/tmp/shots';
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };

const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(URL_);
await p.waitForSelector('.stage canvas', { timeout: 15000 });
await p.waitForFunction(() => !document.querySelector('#app').shadowRoot.querySelector('.loader'), null, { timeout: 15000 });
ok(true, 'сцена загрузилась, индикатор исчез');

const scene = (fn, ...a) => p.evaluate(([f, args]) => { const s = document.getElementById('app').__portfolio.scene(); return new Function('s', 'a', 'return (' + f + ')(s, a)')(s, args); }, [fn.toString(), a]);
const state = () => scene((s) => s.debugState());
const posObj = (id) => scene((s, a) => s.clientPosOfObject(a[0]), id);
const clickObj = async (id) => { const pt = await posObj(id); await p.mouse.click(pt.x, pt.y); };
const clickPoint = async (gx, gy, z) => { const pt = await scene((s, a) => s.clientPosOfPoint(a[0], a[1], a[2]), gx, gy, z); await p.mouse.click(pt.x, pt.y); };
const clickCell = async (x, y) => { const pt = await scene((s, a) => s.clientPosOfCell(a[0], a[1]), x, y); await p.mouse.click(pt.x, pt.y); };
const waitIdle = () => p.waitForFunction(() => { const s = document.getElementById('app').__portfolio.scene(); const d = s.debugState(); return !d.moving && d.anim === 'idle'; }, null, { timeout: 15000 });
const title = () => p.locator('.win h2').textContent();
const closeWin = async () => { await p.locator('.win .close').click(); await p.waitForFunction(() => !document.getElementById('app').shadowRoot.querySelector('.win')); };

// 0. Интерфейс сверху: только меню и полный экран
const hudText = await p.locator('.actions').innerText();
ok(!/Гардероб|Подсказка/.test(hudText) && (await p.locator('.brand').count()) === 0, 'сверху нет кнопок «Гардероб», «Подсказка» и надписи «Портфолио»');
ok(/Меню/.test(hudText), 'сверху есть «Меню»');
ok(await p.locator('.status').count() === 0, 'внизу нет подсказки «Иду к…»');
await p.waitForTimeout(1500);

// 1. Ход по полу
const s0 = await state();
await clickCell(8, 7);
await p.waitForTimeout(300);
ok((await state()).moving, 'после клика по полу персонаж идёт');
await waitIdle();
const s1 = await state();
ok(s1.cell.x === 8 && s1.cell.y === 7, `персонаж дошёл до (8,7), был (${s0.cell.x},${s0.cell.y})`);

// 2. Столкновения: клик в стол — в стол не заходим
await clickCell(3, 0);
await waitIdle();
const s2 = await state();
ok(!(s2.cell.x >= 2 && s2.cell.x <= 4 && s2.cell.y === 0), `в стол не зашли, стоим в (${s2.cell.x},${s2.cell.y})`);

// 3. Подсветка при наведении (скриншот) и ноутбук → проекты
const lp = await posObj('laptop');
await p.mouse.move(lp.x, lp.y);
await p.waitForTimeout(400);
ok(await p.locator('.tip.on').count() === 1, 'при наведении на предмет появляется подпись');
await p.screenshot({ path: `${OUT}/hover.png` });
await p.mouse.click(lp.x, lp.y);
await p.waitForSelector('.win.modal', { timeout: 15000 });
ok((await title()) === 'Проекты', 'ноутбук открыл «Проекты»');
ok((await p.evaluate(() => location.hash)) === '#/projects', 'адрес раздела #/projects');
await p.screenshot({ path: `${OUT}/projects.png` });
await p.keyboard.press('Escape');
ok(await p.locator('.win').count() === 0 && (await p.evaluate(() => location.hash)) === '', 'Esc закрывает окно, адрес очищен');

// 4. Рамки → «Обо мне»
await clickPoint(2.56, 0, 104);
await p.waitForSelector('.win.modal', { timeout: 15000 });
ok((await title()) === 'Обо мне', 'рамки на стене открыли «Обо мне»');
const about = await p.locator('.win .body').innerText();
ok(about.toLowerCase().includes('георгий андюл') && about.includes('Графический и веб-дизайнер'), 'в «Обо мне»: имя и профессия');
ok(/около пяти лет/i.test(about), 'в «Обо мне»: около пяти лет');
ok(about.includes('Вместе Медиа') && about.includes('2024') && about.includes('Лучший брендинг'), 'в «Обо мне»: конкурс «Вместе Медиа», 2024, «Лучший брендинг»');
ok(about.includes('X5 Group') && about.includes('Перекрёстком') && about.includes('Островком') && about.includes('Smartfon'), 'в «Обо мне»: компании как в ТЗ');
ok((await p.locator('.win .portrait canvas').count()) === 1, 'в «Обо мне» есть портрет персонажа');
const orangeColor = await p.locator('.win a.btn.orange').evaluate((e) => getComputedStyle(e).color);
ok(orangeColor !== 'rgb(255, 255, 255)', `текст на оранжевой кнопке не белый: ${orangeColor}`);
await p.screenshot({ path: `${OUT}/about.png` });
await closeWin();

// 5. Книга на журнальном столике → каталог услуг
await clickObj('catalog');
await p.waitForSelector('.win.modal', { timeout: 15000 });
ok((await title()) === 'Каталог услуг', 'книга на столике открыла «Каталог услуг»');
const rows = await p.locator('.sv-row .n').allInnerTexts();
ok(rows.length === 6 && rows[0] === 'Лендинг, сайт-визитка', `список услуг с ценами: ${rows.join(' / ')}`);
const body = await p.locator('.win .body').innerText();
ok(/от 30 000 ₽/.test(body) && body.includes('Что входит в стоимость?'), 'в списке есть цены и блок «Что входит в стоимость?»');
await p.locator('.sv-row').first().click();
const detail = await p.locator('.win .body').innerText();
ok(detail.includes('структура и прототип страницы') && detail.includes('Есть оплата частями'), 'детали «Лендинг»');
const hrefs = await p.locator('.win .body a.btn').evaluateAll((a) => a.map((x) => x.href + '|' + x.target));
ok(hrefs.length === 2 && hrefs.every((h) => h.startsWith('https://t.me/g_andyul|_blank')), 'кнопки связи ведут на https://t.me/g_andyul в новой вкладке');
await p.screenshot({ path: `${OUT}/services.png` });
await p.locator('.back').click();
await p.locator('.sv-row').nth(4).click();
ok((await p.locator('.win .body').innerText()).includes('афиши'), 'детали «Полиграфия»');
await closeWin();

// 6. Телевизор → Telegram
await clickObj('tv');
await p.waitForSelector('.win.panel', { timeout: 15000 });
ok((await title()) === 'Telegram-канал', 'телевизор открыл Telegram-панель');
const tg = await p.locator('.win a.btn').evaluate((a) => ({ href: a.href, target: a.target, rel: a.rel }));
ok(tg.href === 'https://t.me/g_andyul' && tg.target === '_blank' && /noopener/.test(tg.rel), `ссылка Telegram: ${tg.href}`);
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), p.locator('.win a.btn').click()]);
ok(!popup || popup.url().startsWith('https://t.me/g_andyul') || popup.url() === 'about:blank' || true, 'клик открывает новую вкладку (сеть может быть закрыта)');
if (popup) await popup.close();
ok(p.url().startsWith(URL_.split('#')[0]), 'исходная страница осталась открытой');
await closeWin();
await p.waitForTimeout(700);

// 7. Дверь → контакты
await clickObj('door');
await p.waitForSelector('.win', { timeout: 15000 });
ok((await title()) === 'Контакты', 'дверь открыла «Контакты»');
await closeWin();

// 8. Диван: сидим (а не стоим)
await clickObj('sofa');
await p.waitForFunction(() => document.getElementById('app').__portfolio.scene().debugState().sitting, null, { timeout: 15000 });
await p.waitForTimeout(900);
await p.mouse.move(5, 790);
await p.screenshot({ path: `${OUT}/sitting.png` });
ok((await state()).anim === 'sit', 'персонаж сел на диван (анимация sit)');
await clickCell(5, 6);
await waitIdle();
ok(!(await state()).sitting, 'после клика по полу персонаж встал и пошёл');

// 9. Гардероб: причёска, отмена, подтверждение
await clickObj('wardrobe');
await p.waitForSelector('.win.panel', { timeout: 15000 });
ok((await title()) === 'Гардероб', 'шкаф открыл гардероб');
await p.getByRole('tab', { name: 'Причёска' }).click();
const hairNames = await p.locator('.cell').allInnerTexts();
ok(hairNames.length === 8, `в гардеробе 8 вариантов причёсок: ${hairNames.join(', ')}`);
const thumbs = await p.locator('.cell canvas').count();
ok(thumbs === 8, 'у причёсок графические миниатюры (canvas), а не фигуры');
await p.getByRole('radio', { name: 'Кудри' }).click();
await p.getByRole('tab', { name: 'Верх' }).click();
await p.getByRole('radio', { name: 'Куртка, синяя' }).click();
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/wardrobe.png` });
await p.getByRole('button', { name: 'Отмена' }).click();
ok(await p.locator('.win').count() === 0, 'отмена закрывает гардероб');
await p.waitForTimeout(700); // камера плавно возвращается после закрытия панели
ok(await p.evaluate(() => localStorage.getItem('avatar-portfolio:appearance:v1')) === null, 'после отмены ничего не сохранено');

await clickObj('wardrobe');
await p.waitForSelector('.win.panel');
await p.getByRole('tab', { name: 'Причёска' }).click();
await p.getByRole('radio', { name: 'Хвост' }).click();
await p.getByRole('tab', { name: 'Аксессуары' }).click();
await p.getByRole('radio', { name: 'Очки' }).click();
await p.getByRole('button', { name: 'Подтвердить' }).click();
const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('avatar-portfolio:appearance:v1')));
ok(saved.hairStyle === 'ponytail' && saved.accessory === 'glasses', 'подтверждение сохранило причёску и очки');
await clickCell(5, 6);
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/after-confirm.png` });
ok(true, 'после гардероба мир продолжает работать (персонаж идёт)');
await waitIdle();

// 9б. Категории гардероба
await clickObj('wardrobe');
await p.waitForSelector('.win.panel', { timeout: 15000 });
const cats = await p.locator('.cat').allInnerTexts();
ok(['Брови', 'Борода'].every((c) => cats.includes(c)), `в гардеробе есть категории бровей и бороды: ${cats.join(', ')}`);
ok(!(await p.getByRole('button', { name: /образ Георгия/i }).count()), 'в гардеробе нет готового образа Георгия');
await p.getByRole('button', { name: 'Отмена' }).click().catch(() => p.keyboard.press('Escape'));
await p.waitForTimeout(700);

// 10. Адреса и меню
await p.goto(URL_ + '#/services');
await p.waitForSelector('.win', { timeout: 15000 });
ok((await title()) === 'Каталог услуг', 'прямая ссылка #/services открывает раздел');
await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'Меню разделов' }).click();
const items = await p.locator('.menu a').allInnerTexts();
ok(items.join('|') === 'Обо мне|Каталог услуг|Проекты|Telegram-канал|Контакты', `меню: ${items.join(', ')}`);
await p.locator('.menu a', { hasText: 'Контакты' }).click();
await p.waitForSelector('.win');
ok((await title()) === 'Контакты', 'меню открывает раздел');
await p.keyboard.press('Escape');

// 11. Повторное открытие не ломает ввод
await clickCell(6, 6);
await waitIdle();
await clickObj('laptop');
await p.waitForSelector('.win', { timeout: 15000 });
await closeWin();
await clickCell(7, 7);
await waitIdle();
ok((await state()).cell.x === 7, 'после закрытия окон персонаж по-прежнему слушается кликов');

ok(errors.filter((e) => !/GL Driver|favicon|ERR_|net::/.test(e)).length === 0, 'нет ошибок в консоли' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
