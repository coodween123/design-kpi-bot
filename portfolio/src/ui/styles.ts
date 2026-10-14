import { DISPLAY_FAMILY, FONT_FAMILY } from './fonts';

// Стиль по макетам «Код Легенды»: светло-серый фон окон, белые карточки, нежно-голубые плашки, чёрные кнопки,
// узкий плотный шрифт для заголовков и синяя «рукописная» линия-акцент.
export const CSS = `
:host{all:initial;display:block;width:100%;height:100%}
*{box-sizing:border-box}
.root{--blue:#5a87f8;--blue-d:#3f6fe6;--peri:#bacffe;--tint:#e8efff;--surface:#f6f6f6;--cont:#f6f6f6;--text:#121419;--muted:rgba(18,20,25,.6);--line:rgba(18,20,25,.1);
  --disp:${DISPLAY_FAMILY};--sh:0 1px 4px rgba(18,20,25,.08);
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;color:var(--text);
  font-family:${FONT_FAMILY};font-size:15px;line-height:1.4;font-weight:500;-webkit-tap-highlight-color:transparent;user-select:none;
  background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%)}
.root::after{content:'';position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,18,34,.5) 100%);pointer-events:none}
.stage{position:absolute;inset:0;z-index:1}
.stage canvas{width:100%!important;height:100%!important;display:block;touch-action:manipulation;outline:none}
button,a{font:inherit;color:inherit}
button{cursor:pointer}
/* кнопки: чёрные, как в макете */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border:0;border-radius:10px;background:#000;color:#fff;font-weight:600;text-decoration:none;
  transition:background .15s,transform .08s;white-space:nowrap}
.btn:hover{background:#2a2d33}
.btn:active{transform:translateY(1px)}
.btn.orange{background:var(--peri);color:var(--text)}.btn.orange:hover{background:#a6c0fb}
.btn.dark{background:#fff;color:var(--blue);box-shadow:inset 0 0 0 1px var(--peri)}.btn.dark:hover{background:var(--tint)}
.btn.dark svg{color:var(--blue)}
.btn.icon{padding:0;width:46px}
.btn:focus-visible,.cat:focus-visible,.cell:focus-visible,.sv-row:focus-visible,.close:focus-visible,.menu a:focus-visible,a:focus-visible{outline:3px solid rgba(80,154,249,.55);outline-offset:2px}
.hud{position:absolute;inset:0;z-index:3;pointer-events:none}
.hud>*{pointer-events:auto}
.actions{position:absolute;right:14px;top:14px;display:flex;gap:8px}
.actions .btn{background:#fff;color:var(--text);box-shadow:0 2px 10px rgba(7,40,60,.25)}.actions .btn:hover{background:var(--tint)}
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
.menu{position:absolute;right:14px;top:66px;z-index:4;width:min(260px,calc(100% - 28px));padding:8px;border-radius:16px;background:#fff;
  box-shadow:0 12px 36px rgba(7,40,60,.35);display:flex;flex-direction:column;gap:6px;animation:pop .18s}
.menu a{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 16px 0 12px;border-radius:10px;background:var(--surface);color:var(--text);text-decoration:none;font-weight:600;cursor:pointer}
.menu a svg{flex:none;color:var(--blue)}
.menu a:hover,.menu a.on{background:var(--peri)}
/* окна */
.scrim{position:absolute;inset:0;background:rgba(20,21,25,.45);z-index:5;animation:fade .2s}
.win{position:absolute;z-index:6;display:flex;flex-direction:column;background:var(--surface);color:var(--text);border-radius:16px;
  box-shadow:0 24px 64px rgba(7,25,40,.45),0 2px 8px rgba(18,20,25,.1);animation:pop .22s cubic-bezier(.2,.9,.3,1.15);user-select:text;overflow:hidden}
.win.modal{left:50%;top:50%;transform:translate(-50%,-50%);width:min(var(--w,700px),calc(100% - 24px));max-height:calc(100% - 28px)}
.win.panel{right:14px;top:66px;max-height:calc(100% - 80px);width:min(var(--w,420px),calc(100% - 28px))}
.win.panel.tall{bottom:14px}
.win:focus{outline:none}
.win header{position:relative;display:flex;align-items:center;gap:10px;min-height:68px;flex:none;padding:14px 14px 4px 20px;color:var(--text)}
.win header h2{order:1;flex:1;margin:0;font-family:var(--disp);font-size:38px;line-height:1;font-weight:600;letter-spacing:.2px;text-transform:uppercase}
.win header .back{order:0;min-height:38px;padding:0 14px;background:#fff;color:var(--text);box-shadow:var(--sh)}
.win header .back:hover{background:var(--tint)}.win header .back svg{color:var(--blue)}
.close{order:2;display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:#fff;color:var(--text);box-shadow:var(--sh)}
.close:hover{background:var(--peri)}
.body{position:relative;padding:12px 18px 20px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0}
.body>*{position:relative}
.pnl{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--sh)}
.pnl p{margin:0 0 8px}.pnl p:last-child{margin:0}
.lbl{margin:16px 0 8px;font-size:17px;font-weight:600;color:var(--text)}
/* Обо мне */
.ab{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:start}
.portrait{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px;border-radius:12px;background:#fff;box-shadow:var(--sh)}
.portrait canvas{display:block;width:100%;max-width:150px;height:auto}
.ribbon{width:100%;padding:8px 10px;border-radius:10px;background:var(--peri);color:var(--text);font-weight:600;font-size:13.5px;line-height:1.2;text-align:center}
.nm{position:relative;margin:0;text-align:left;font-family:var(--disp);text-transform:uppercase;font-size:50px;font-weight:600;letter-spacing:.2px;line-height:.95}
.nm::after{content:'';position:absolute;left:-6px;right:-6px;top:10%;height:90%;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 60' preserveAspectRatio='none'%3E%3Cpath d='M2 46 L110 6 L58 50 L206 10 L170 54 L298 24' fill='none' stroke='%235a87f8' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center/100% 100% no-repeat}
.yrs{margin:8px 0 0;font-size:17px;font-weight:600;color:var(--text)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.tag{padding:6px 14px;border-radius:10px;background:var(--peri);color:var(--text);font-size:14px;font-weight:600}
.awards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.award{padding:14px 12px 16px;border-radius:12px;background:#fff;box-shadow:var(--sh);text-align:center}
.award .ic{width:54px;height:54px;margin:0 auto 6px}
.award .ic svg{width:100%;height:100%}
.award b{display:block;margin-bottom:4px;font-size:15px;line-height:1.25;font-weight:700}
.award span{display:block;font-size:13px;line-height:1.4;color:var(--muted);font-weight:500}
.cta{display:flex;justify-content:center;margin:14px 0}
/* общие крупные заголовки в окнах */
.big{position:relative;width:fit-content;max-width:100%;margin:4px 0 14px;font-family:var(--disp);text-transform:uppercase;font-weight:600;font-size:60px;line-height:.95;letter-spacing:.2px}
.big.sm{font-size:40px;line-height:1}
.big .star{display:inline-block;width:.62em;height:.62em;margin:0 .1em;vertical-align:.02em;color:var(--blue);transform:rotate(12deg)}
.big .star svg{width:100%;height:100%}
.big.sm::after,.big:not(.sm)::after{content:'';position:absolute;left:-8px;right:-14px;top:4%;height:92%;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 60' preserveAspectRatio='none'%3E%3Cpath d='M2 46 L110 6 L58 50 L206 10 L170 54 L298 24' fill='none' stroke='%235a87f8' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center/100% 100% no-repeat}
/* услуги: список с ценами */
.sv-lead{margin:0 0 6px;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}
.sv-rows{display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:var(--sh);padding:2px 18px}
.sv-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;color:var(--text);border-radius:0;transition:padding .15s}
.sv-row:last-child{border-bottom:0}
.sv-row:hover{padding-left:6px}.sv-row:hover .n{color:var(--blue)}
.sv-row .n{font-size:24px;font-weight:600;letter-spacing:-.4px;line-height:1.1}
.sv-row .pr{display:flex;flex-direction:column;align-items:flex-end;flex:none}
.sv-row .pr b{font-size:24px;font-weight:700;letter-spacing:-.4px;white-space:nowrap}
.sv-row .pr i{font-size:13px;font-style:italic;color:var(--muted);white-space:nowrap}
.sv-foot{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px;align-items:end}
.sv-foot h4{margin:0 0 8px;font-size:16px;font-weight:700;color:var(--muted)}
.sv-foot ul{margin:0;padding:0;list-style:none;font-size:14px;line-height:1.5}
.sv-foot .cl{display:grid;gap:10px;justify-items:end;text-align:right}
.sv-foot .cl p{margin:0;font-size:15px;line-height:1.35;color:var(--muted);font-weight:600}.sv-foot .cl p b{color:var(--text)}
.sv-detail{display:grid;grid-template-columns:230px 1fr;gap:14px;align-items:start}
.sv-detail .art{border-radius:12px;overflow:hidden;background:#fff;box-shadow:var(--sh)}.sv-detail .art svg{display:block;width:100%}
.sv-detail h3{margin:0 0 8px;font-family:var(--disp);text-transform:uppercase;font-size:34px;line-height:1;font-weight:600}
.inc{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.inc.pnl{padding:14px 16px}
.inc li{position:relative;padding-left:32px;min-height:24px;font-size:14.5px;line-height:1.35}
.inc li::before{content:'';position:absolute;left:0;top:-1px;width:24px;height:24px;border-radius:6px;background:var(--peri)}
.inc li::after{content:'';position:absolute;left:7px;top:5px;width:10px;height:5px;border-left:2px solid var(--text);border-bottom:2px solid var(--text);transform:rotate(-45deg)}
.sv-pricebar{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.sv-pricebar .main{display:flex;align-items:baseline;gap:12px;flex:1;min-width:230px;padding:14px 18px;border-radius:10px;background:var(--peri)}
.sv-pricebar .main b{font-size:26px;font-weight:700;letter-spacing:-.4px;white-space:nowrap}.sv-pricebar .main i{font-size:14px;font-style:italic;color:var(--muted)}
.sv-pricebar .ins{display:grid;place-items:center;padding:0 22px;min-height:56px;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px var(--peri);color:var(--blue);font-weight:600}
.sv-note{margin:8px 0 0;font-size:13px;color:var(--muted)}
.sv-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
/* проекты */
.pj-soon{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.pj-ph{display:flex;flex-direction:column;gap:3px;padding:8px 8px 12px;border-radius:12px;background:#fff;box-shadow:var(--sh)}
.pj-ph .im{display:grid;place-items:center;aspect-ratio:16/10;margin-bottom:6px;border-radius:8px;background:repeating-linear-gradient(135deg,#e8efff 0 10px,#dbe6ff 10px 20px)}
.pj-ph .im span{padding:3px 12px;border-radius:999px;background:#fff;color:var(--blue);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.pj-ph b{padding:0 4px;font-size:17px;font-weight:700}.pj-ph small{padding:0 4px;color:var(--muted);font-size:13px}
.pj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.pj{border-radius:12px;overflow:hidden;background:#fff;box-shadow:var(--sh)}
.pj .im{aspect-ratio:16/10;background:linear-gradient(135deg,#d9e5ff,#bacffe) center/cover}
.pj .tx{padding:10px 12px 12px}.pj b{display:block;font-size:16px;font-weight:600}.pj em{display:inline-block;margin:4px 0;padding:1px 10px;border-radius:999px;background:var(--peri);color:var(--text);font-style:normal;font-weight:600;font-size:12px}
.pj p{margin:4px 0 0;font-size:13.5px;color:var(--muted)}.pj small{display:block;margin-top:6px;font-weight:600;color:var(--blue-d)}
/* Telegram (экран телевизора) */
.tg-hero{display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--peri)}
.tg-hero .av{display:grid;place-items:center;flex:none;width:58px;height:58px;border-radius:50%;background:#000;color:#fff}.tg-hero .av svg{width:28px;height:28px}
.tg-hero b{display:block;font-size:20px;font-weight:700}.tg-hero small{display:block;margin-top:2px;font-size:14px;line-height:1.3;color:rgba(18,20,25,.7);font-weight:600}
.tg-posts{display:flex;flex-direction:column;gap:8px}
.tg-post{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:12px;background:#fff;box-shadow:var(--sh)}
.tg-post em{align-self:flex-start;padding:1px 10px;border-radius:999px;background:var(--peri);font-style:normal;font-size:12px;font-weight:700}
.tg-post b{font-size:15.5px;line-height:1.3;font-weight:600}
/* контакты */
.steps{display:flex;flex-direction:column;gap:8px}
.step{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;background:#fff;box-shadow:var(--sh)}
.step .no{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:8px;background:var(--peri);font-family:var(--disp);font-size:24px;font-weight:600}
.step b{display:block;font-size:16px;font-weight:700}.step .d{display:block;font-size:14px;color:var(--muted)}
/* гардероб */
.wd{display:grid;grid-template-columns:150px 118px minmax(0,1fr);gap:10px;min-height:0;flex:1;padding:12px;overflow:hidden}
.wd .portrait{align-self:start}
.wd .col{min-height:0;display:flex;flex-direction:column;gap:6px;overflow:auto}
.cat{min-height:42px;padding:0 10px;border:0;border-radius:10px;background:#fff;box-shadow:var(--sh);font-weight:600;font-size:13.5px;text-align:left;color:var(--text)}
.cat:hover{background:var(--tint)}
.cat[aria-selected=true]{background:var(--peri);box-shadow:inset 0 0 0 1.5px var(--blue)}
.cat.preset,.preset{margin-top:6px;min-height:40px;padding:0 10px;font-size:13px}
.cells{min-height:0;overflow:auto;padding:10px;border-radius:12px;background:#fff;box-shadow:var(--sh);display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;align-content:start}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;min-height:98px;padding:6px 4px 5px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font-weight:600;font-size:11.5px;line-height:1.15;text-align:center}
.cell:hover{border-color:var(--blue)}
.cell[aria-checked=true]{border-color:var(--blue);background:var(--tint);box-shadow:0 0 0 2px var(--peri)}
.cell .th{display:grid;place-items:center;width:100%;height:66px;overflow:hidden}
.cell .th canvas{display:block;height:64px;width:auto;max-width:100%}
.cell .sw{width:42px;height:42px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--line),inset 0 -6px 8px rgba(0,0,0,.12)}
.foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 14px 14px;flex:none;background:var(--surface)}
.foot .grow{margin-right:auto}
/* загрузка и ошибка */
.loader,.error{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:radial-gradient(120% 95% at 50% 42%,#1f8cae 0%,#11627f 46%,#07354f 100%);text-align:center;padding:20px;color:#fff}
.loader b{font-family:var(--disp);text-transform:uppercase;font-size:28px;font-weight:600}
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
  .inc{grid-template-columns:1fr}.sv-foot{grid-template-columns:1fr}.sv-foot .cl{justify-items:start;text-align:left}
  .big{font-size:46px}.big.sm{font-size:32px}
  .sv-row .n,.sv-row .pr b{font-size:19px}.pj-soon{grid-template-columns:1fr}
  .wd{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);padding:8px;gap:8px}
  .wd .portrait{display:none}
  .wd .col{flex-direction:row;overflow-x:auto;overflow-y:hidden;flex:none}.cat{flex:none}
  .nm{font-size:40px}.win header h2{font-size:30px}
  .foot{flex-wrap:nowrap}.foot .btn{padding:0 12px;font-size:14px}.foot .grow .tx{display:none}.foot .grow{padding:0;width:42px}
}
@media (max-width:420px){.sv-row{flex-direction:column;align-items:flex-start;gap:4px}.sv-row .pr{align-items:flex-start}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
