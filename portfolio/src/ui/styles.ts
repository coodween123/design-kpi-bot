export const CSS = `
:host{all:initial;display:block;width:100%;height:100%}
*{box-sizing:border-box}
.root{--ink:#3b2b4a;--cream:#fbf3e4;--paper:#fffaf0;--teal:#4aa8a0;--teal-d:#2f8780;--coral:#ec7766;--sun:#f2c14e;--mute:#7a6b86;
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;color:var(--ink);
  font-family:ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",system-ui,-apple-system,Roboto,sans-serif;font-size:15px;line-height:1.45;
  background:radial-gradient(120% 90% at 50% 20%,#fdf2dc 0%,#f6d9c4 55%,#eab9b0 100%);-webkit-tap-highlight-color:transparent;user-select:none}
.stage{position:absolute;inset:0}
.stage canvas{width:100%!important;height:100%!important;display:block;touch-action:manipulation;outline:none}
button{font:inherit;color:inherit;cursor:pointer}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:2px solid var(--ink);border-radius:14px;background:var(--paper);
  box-shadow:0 3px 0 var(--ink);font-weight:700;transition:transform .08s,box-shadow .08s,background .15s}
.btn:hover{background:#fff}
.btn:active{transform:translateY(3px);box-shadow:0 0 0 var(--ink)}
.btn:focus-visible,.tab:focus-visible,.item:focus-visible,.close:focus-visible,a:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
.btn.primary{background:var(--teal);color:#fff}.btn.primary:hover{background:var(--teal-d)}
.btn.icon{padding:0;width:44px;justify-content:center}.btn.icon .lbl{display:none}
.hud{position:absolute;inset:0;pointer-events:none;z-index:2}
.hud>*{pointer-events:auto}
.brand{position:absolute;left:16px;top:14px;padding:8px 14px;border:2px solid var(--ink);border-radius:14px;background:var(--paper);box-shadow:0 3px 0 var(--ink);pointer-events:none}
.brand b{display:block;font-size:17px;letter-spacing:.2px}.brand span{font-size:12px;color:var(--mute)}
.actions{position:absolute;right:16px;top:14px;display:flex;gap:10px}
.status{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:8px 16px;border:2px solid var(--ink);border-radius:999px;background:var(--paper);
  box-shadow:0 3px 0 var(--ink);font-weight:700;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
.status.on{opacity:1}
.tip{position:absolute;transform:translate(-50%,-100%);padding:6px 12px;border:2px solid var(--ink);border-radius:12px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;
  pointer-events:none;opacity:0;transition:opacity .12s;white-space:nowrap}
.tip.on{opacity:1}
.toast{position:absolute;left:50%;top:76px;transform:translate(-50%,-8px);padding:8px 16px;border-radius:12px;background:var(--ink);color:#fff;font-weight:700;opacity:0;transition:.2s;pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
.intro{position:absolute;left:16px;bottom:16px;width:min(360px,calc(100% - 32px));padding:16px 18px;border:2px solid var(--ink);border-radius:18px;
  background:var(--paper);box-shadow:0 5px 0 var(--ink);z-index:3}
.intro h2{margin:0 0 6px;font-size:17px}.intro ul{margin:0 0 12px;padding-left:18px}.intro li{margin:2px 0}
kbd{display:inline-block;min-width:22px;padding:0 5px;border:1.5px solid var(--ink);border-radius:6px;background:#fff;font:700 12px/18px inherit;text-align:center}
.hidden{display:none!important}
/* окна */
.scrim{position:absolute;inset:0;background:rgba(59,43,74,.38);z-index:5;animation:fade .2s}
.win{position:absolute;z-index:6;display:flex;flex-direction:column;background:var(--paper);border:2px solid var(--ink);box-shadow:0 6px 0 var(--ink);animation:pop .22s cubic-bezier(.2,.9,.3,1.2);user-select:text}
.win.modal{left:50%;top:50%;transform:translate(-50%,-50%);width:min(620px,calc(100% - 32px));max-height:calc(100% - 48px);border-radius:22px}
.win.panel{right:16px;top:70px;bottom:16px;width:min(400px,calc(100% - 32px));border-radius:22px}
.win header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:2px solid var(--ink);background:var(--cream);border-radius:20px 20px 0 0;flex:none}
.win header .ico{display:grid;place-items:center;width:42px;height:42px;border:2px solid var(--ink);border-radius:12px;background:var(--teal);color:#fff;flex:none}
.win header h2{margin:0;font-size:19px;line-height:1.2}.win header p{margin:0;font-size:12px;color:var(--mute)}
.win header .grow{flex:1;min-width:0}
.close{flex:none;display:grid;place-items:center;width:44px;height:44px;border:2px solid var(--ink);border-radius:12px;background:#fff;box-shadow:0 3px 0 var(--ink)}
.close:active{transform:translateY(3px);box-shadow:none}
.body{padding:16px 18px 20px;overflow:auto;-webkit-overflow-scrolling:touch}
.body h3{margin:18px 0 6px;font-size:15px}.body p{margin:0 0 10px}.body ul{margin:0 0 10px;padding-left:20px}
.body dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 10px}.body dt{color:var(--mute)}.body dd{margin:0;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.card{padding:12px;border:2px solid var(--ink);border-radius:14px;background:#fff;box-shadow:0 3px 0 var(--ink)}
.card b{display:block}.card small{display:inline-block;margin-bottom:6px;padding:0 8px;border-radius:999px;background:var(--sun);font-weight:700;font-size:11px}
.links{display:flex;flex-wrap:wrap;gap:10px}
.links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:2px solid var(--ink);border-radius:14px;background:#fff;box-shadow:0 3px 0 var(--ink);color:inherit;font-weight:700;text-decoration:none}
.media{display:grid;place-items:center;aspect-ratio:16/9;margin-bottom:10px;border:2px dashed var(--ink);border-radius:14px;background:repeating-linear-gradient(45deg,#fff,#fff 10px,#f6ead3 10px,#f6ead3 20px);text-align:center;color:var(--mute);padding:12px}
.media svg{width:36px;height:36px;color:var(--ink)}
video.media{border-style:solid;width:100%;background:#000}
/* меню */
.menu{position:absolute;right:16px;top:70px;z-index:4;width:min(260px,calc(100% - 32px));padding:8px;border:2px solid var(--ink);border-radius:18px;background:var(--paper);box-shadow:0 5px 0 var(--ink)}
.menu h2{margin:6px 8px 4px;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--mute)}
.menu a{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 10px;border-radius:12px;color:inherit;text-decoration:none;font-weight:700}
.menu a:hover{background:var(--cream)}
.menu a .ico{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--teal);color:#fff}
/* гардероб */
.wd{display:flex;flex-direction:column;gap:12px;min-height:0;flex:1;overflow:hidden}
.wd .top{display:flex;gap:12px;align-items:center}
.wd canvas{width:96px;height:auto;flex:none;border:2px solid var(--ink);border-radius:16px;background:linear-gradient(#e9f6f2,#cfe9e2)}
.wd .top p{margin:0;color:var(--mute);font-size:13px}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}
.tab{flex:none;min-height:40px;padding:0 12px;border:2px solid var(--ink);border-radius:999px;background:#fff;font-weight:700;font-size:13px}
.tab[aria-selected=true]{background:var(--ink);color:#fff}
.items{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px;overflow:auto;padding:2px 2px 8px;flex:1;align-content:start}
.item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:72px;padding:8px;border:2px solid var(--ink);border-radius:14px;background:#fff;font-weight:700;font-size:12px;text-align:center}
.item[aria-checked=true]{background:#dff3ee;box-shadow:0 0 0 3px var(--teal)}
.sw{width:30px;height:30px;border-radius:50%;border:2px solid var(--ink)}
.chip{width:30px;height:20px;border-radius:7px;border:2px solid var(--ink)}
.foot{display:flex;gap:10px;padding:12px 16px;border-top:2px solid var(--ink);background:var(--cream);border-radius:0 0 20px 20px;flex:none}
.foot .btn{flex:1;justify-content:center}
/* загрузка */
.loader,.error{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 20%,#fdf2dc,#f1c9bb);text-align:center;padding:20px}
.loader .bar{width:min(260px,70vw);height:14px;margin:14px auto 0;border:2px solid var(--ink);border-radius:999px;background:#fff;overflow:hidden}
.loader .bar i{display:block;height:100%;width:0;background:var(--coral);transition:width .15s}
.error .box{max-width:360px}.error h2{margin:0 0 8px}.error .row{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}
@keyframes fade{from{opacity:0}}@keyframes pop{from{opacity:0;scale:.96}}
@media (max-width:720px){
  .brand span{display:none}
  .win.modal{width:calc(100% - 20px);max-height:calc(100% - 20px)}
  .win.panel,.win.sheet{left:8px;right:8px;top:auto;bottom:8px;width:auto;height:min(62%,480px);border-radius:20px}
  .actions .btn .lbl{display:none}.actions .btn{padding:0;width:44px;justify-content:center}
  .wd .top{display:none}
  .intro .kb{display:none}
  .intro{left:50%;transform:translateX(-50%);bottom:12px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
