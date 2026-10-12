import { mountPortfolio } from './app';

// Вставка в Tilda: <div data-avatar-portfolio style="height:80vh"></div> + <script src=".../portfolio-embed.js"></script>
function boot(): void {
  document.querySelectorAll<HTMLElement>('[data-avatar-portfolio]').forEach((host) => {
    if ((host as HTMLElement & { __mounted?: boolean }).__mounted) return;
    (host as HTMLElement & { __mounted?: boolean }).__mounted = true;
    if (!host.style.height && host.clientHeight < 200) host.style.height = '80vh';
    mountPortfolio(host, { routing: host.dataset.routing === 'hash' ? 'hash' : 'none' });
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
(window as unknown as { AvatarPortfolio: unknown }).AvatarPortfolio = { mount: mountPortfolio, boot };
