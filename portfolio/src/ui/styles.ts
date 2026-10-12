import { FONT_FAMILY } from './fonts';

// Силуэт ночного города (как на панелях референса). Строится один раз, кодируется в data-URI.
function skyline(fill: string, win: string, height = 220): string {
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let x = 0;
  let out = '';
  while (x < 1400) {
    const w = 34 + rnd() * 56, h = 50 + rnd() * (height - 90);
    out += `<rect x="${x.toFixed(1)}" y="${(height - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    for (let wy = height - h + 10; wy < height - 8; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 11) if (rnd() < 0.28) out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="5" height="7" fill="${win}"/>`;
    x += w + (rnd() < 0.4 ? 6 : 0);
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='${height}' viewBox='0 0 1400 ${height}'>${out}</svg>`)}")`;
}
const CITY_PANEL = skyline('rgba(7,55,100,.34)', 'rgba(120,200,255,.16)', 150);

const GLOSS = 'linear-gradient(180deg,#63c3f7 0%,#3aa2e6 46%,#1f82cc 50%,#2f98e0 100%)';
const GLOSS_DK = 'linear-gradient(180deg,#3d8fd0 0%,#2a76b6 46%,#1e629d 50%,#2670aa 100%)';
const GLOSS_OR = 'linear-gradient(180deg,#ffd45a 0%,#ffb82e 46%,#f08a12 50%,#f7a21f 100%)';

export const CSS = `
:host{all:initial;display:block;width:100%;height:100%}
*{box-sizing:border-box}
.root{--ink:#0d3a5f;--text:#fff;--soft:rgba(255,255,255,.8);--edge:#8fd1fa;--gold:#f6b93b;
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;color:var(--text);
  font-family:${FONT_FAMILY};font-size:15px;line-height:1.4;font-weight:600;-webkit-tap-highlight-color:transparent;user-select:none;
  background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%)}
.root::after{content:'';position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,18,34,.5) 100%);pointer-events:none}
.stage{position:absolute;inset:0;z-index:1}
.stage canvas{width:100%!important;height:100%!important;display:block;touch-action:manipulation;outline:none}
button,a{font:inherit;color:inherit}
button{cursor:pointer}
/* кнопки: глянцевые, как в референсе */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 18px;border:1px solid #a5defe;border-radius:10px;background:${GLOSS};
  box-shadow:0 2px 0 #0f4d80,0 4px 8px rgba(0,25,50,.35),inset 0 1px 0 rgba(255,255,255,.55);color:#fff;font-weight:800;text-decoration:none;
  text-shadow:0 1px 2px rgba(0,40,80,.7);transition:transform .08s,filter .15s;white-space:nowrap}
.btn:hover{filter:brightness(1.1)}
.btn:active{transform:translateY(2px);box-shadow:0 0 0 #0f4d80,inset 0 1px 0 rgba(255,255,255,.4)}
.btn.orange{background:${GLOSS_OR};border-color:#ffe39a;box-shadow:0 2px 0 #9a560a,0 4px 8px rgba(40,20,0,.35),inset 0 1px 0 rgba(255,255,255,.65);color:#4a2700;text-shadow:0 1px 0 rgba(255,255,255,.5)}
.btn.dark{background:${GLOSS_DK};border-color:#6fb4e3}
.btn.icon{padding:0;width:42px}
.btn:focus-visible,.cat:focus-visible,.cell:focus-visible,.sv-card:focus-visible,.close:focus-visible,.menu a:focus-visible,a:focus-visible{outline:3px solid #ffe066;outline-offset:2px}
.hud{position:absolute;inset:0;z-index:3;pointer-events:none}
.hud>*{pointer-events:auto}
.actions{position:absolute;right:14px;top:14px;display:flex;gap:8px}
.tip{position:absolute;transform:translate(-50%,-100%);margin-top:-8px;padding:6px 12px;border:1px solid #cdb64d;border-radius:8px;background:linear-gradient(#fffbd6,#fff3a8);color:#3a3008;font-weight:800;font-size:14px;
  box-shadow:0 3px 8px rgba(0,20,40,.4);pointer-events:none;opacity:0;transition:opacity .12s;white-space:nowrap}
.tip::after{content:'';position:absolute;left:50%;bottom:-6px;width:10px;height:10px;background:#fff3a8;border-right:1px solid #cdb64d;border-bottom:1px solid #cdb64d;transform:translateX(-50%) rotate(45deg)}
.tip.on{opacity:1}
.toast{position:absolute;left:50%;top:70px;transform:translate(-50%,-8px);max-width:calc(100% - 28px);padding:9px 18px;border:1px solid #a5defe;border-radius:12px;background:${GLOSS_DK};box-shadow:0 4px 12px rgba(0,25,50,.5);
  font-weight:800;text-align:center;opacity:0;transition:.25s;pointer-events:none;text-shadow:0 1px 2px rgba(0,40,80,.7)}
.toast.on{opacity:1;transform:translate(-50%,0)}
.hint{position:absolute;left:50%;top:70px;transform:translate(-50%,-6px);max-width:calc(100% - 28px);padding:9px 20px;border:1px solid #a5defe;border-radius:12px;background:${GLOSS_DK};
  box-shadow:0 4px 12px rgba(0,25,50,.5);font-weight:800;text-align:center;text-shadow:0 1px 2px rgba(0,40,80,.7);pointer-events:none;opacity:0;transition:opacity .7s ease,transform .7s ease}
.hint.on{opacity:1;transform:translate(-50%,0)}
.hint.off{opacity:0;transform:translate(-50%,-4px);transition:opacity 1.4s ease,transform 1.4s ease}
.hidden{display:none!important}
/* меню разделов */
.menu{position:absolute;right:14px;top:66px;z-index:4;width:min(250px,calc(100% - 28px));padding:8px;border-radius:12px;background:linear-gradient(#2c82bf,#1a5c94);border:1px solid #7cc4f0;
  box-shadow:0 0 0 2px #0d3a5f,0 14px 36px rgba(0,16,32,.6),inset 0 1px 0 rgba(255,255,255,.35);display:flex;flex-direction:column;gap:6px;animation:pop .18s}
.menu a{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border:1px solid #a5defe;border-radius:10px;background:${GLOSS};box-shadow:0 2px 0 #0f4d80,inset 0 1px 0 rgba(255,255,255,.5);
  text-decoration:none;font-weight:800;text-shadow:0 1px 2px rgba(0,40,80,.7);cursor:pointer}
.menu a:hover{filter:brightness(1.1)}
.menu svg{flex:none}
/* окна */
.scrim{position:absolute;inset:0;background:rgba(0,16,32,.5);z-index:5;animation:fade .2s}
.win{position:absolute;z-index:6;display:flex;flex-direction:column;background:linear-gradient(180deg,#2c82bf 0,#1f6aa6 7%,#1a5c94 55%,#164f80 100%);border:1px solid #8fd1fa;border-radius:12px;
  box-shadow:0 0 0 2px #0d3a5f,0 16px 44px rgba(0,16,32,.65),inset 0 1px 0 rgba(255,255,255,.4);animation:pop .22s cubic-bezier(.2,.9,.3,1.15);user-select:text;overflow:hidden}
.win.modal{left:50%;top:50%;transform:translate(-50%,-50%);width:min(var(--w,700px),calc(100% - 24px));max-height:calc(100% - 28px)}
.win.panel{right:14px;top:66px;max-height:calc(100% - 80px);width:min(var(--w,420px),calc(100% - 28px))}
.win.panel.tall{bottom:14px}
.win:focus{outline:none}
.win header{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:48px;flex:none;background:linear-gradient(#58b4ec,#2d86c6 52%,#2679b8);border-bottom:1px solid rgba(170,224,255,.7);box-shadow:0 2px 6px rgba(0,30,60,.35)}
.win header h2{grid-column:2;grid-row:1;margin:0;padding:0 8px;text-align:center;font-size:18px;font-weight:900;letter-spacing:.2px;text-shadow:0 1px 2px rgba(0,40,80,.7)}
.win header .back{grid-column:1;grid-row:1;justify-self:start;margin-left:8px}
.close{grid-column:3;grid-row:1;justify-self:end;display:grid;place-items:center;width:40px;height:40px;margin-right:6px;border:0;border-radius:8px;background:transparent;color:#fff;filter:drop-shadow(0 1px 1px rgba(0,40,80,.6))}
.close:hover{background:rgba(255,255,255,.18)}
.body{position:relative;padding:14px 16px 16px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0;background:${CITY_PANEL} repeat-x left bottom/auto 120px}
.body>*{position:relative}
.pnl{background:rgba(7,50,92,.5);border:1px solid rgba(124,196,240,.4);border-radius:10px;padding:12px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.pnl p{margin:0 0 8px;color:var(--soft)}.pnl p:last-child{margin:0}
.lbl{margin:14px 0 8px;font-size:13px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;color:#bfe6ff;text-shadow:0 1px 1px rgba(0,30,60,.6)}
/* Обо мне (по образцу «Паспорта») */
.ab{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:start}
.portrait{position:relative;border-radius:10px;padding:8px 8px 52px;background:linear-gradient(#f4ecbc,#dcc979);border:3px solid #eea92c;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55),0 3px 0 #8a5a12,0 6px 12px rgba(0,20,40,.35);text-align:center}
.portrait canvas{display:block;width:100%;max-width:150px;height:auto;margin:0 auto}
.ribbon{position:absolute;left:6px;right:6px;bottom:6px;padding:6px 8px;border:1px solid #ffe39a;border-radius:8px;background:${GLOSS_OR};box-shadow:0 2px 0 #9a560a;
  font-weight:900;font-size:13px;line-height:1.15;color:#4a2700;text-shadow:0 1px 0 rgba(255,255,255,.5)}
.name{display:flex;align-items:center;gap:8px}
.star{position:relative;flex:none;width:60px;height:60px;display:grid;place-items:center;filter:drop-shadow(0 2px 2px rgba(0,30,60,.5))}
.star svg{position:absolute;inset:0;width:100%;height:100%}
.star b{position:relative;font-size:14px;letter-spacing:-.5px;font-weight:900;color:#fff;text-shadow:0 1px 2px rgba(0,50,100,.9);margin-top:2px}
.namebar{flex:1;min-width:0;padding:8px 12px;border:1px solid rgba(255,255,255,.5);border-radius:8px;background:linear-gradient(rgba(255,255,255,.28),rgba(255,255,255,.12));text-align:center;
  font-size:22px;font-weight:900;line-height:1.15;text-shadow:0 1px 2px rgba(0,40,80,.7)}
.yrs{margin:8px 0 0;text-align:center;font-weight:800;color:#ffe08a;text-shadow:0 1px 2px rgba(0,30,60,.7)}
.tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:10px 0}
.tag{padding:4px 12px;border:1px solid #a5defe;border-radius:999px;background:${GLOSS_DK};font-size:13px;font-weight:800;text-shadow:0 1px 1px rgba(0,40,80,.7)}
.awards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.award{padding:10px 8px 12px;border:1px solid rgba(124,196,240,.45);border-radius:10px;background:linear-gradient(rgba(5,40,76,.7),rgba(5,40,76,.45));text-align:center}
.award .ic{width:54px;height:54px;margin:0 auto 6px;filter:drop-shadow(0 2px 2px rgba(0,20,40,.5))}
.award .ic svg{width:100%;height:100%}
.award b{display:block;margin-bottom:4px;font-size:14px;line-height:1.2}
.award span{display:block;font-size:12.5px;line-height:1.35;color:var(--soft);font-weight:600}
.cta{display:flex;justify-content:center;margin-top:14px}
/* услуги (по образцу «Магазинов») */
.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sv-card{display:block;padding:0;border:1px solid #a5defe;border-radius:8px;overflow:hidden;background:#0b3f6b;box-shadow:0 3px 0 #0d3a5f,0 6px 12px rgba(0,20,40,.35);text-align:center;transition:transform .12s,filter .15s}
.sv-card:hover{transform:translateY(-3px);filter:brightness(1.08)}
.sv-card .art{display:block;aspect-ratio:220/150}.sv-card .art svg{display:block;width:100%;height:100%}
.sv-card .lab{display:grid;place-items:center;min-height:46px;padding:6px 8px;background:${GLOSS};border-top:1px solid #a5defe;font-weight:900;font-size:14px;line-height:1.15;text-shadow:0 1px 2px rgba(0,40,80,.7)}
.sv-price{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sv-price span{font-weight:800;color:#ffe08a}
.sv-detail{display:grid;grid-template-columns:230px 1fr;gap:14px;align-items:start}
.sv-detail .art{border:1px solid #a5defe;border-radius:8px;overflow:hidden;box-shadow:0 3px 0 #0d3a5f}.sv-detail .art svg{display:block;width:100%}
.sv-detail h3{margin:0 0 6px;font-size:20px;font-weight:900;text-shadow:0 1px 2px rgba(0,40,80,.6)}
.inc{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
.inc.pnl{padding:12px 14px}
.inc li{position:relative;padding-left:20px;font-size:14px;line-height:1.3}
.inc li::before{content:'';position:absolute;left:2px;top:4px;width:9px;height:5px;border-left:3px solid #ffd45a;border-bottom:3px solid #ffd45a;transform:rotate(-45deg)}
.sv-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
/* проекты */
.pj-empty{display:grid;justify-items:center;gap:10px;text-align:center;padding:6px 0}
.pj-empty .art{width:min(260px,70%)}.pj-empty .art svg{display:block;width:100%}
.pj-empty h3{margin:0;font-size:19px;font-weight:900}
.pj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.pj{border:1px solid #a5defe;border-radius:10px;overflow:hidden;background:rgba(5,40,76,.6);box-shadow:0 3px 0 #0d3a5f}
.pj .im{aspect-ratio:16/10;background:linear-gradient(135deg,#3a8fd0,#245f94) center/cover}
.pj .tx{padding:10px 12px 12px}.pj b{display:block;font-size:16px}.pj em{display:inline-block;margin:4px 0;padding:1px 10px;border-radius:999px;background:#ffd45a;color:#5a3800;font-style:normal;font-weight:800;font-size:12px}
.pj p{margin:4px 0 0;font-size:13.5px;color:var(--soft)}.pj small{display:block;margin-top:6px;font-weight:800;color:#bfe6ff}
/* Telegram (экран телевизора) */
.tv{display:grid;justify-items:center;gap:12px;text-align:center}
.tv .screen{width:100%;aspect-ratio:16/10;display:grid;place-items:center;border:6px solid #1b2230;border-radius:12px;background:linear-gradient(160deg,#59c4ff,#2d8fe0 55%,#1a5bb0);box-shadow:0 0 0 2px #0d3a5f,0 8px 16px rgba(0,20,40,.5),inset 0 0 40px rgba(255,255,255,.18)}
.tv .screen svg{width:30%;filter:drop-shadow(0 4px 8px rgba(0,30,80,.45))}
.tv h3{margin:0;font-size:20px;font-weight:900}.tv p{margin:0;color:var(--soft)}
.tv .url{font-weight:800;color:#ffe08a}
/* гардероб: рамка как «паспорт», ячейки как в инвентаре */
.wd{display:grid;grid-template-columns:150px 118px minmax(0,1fr);gap:10px;min-height:0;flex:1;padding:12px;overflow:hidden}
.wd .portrait{align-self:start;padding-bottom:10px}
.wd .col{min-height:0;display:flex;flex-direction:column;gap:6px;overflow:auto}
.cat.preset,.preset{margin-top:6px;min-height:40px;padding:0 10px;font-size:13px}
.cat{min-height:40px;padding:0 10px;border:1px solid #6fb4e3;border-radius:9px;background:${GLOSS_DK};box-shadow:0 2px 0 #0f4d80,inset 0 1px 0 rgba(255,255,255,.35);font-weight:800;font-size:13.5px;text-align:left;text-shadow:0 1px 1px rgba(0,40,80,.7);color:#fff}
.cat[aria-selected=true]{background:${GLOSS};border-color:#c6ecff;box-shadow:0 2px 0 #0f4d80,0 0 0 2px #ffe066,inset 0 1px 0 rgba(255,255,255,.6)}
.cells{min-height:0;overflow:auto;padding:10px;border-radius:10px;background:#eef3f6;box-shadow:inset 0 2px 6px rgba(0,30,60,.25);display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;align-content:start}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;min-height:98px;padding:6px 4px 5px;border:2px solid #b6c1c9;border-radius:8px;background:#fff;color:#24405c;font-weight:800;font-size:11.5px;line-height:1.1;text-align:center}
.cell:hover{border-color:#7fb4d8}
.cell[aria-checked=true]{border-color:#9ccc2a;box-shadow:0 0 0 2px rgba(156,204,42,.5)}
.cell .th{display:grid;place-items:center;width:100%;height:66px}
.cell .th{overflow:hidden}.cell .th canvas{display:block;height:64px;width:auto;max-width:100%}
.cell .sw{width:42px;height:42px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px #8aa0b0,inset 0 -6px 8px rgba(0,0,0,.18)}
.foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 12px;flex:none;background:linear-gradient(rgba(5,40,76,.1),rgba(5,40,76,.45));border-top:1px solid rgba(143,209,250,.5)}
.foot .grow{margin-right:auto}
/* загрузка и ошибка */
.loader,.error{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%);text-align:center;padding:20px}
.loader b{font-size:20px;font-weight:900}
.loader .bar{width:min(260px,70vw);height:16px;margin:14px auto 0;border:2px solid #a5defe;border-radius:999px;background:rgba(0,30,60,.5);overflow:hidden;box-shadow:inset 0 2px 4px rgba(0,0,0,.4)}
.loader .bar i{display:block;height:100%;width:0;background:${GLOSS_OR};transition:width .15s}
.error .box{max-width:360px}.error h2{margin:0 0 8px;font-weight:900}.error p{margin:0;color:var(--soft)}
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
  .namebar{font-size:19px}
  .foot{flex-wrap:nowrap}.foot .btn{padding:0 12px;font-size:14px}.foot .grow .tx{display:none}.foot .grow{padding:0;width:42px}
}
@media (max-width:420px){.sv-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
