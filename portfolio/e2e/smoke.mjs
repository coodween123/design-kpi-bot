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
const clickObj = async (id) => { const pt = await scene((s, a) => s.clientPosOfObject(a[0]), id); await p.mouse.click(pt.x, pt.y); };
const clickCell = async (x, y) => { const pt = await scene((s, a) => s.clientPosOfCell(a[0], a[1]), x, y); await p.mouse.click(pt.x, pt.y); };
const waitIdle = () => p.waitForFunction(() => { const s = document.getElementById('app').__portfolio.scene(); const d = s.debugState(); return !d.moving && d.anim === 'idle'; }, null, { timeout: 15000 });

// 1. Подсказка закрывается
await p.locator('.intro .btn').click();
ok(await p.locator('.intro').count() === 0, 'начальная подсказка закрывается');

// 2. Ход по полу
const s0 = await state();
await clickCell(8, 7);
await p.waitForTimeout(300);
ok((await state()).moving, 'после клика по полу персонаж идёт');
await p.screenshot({ path: `${OUT}/walking.png` });
await waitIdle();
const s1 = await state();
ok(s1.cell.x === 8 && s1.cell.y === 7, `персонаж дошёл до (8,7), был (${s0.cell.x},${s0.cell.y}), стал (${s1.cell.x},${s1.cell.y})`);

// 3. Клик в мебель (стол, занятая клетка): идём рядом, не внутрь
await clickCell(3, 0);
await waitIdle();
const s2 = await state();
ok(!(s2.cell.x >= 2 && s2.cell.x <= 4 && s2.cell.y === 0), `в стол не зашли, стоим в (${s2.cell.x},${s2.cell.y})`);

// 4. Ноутбук открывает окно проектов
await clickObj('laptop');
await p.waitForSelector('.win.modal', { timeout: 15000 });
ok((await p.locator('.win h2').innerText()) === 'Проекты', 'ноутбук открыл «Проекты»');
ok((await p.evaluate(() => location.hash)) === '#/projects', 'адрес раздела #/projects');
await p.screenshot({ path: `${OUT}/modal.png` });
await p.keyboard.press('Escape');
ok(await p.locator('.win').count() === 0, 'Esc закрывает окно');
ok((await p.evaluate(() => location.hash)) === '', 'адрес очищен после закрытия');

// 5. Документ, телевизор, дверь
for (const [id, title] of [['document', 'Резюме'], ['tv', 'Видео и презентации'], ['door', 'Контакты']]) {
  await clickObj(id);
  await p.waitForSelector('.win', { timeout: 15000 });
  ok((await p.locator('.win h2').innerText()) === title, `${id} → «${title}»`);
  await p.locator('.win .close').click();
  await p.waitForFunction(() => !document.getElementById('app').shadowRoot.querySelector('.win'));
}

// 6. Диван: садимся
await clickObj('sofa');
await p.waitForFunction(() => document.getElementById('app').__portfolio.scene().debugState().sitting, null, { timeout: 15000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/sitting.png` });
ok(true, 'персонаж сел на диван');
await clickCell(5, 6);
await waitIdle();
ok(!(await state()).sitting, 'после клика по полу персонаж встал и пошёл');

// 7. Гардероб: превью, отмена, подтверждение, сохранение
await clickObj('wardrobe');
await p.waitForSelector('.win.panel', { timeout: 15000 });
await p.waitForTimeout(500);
await p.getByRole('tab', { name: 'Причёска' }).click();
await p.getByRole('radio', { name: 'Длинные' }).click();
await p.getByRole('tab', { name: 'Верх' }).click();
await p.getByRole('radio', { name: 'Куртка' }).first().click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/wardrobe.png` });
await p.getByRole('button', { name: 'Отмена' }).click();
ok(await p.locator('.win').count() === 0, 'отмена закрывает гардероб');
ok(await p.evaluate(() => localStorage.getItem('avatar-portfolio:appearance:v1')) === null, 'после отмены ничего не сохранено');

await clickObj('wardrobe');
await p.waitForSelector('.win.panel');
await p.getByRole('tab', { name: 'Причёска' }).click();
await p.getByRole('radio', { name: 'Ёжик' }).click();
await p.getByRole('button', { name: 'Подтвердить' }).click();
const saved = await p.evaluate(() => localStorage.getItem('avatar-portfolio:appearance:v1'));
ok(!!saved && JSON.parse(saved).hairStyle === 'spiky', 'подтверждение сохранило образ');
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/after-confirm.png` });

// 8. Прямая ссылка на раздел и перезагрузка с сохранённым образом
await p.goto(URL_ + '#/resume');
await p.waitForSelector('.win', { timeout: 15000 });
ok((await p.locator('.win h2').innerText()) === 'Резюме', 'прямая ссылка #/resume открывает раздел');

// 9. Меню разделов
await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'Разделы' }).click();
await p.locator('.menu a', { hasText: 'Контакты' }).click();
await p.waitForSelector('.win');
ok((await p.locator('.win h2').innerText()) === 'Контакты', 'текстовое меню открывает раздел');

ok(errors.filter((e) => !/GL Driver|favicon/.test(e)).length === 0, 'нет ошибок в консоли' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
