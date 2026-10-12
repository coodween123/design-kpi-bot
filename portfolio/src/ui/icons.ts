const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  laptop: svg('<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/>'),
  tv: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 21h6M8 2l4 4 4-4"/>'),
  door: svg('<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18"/><circle cx="14.5" cy="12.5" r=".8" fill="currentColor"/>'),
  hanger: svg('<path d="M12 7a2 2 0 1 0-2-2M12 7v2l9 6a1.5 1.5 0 0 1-.8 2.7H3.8A1.5 1.5 0 0 1 3 15l9-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  undo: svg('<path d="M9 7H4v5M4 12a8 8 0 1 1 2.3 5.7"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7"/>'),
  book: svg('<path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v16H6.500A2.500 2.500 0 0 0 4 21.500zM20 17H6.500A2.500 2.500 0 0 0 4 19.500M9 7h7"/>'),
  plane: svg('<path d="M21 3L3 10.500l6.500 2.500L12 20l2.500-5.500zM9.500 13L21 3"/>'),
  star: svg('<path d="M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100-4.400-4.300 6.100-.9z" fill="currentColor"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.600-5.900M4 4v4.500h4.500"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tgg" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#37aee2"/><stop offset="1" stop-color="#1e96c8"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#tgg)"/><path fill="#fff" d="M16.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};
