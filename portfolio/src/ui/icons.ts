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
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};
