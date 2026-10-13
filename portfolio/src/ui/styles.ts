import { FONT_FAMILY } from './fonts';

// Светлый плоский стиль (по макету в Figma): белые окна, синяя шапка, светлые панели, тёмный текст, мягкие тени.
// Силуэт города — тонкий декор внизу окон.
function skyline(fill: string, height = 150): string {
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let x = 0;
  let out = '';
  while (x < 1400) {
    const w = 34 + rnd() * 56, h = 40 + rnd() * (height - 70);
    out += `<rect x="${x.toFixed(1)}" y="${(height - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    x += w + (rnd() < 0.4 ? 6 : 0);
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='${height}' viewBox='0 0 1400 ${height}'>${out}</svg>`)}")`;
}
const CITY = skyline('rgba(80,154,249,.12)');

export const CSS = `
:host{all:initial;display:block;width:100%;height:100%}
*{box-sizing:border-box}
.root{--blue:#509af9;--blue-d:#3f86e6;--tint:#e9f2ff;--surface:#f8f9fd;--cont:#f2f5fe;--text:#141519;--muted:rgba(20,21,25,.62);--line:rgba(20,21,25,.1);
  --accent:#ffc23d;--accent-d:#ffb21a;--accent-text:#3b2600;--sh:0 2px 8px rgba(20,21,25,.08);
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;color:var(--text);
  font-family:${FONT_FAMILY};font-size:15px;line-height:1.45;font-weight:500;-webkit-tap-highlight-color:transparent;user-select:none;
  background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%)}
.root::after{content:'';position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,18,34,.5) 100%);pointer-events:none}
.stage{position:absolute;inset:0;z-index:1}
.stage canvas{width:100%!important;height:100%!important;display:block;touch-action:manipulation;outline:none}
button,a{font:inherit;color:inherit}
button{cursor:pointer}
/* кнопки: плоские */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 18px;border:0;border-radius:10px;background:var(--blue);color:#fff;font-weight:600;text-decoration:none;
  box-shadow:var(--sh);transition:background .15s,transform .08s;white-space:nowrap}
.btn:hover{background:var(--blue-d)}
.btn:active{transform:translateY(1px)}
.btn.orange{background:var(--accent);color:var(--accent-text)}.btn.orange:hover{background:var(--accent-d)}
.btn.dark{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--line)}.btn.dark:hover{background:var(--cont)}
.btn.dark svg{color:var(--blue)}
.btn.icon{padding:0;width:42px}
.btn:focus-visible,.cat:focus-visible,.cell:focus-visible,.sv-card:focus-visible,.close:focus-visible,.menu a:focus-visible,a:focus-visible{outline:3px solid rgba(80,154,249,.55);outline-offset:2px}
.hud{position:absolute;inset:0;z-index:3;pointer-events:none}
.hud>*{pointer-events:auto}
.actions{position:absolute;right:14px;top:14px;display:flex;gap:8px}
.actions .btn{background:#fff;color:var(--text);box-shadow:0 2px 10px rgba(7,40,60,.25)}.actions .btn:hover{background:var(--cont)}
.actions .btn svg{color:var(--blue)}
.tip{position:absolute;transform:translate(-50%,-100%);margin-top:-8px;padding:6px 12px;border-radius:8px;background:#fff;color:var(--text);font-weight:600;font-size:14px;
  box-shadow:0 6px 20px rgba(7,40,60,.3);pointer-events:none;opacity:0;transition:opacity .12s;white-space:nowrap}
.tip::after{content:'';position:absolute;left:50%;bottom:-5px;width:10px;height:10px;background:#fff;transform:translateX(-50%) rotate(45deg);border-radius:2px}
.tip.on{opacity:1}
.toast{position:absolute;left:50%;top:70px;transform:translate(-50%,-8px);max-width:calc(100% - 28px);padding:10px 18px;border-radius:12px;background:#fff;color:var(--text);box-shadow:0 8px 24px rgba(7,40,60,.3);
  font-weight:600;text-align:center;opacity:0;transition:.25s;pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
.hint{position:absolute;left:50%;top:70px;transform:translate(-50%,-6px);max-width:calc(100% - 28px);padding:10px 20px;border-radius:12px;background:#fff;color:var(--text);
  box-shadow:0 8px 24px rgba(7,40,60,.3);font-weight:600;text-align:center;pointer-events:none;opacity:0;transition:opacity .7s ease,transform .7s ease}
.hint.on{opacity:1;transform:translate(-50%,0)}
.hint.off{opacity:0;transform:translate(-50%,-4px);transition:opacity 1.4s ease,transform 1.4s ease}
.hidden{display:none!important}
/* меню разделов */
.menu{position:absolute;right:14px;top:66px;z-index:4;width:min(250px,calc(100% - 28px));padding:8px;border-radius:12px;background:var(--cont);
  box-shadow:0 12px 36px rgba(7,40,60,.35);display:flex;flex-direction:column;gap:6px;animation:pop .18s}
.menu a{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 18px 0 12px;border-radius:10px;background:var(--surface);color:var(--text);text-decoration:none;font-weight:600;box-shadow:var(--sh);cursor:pointer}
.menu a svg{flex:none;color:var(--blue)}
.menu a:hover,.menu a.on{background:var(--blue);color:#fff}.menu a:hover svg,.menu a.on svg{color:#fff}
/* окна */
.scrim{position:absolute;inset:0;background:rgba(20,21,25,.45);z-index:5;animation:fade .2s}
.win{position:absolute;z-index:6;display:flex;flex-direction:column;background:#fff;color:var(--text);border-radius:12px;
  box-shadow:0 24px 64px rgba(7,25,40,.4),0 2px 8px rgba(20,21,25,.1);animation:pop .22s cubic-bezier(.2,.9,.3,1.15);user-select:text;overflow:hidden}
.win.modal{left:50%;top:50%;transform:translate(-50%,-50%);width:min(var(--w,700px),calc(100% - 24px));max-height:calc(100% - 28px)}
.win.panel{right:14px;top:66px;max-height:calc(100% - 80px);width:min(var(--w,420px),calc(100% - 28px))}
.win.panel.tall{bottom:14px}
.win:focus{outline:none}
.win header{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:48px;flex:none;background:var(--blue);color:#fff}
.win header h2{grid-column:2;grid-row:1;margin:0;padding:0 8px;text-align:center;font-size:19px;font-weight:600;letter-spacing:-.1px}
.win header .back{grid-column:1;grid-row:1;justify-self:start;margin-left:8px;background:rgba(255,255,255,.2);color:#fff;box-shadow:none}
.win header .back:hover{background:rgba(255,255,255,.3)}.win header .back svg{color:#fff}
.close{grid-column:3;grid-row:1;justify-self:end;display:grid;place-items:center;width:40px;height:40px;margin-right:6px;border:0;border-radius:8px;background:transparent;color:#fff}
.close:hover{background:rgba(255,255,255,.2)}
.body{position:relative;padding:14px 16px 16px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0;background:${CITY} repeat-x left bottom/auto 110px}
.body>*{position:relative}
.pnl{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.pnl p{margin:0 0 8px}.pnl p:last-child{margin:0}
.lbl{margin:14px 0 8px;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--blue)}
/* Обо мне */
.ab{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:start}
.portrait{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
.portrait canvas{display:block;width:100%;max-width:150px;height:auto}
.ribbon{width:100%;padding:8px 10px;border-radius:10px;background:var(--blue);color:#fff;font-weight:600;font-size:13.5px;line-height:1.2;text-align:center}
.nm{margin:0;text-align:center;font-size:26px;font-weight:700;letter-spacing:-.4px;line-height:1.15}
.yrs{margin:4px 0 0;text-align:center;font-weight:600;color:var(--blue)}
.tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:12px 0}
.tag{padding:5px 14px;border-radius:999px;background:var(--blue);color:#fff;font-size:13px;font-weight:600}
.awards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.award{padding:12px 10px 14px;border-radius:10px;background:var(--surface);border:1px solid var(--line);text-align:center}
.award .ic{width:54px;height:54px;margin:0 auto 6px}
.award .ic svg{width:100%;height:100%}
.award b{display:block;margin-bottom:4px;font-size:14px;line-height:1.25;font-weight:600}
.award span{display:block;font-size:13px;line-height:1.4;color:var(--muted);font-weight:500}
.cta{display:flex;justify-content:center;margin-top:14px}
/* услуги */
.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sv-card{display:block;padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;box-shadow:var(--sh);text-align:center;transition:transform .12s,box-shadow .15s}
.sv-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(20,21,25,.14)}
.sv-card .art{display:block;aspect-ratio:220/150}.sv-card .art svg{display:block;width:100%;height:100%}
.sv-card .lab{display:grid;place-items:center;min-height:46px;padding:6px 8px;background:var(--blue);color:#fff;font-weight:600;font-size:14px;line-height:1.2}
.sv-price{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sv-price span{font-weight:600}
.sv-detail{display:grid;grid-template-columns:230px 1fr;gap:14px;align-items:start}
.sv-detail .art{border:1px solid var(--line);border-radius:10px;overflow:hidden}.sv-detail .art svg{display:block;width:100%}
.sv-detail h3{margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-.3px}
.inc{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
.inc.pnl{padding:12px 14px}
.inc li{position:relative;padding-left:20px;font-size:14px;line-height:1.35}
.inc li::before{content:'';position:absolute;left:2px;top:4px;width:9px;height:5px;border-left:2.5px solid var(--blue);border-bottom:2.5px solid var(--blue);transform:rotate(-45deg)}
.sv-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
/* проекты */
.pj-empty{display:grid;justify-items:center;gap:10px;text-align:center;padding:6px 0}
.pj-empty .art{width:min(260px,70%)}.pj-empty .art svg{display:block;width:100%}
.pj-empty h3{margin:0;font-size:20px;font-weight:700;letter-spacing:-.3px}
.pj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.pj{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;box-shadow:var(--sh)}
.pj .im{aspect-ratio:16/10;background:linear-gradient(135deg,#9cc4fb,#509af9) center/cover}
.pj .tx{padding:10px 12px 12px}.pj b{display:block;font-size:16px;font-weight:600}.pj em{display:inline-block;margin:4px 0;padding:1px 10px;border-radius:999px;background:var(--tint);color:var(--blue-d);font-style:normal;font-weight:600;font-size:12px}
.pj p{margin:4px 0 0;font-size:13.5px;color:var(--muted)}.pj small{display:block;margin-top:6px;font-weight:600;color:var(--blue-d)}
/* Telegram (экран телевизора) */
.tv{display:grid;justify-items:center;gap:12px;text-align:center}
.tv .screen{width:100%;aspect-ratio:16/10;display:grid;place-items:center;border:6px solid #1b2230;border-radius:12px;background:linear-gradient(160deg,#59c4ff,#2d8fe0 55%,#1a5bb0);box-shadow:var(--sh),inset 0 0 40px rgba(255,255,255,.18)}
.tv .screen svg{width:30%;filter:drop-shadow(0 4px 8px rgba(0,30,80,.45))}
.tv h3{margin:0;font-size:20px;font-weight:700;letter-spacing:-.3px}.tv p{margin:0;color:var(--muted)}
.tv .url{font-weight:600;color:var(--blue-d)}
/* гардероб */
.wd{display:grid;grid-template-columns:150px 118px minmax(0,1fr);gap:10px;min-height:0;flex:1;padding:12px;overflow:hidden}
.wd .portrait{align-self:start}
.wd .col{min-height:0;display:flex;flex-direction:column;gap:6px;overflow:auto}
.cat{min-height:40px;padding:0 10px;border:0;border-radius:10px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);font-weight:600;font-size:13.5px;text-align:left;color:var(--text)}
.cat:hover{background:var(--cont)}
.cat[aria-selected=true]{background:var(--blue);color:#fff;box-shadow:none}
.cat.preset,.preset{margin-top:6px;min-height:40px;padding:0 10px;font-size:13px}
.cells{min-height:0;overflow:auto;padding:10px;border-radius:10px;background:var(--surface);border:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;align-content:start}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;min-height:98px;padding:6px 4px 5px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text);font-weight:600;font-size:11.5px;line-height:1.15;text-align:center}
.cell:hover{border-color:rgba(80,154,249,.6)}
.cell[aria-checked=true]{border-color:var(--blue);box-shadow:0 0 0 2px rgba(80,154,249,.35)}
.cell .th{display:grid;place-items:center;width:100%;height:66px;overflow:hidden}
.cell .th canvas{display:block;height:64px;width:auto;max-width:100%}
.cell .sw{width:42px;height:42px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--line),inset 0 -6px 8px rgba(0,0,0,.12)}
.foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 12px;flex:none;background:var(--surface);border-top:1px solid var(--line)}
.foot .grow{margin-right:auto}
/* загрузка и ошибка */
.loader,.error{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%);text-align:center;padding:20px;color:#fff}
.loader b{font-size:20px;font-weight:600}
.loader .bar{width:min(260px,70vw);height:8px;margin:14px auto 0;border-radius:999px;background:rgba(255,255,255,.22);overflow:hidden}
.loader .bar i{display:block;height:100%;width:0;background:#fff;border-radius:999px;transition:width .15s}
.error .box{max-width:360px}.error h2{margin:0 0 8px;font-weight:600}.error p{margin:0;opacity:.85}
.error .row{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}
@keyframes fade{from{opacity:0}}@keyframes pop{from{opacity:0;scale:.96}}
@media (max-width:820px){
  .ab{grid-template-columns:1fr}.ab .portrait{max-width:210px;margin:0 auto}
  .sv-detail{grid-template-columns:1fr}.sv-detail .art{max-width:300px}
  .awards{grid-template-columns:1fr}
}
@media (max-width:720px){
  .actions .btn .t{display:none}.actions .btn{padding:0;width:42px}
  .win.modal{width:calc(100% - 16px);max-height:calc(100% - 16px)}
  .win.panel,.win.sheet{left:8px;right:8px;top:auto;bottom:8px;width:auto;height:min(64%,500px);--w:auto}
  .sv-grid{grid-template-columns:1fr 1fr}.inc{grid-template-columns:1fr}
  .wd{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);padding:8px;gap:8px}
  .wd .portrait{display:none}
  .wd .col{flex-direction:row;overflow-x:auto;overflow-y:hidden;flex:none}.cat{flex:none}
  .nm{font-size:22px}
  .foot{flex-wrap:nowrap}.foot .btn{padding:0 12px;font-size:14px}.foot .grow .tx{display:none}.foot .grow{padding:0;width:42px}
}
@media (max-width:420px){.sv-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
