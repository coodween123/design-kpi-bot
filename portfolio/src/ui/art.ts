// Векторные иллюстрации интерфейса: карточки услуг, значки достижений, пустое состояние проектов.
const svg = (w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg>`;

export const SERVICE_ART: Record<'web' | 'social' | 'print' | 'brand' | 'pres', string> = {
  web: svg(220, 150, `
    <rect width="220" height="150" fill="url(#b)"/>
    <circle cx="190" cy="24" r="40" fill="#fff" opacity=".12"/><circle cx="24" cy="130" r="46" fill="#fff" opacity=".1"/>
    <rect x="30" y="24" width="160" height="106" rx="9" fill="#000" opacity=".18" transform="translate(3 5)"/>
    <rect x="30" y="22" width="160" height="106" rx="9" fill="#fff"/>
    <path d="M30 31a9 9 0 0 1 9-9h142a9 9 0 0 1 9 9v7H30z" fill="#e5e9f5"/>
    <circle cx="41" cy="30" r="2.6" fill="#ff6b6b"/><circle cx="50" cy="30" r="2.6" fill="#8fb0fb"/><circle cx="59" cy="30" r="2.6" fill="#5ed6a3"/>
    <rect x="72" y="26.5" width="80" height="7" rx="3.5" fill="#fff"/>
    <rect x="40" y="46" width="88" height="42" rx="6" fill="url(#h)"/>
    <rect x="48" y="55" width="52" height="6" rx="3" fill="#fff" opacity=".95"/><rect x="48" y="66" width="38" height="4.5" rx="2.2" fill="#fff" opacity=".7"/>
    <rect x="48" y="75" width="26" height="8" rx="4" fill="#fff"/>
    <rect x="136" y="46" width="44" height="42" rx="6" fill="#dff5ee"/><circle cx="158" cy="62" r="9" fill="#4fcfa5"/><rect x="143" y="75" width="30" height="4" rx="2" fill="#5aa690" opacity=".6"/>
    <rect x="40" y="96" width="42" height="24" rx="5" fill="#e8efff"/><rect x="88" y="96" width="42" height="24" rx="5" fill="#e6e0ff"/><rect x="136" y="96" width="44" height="24" rx="5" fill="#ffe0e6"/>
    <path d="M150 86l0 22 5.5-5 4 8.5 4-2-4-8.5 7.5-.5z" fill="#fff" stroke="#243a63" stroke-width="2" stroke-linejoin="round"/>`,
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9a6ff"/><stop offset="1" stop-color="#5f86f2"/></linearGradient>
     <linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset="1" stop-color="#ff5f8a"/></linearGradient>`),
  social: svg(220, 150, `
    <rect width="220" height="150" fill="url(#b)"/>
    <circle cx="32" cy="30" r="42" fill="#fff" opacity=".13"/><circle cx="200" cy="128" r="48" fill="#fff" opacity=".1"/>
    <rect x="73" y="12" width="78" height="128" rx="15" fill="#000" opacity=".2" transform="translate(3 4)"/>
    <rect x="72" y="10" width="78" height="128" rx="15" fill="#2a2f4e"/>
    <rect x="77" y="18" width="68" height="112" rx="10" fill="#fff"/>
    <rect x="100" y="12.5" width="22" height="3.2" rx="1.6" fill="#4a5078"/>
    <circle cx="111" cy="40" r="15" fill="url(#r)"/><circle cx="111" cy="40" r="11.5" fill="#fff"/><circle cx="111" cy="37" r="4.8" fill="#ffb199"/><path d="M101.5 49c1.6-5.5 5-7 9.5-7s7.900 1.500 9.500 7a11 11 0 0 1-19 0z" fill="#ff7a8a"/>
    <rect x="94" y="60" width="34" height="5" rx="2.5" fill="#d9dcec"/>
    <rect x="82" y="72" width="29" height="26" rx="4" fill="#8fb0fb"/><rect x="113" y="72" width="29" height="26" rx="4" fill="#7ad7c3"/>
    <rect x="82" y="100" width="29" height="26" rx="4" fill="#9fb0ff"/><rect x="113" y="100" width="29" height="26" rx="4" fill="#ff8fa5"/>
    <circle cx="96" cy="85" r="6" fill="#fff" opacity=".7"/><path d="M118 90l7-9 5 6 4-4 3 7z" fill="#fff" opacity=".75"/>
    <circle cx="170" cy="36" r="17" fill="#fff"/><path d="M170 46c-9-6-12-10-12-14.500a6.500 6.500 0 0 1 12-3.200 6.500 6.500 0 0 1 12 3.200c0 4.500-3 8.500-12 14.500z" fill="#ff4f6d"/>
    <rect x="152" y="104" width="38" height="14" rx="7" fill="#fff"/><circle cx="160" cy="111" r="3.600" fill="#7a63d6"/><rect x="167" y="108" width="17" height="3.200" rx="1.600" fill="#c9c6e6"/><rect x="167" y="113" width="11" height="3" rx="1.500" fill="#dedcf0"/>`,
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb199"/><stop offset="1" stop-color="#ff5f8a"/></linearGradient>
     <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9e5ff"/><stop offset=".5" stop-color="#ff7a5c"/><stop offset="1" stop-color="#c13584"/></linearGradient>`),
  print: svg(220, 150, `
    <rect width="220" height="150" fill="url(#b)"/>
    <circle cx="190" cy="28" r="42" fill="#fff" opacity=".12"/><circle cx="26" cy="126" r="46" fill="#fff" opacity=".1"/>
    <g transform="rotate(-7 82 74)"><rect x="46" y="20" width="76" height="106" rx="4" fill="#000" opacity=".18" transform="translate(3 4)"/>
    <rect x="46" y="20" width="76" height="106" rx="4" fill="#fff"/>
    <rect x="53" y="27" width="62" height="46" rx="3" fill="url(#p)"/><circle cx="96" cy="43" r="9" fill="#d9e5ff"/><path d="M53 73l20-22 14 14 9-8 19 16z" fill="#fff" opacity=".35"/>
    <rect x="53" y="80" width="46" height="7" rx="3.500" fill="#243a63"/><rect x="53" y="92" width="62" height="4" rx="2" fill="#b8c2d9"/><rect x="53" y="100" width="54" height="4" rx="2" fill="#b8c2d9"/><rect x="53" y="108" width="30" height="4" rx="2" fill="#b8c2d9"/></g>
    <g transform="rotate(9 150 100)"><rect x="112" y="80" width="76" height="46" rx="5" fill="#000" opacity=".18" transform="translate(3 4)"/>
    <rect x="112" y="80" width="76" height="46" rx="5" fill="#fff"/><rect x="112" y="80" width="22" height="46" rx="5" fill="#ff8a3d"/><rect x="124" y="80" width="10" height="46" fill="#ff8a3d"/>
    <rect x="142" y="90" width="38" height="6" rx="3" fill="#243a63"/><rect x="142" y="101" width="30" height="3.500" rx="1.700" fill="#b8c2d9"/><rect x="142" y="109" width="24" height="3.500" rx="1.700" fill="#b8c2d9"/></g>
    <circle cx="170" cy="46" r="19" fill="#8fb0fb" stroke="#fff" stroke-width="3.500"/><path d="M170 36l3.300 6.800 7.500 1-5.400 5.300 1.300 7.400-6.700-3.600-6.700 3.600 1.300-7.400-5.400-5.300 7.500-1z" fill="#fff"/>`,
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7de3d0"/><stop offset="1" stop-color="#3b8fe0"/></linearGradient>
     <linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fa5"/><stop offset="1" stop-color="#7a63d6"/></linearGradient>`),
  brand: svg(220, 150, `
    <rect width="220" height="150" fill="url(#b)"/>
    <circle cx="190" cy="26" r="40" fill="#fff" opacity=".14"/><circle cx="26" cy="128" r="46" fill="#fff" opacity=".1"/>
    <rect x="52" y="30" width="116" height="90" rx="12" fill="#fff"/>
    <path d="M110 48l16 28h-32z" fill="#5a87f8"/><circle cx="110" cy="92" r="10" fill="#bacffe"/><rect x="92" y="104" width="36" height="5" rx="2.5" fill="#121419"/>
    <circle cx="68" cy="46" r="5" fill="#8fb0fb"/><circle cx="152" cy="46" r="5" fill="#bacffe"/>`,
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9e5ff"/><stop offset="1" stop-color="#8fb0fb"/></linearGradient>`),
  pres: svg(220, 150, `
    <rect width="220" height="150" fill="url(#b)"/>
    <circle cx="30" cy="30" r="42" fill="#fff" opacity=".14"/><circle cx="196" cy="130" r="48" fill="#fff" opacity=".1"/>
    <rect x="34" y="26" width="152" height="94" rx="9" fill="#fff"/>
    <rect x="46" y="38" width="62" height="9" rx="4.5" fill="#121419"/><rect x="46" y="54" width="48" height="5" rx="2.5" fill="#121419" opacity=".35"/><rect x="46" y="64" width="40" height="5" rx="2.5" fill="#121419" opacity=".35"/>
    <rect x="120" y="42" width="56" height="62" rx="6" fill="#bacffe"/><rect x="128" y="76" width="9" height="20" rx="2" fill="#5a87f8"/><rect x="142" y="64" width="9" height="32" rx="2" fill="#5a87f8"/><rect x="156" y="52" width="9" height="44" rx="2" fill="#8fb0fb"/>
    <rect x="46" y="92" width="44" height="14" rx="7" fill="#121419"/>`,
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9e5ff"/><stop offset="1" stop-color="#8fb0fb"/></linearGradient>`),
};

export const AWARD_ART: Record<'trophy' | 'brands' | 'years', string> = {
  trophy: svg(64, 64, `
    <path d="M18 10h28v14a14 14 0 0 1-28 0z" fill="url(#g)" stroke="#2c4a9e" stroke-width="2" stroke-linejoin="round"/>
    <path d="M18 14H9c0 9 4 14 11 15M46 14h9c0 9-4 14-11 15" fill="none" stroke="#5a87f8" stroke-width="4" stroke-linecap="round"/>
    <rect x="28" y="38" width="8" height="9" fill="#5a87f8" stroke="#2c4a9e" stroke-width="2"/>
    <rect x="20" y="47" width="24" height="8" rx="2.500" fill="url(#g)" stroke="#2c4a9e" stroke-width="2"/>
    <path d="M25 14v10a7 7 0 0 0 3 6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`,
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3ecff"/><stop offset=".5" stop-color="#8fb0fb"/><stop offset="1" stop-color="#5a87f8"/></linearGradient>`),
  brands: svg(64, 64, `
    <rect x="8" y="20" width="48" height="34" rx="6" fill="url(#g)" stroke="#164f80" stroke-width="2"/>
    <path d="M23 20v-4a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4" fill="none" stroke="#164f80" stroke-width="3" stroke-linecap="round"/>
    <rect x="8" y="33" width="48" height="4" fill="#164f80" opacity=".35"/>
    <rect x="28" y="30" width="8" height="10" rx="2" fill="#8fb0fb" stroke="#2c4a9e" stroke-width="1.500"/>
    <path d="M13 24h38" stroke="#fff" stroke-opacity=".5" stroke-width="2.500" stroke-linecap="round"/>`,
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc6f7"/><stop offset="1" stop-color="#2a82c0"/></linearGradient>`),
  years: svg(64, 64, `
    <path d="M32 6l7.500 15.300 16.800 2.400-12.200 11.900 2.900 16.800L32 44.400l-15 8 2.900-16.800L7.700 23.700l16.800-2.400z" fill="url(#g)" stroke="#2c4a9e" stroke-width="2" stroke-linejoin="round"/>
    <path d="M22 24l5-10" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`,
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3ecff"/><stop offset=".5" stop-color="#8fb0fb"/><stop offset="1" stop-color="#5a87f8"/></linearGradient>`),
};

export const EMPTY_PROJECTS_ART = svg(220, 150, `
  <rect x="40" y="18" width="140" height="92" rx="9" fill="#f2f5fe" stroke="#509af9" stroke-width="3"/>
  <rect x="48" y="26" width="124" height="76" rx="4" fill="url(#s)"/>
  <rect x="62" y="40" width="46" height="34" rx="4" fill="#fff" opacity=".85"/><rect x="114" y="40" width="44" height="14" rx="3" fill="#fff" opacity=".6"/><rect x="114" y="60" width="30" height="14" rx="3" fill="#8fb0fb" opacity=".9"/>
  <rect x="62" y="82" width="96" height="6" rx="3" fill="#fff" opacity=".4"/>
  <path d="M96 110h28l5 16H91z" fill="#f2f5fe" stroke="#509af9" stroke-width="3" stroke-linejoin="round"/><rect x="78" y="124" width="64" height="8" rx="4" fill="#f2f5fe" stroke="#509af9" stroke-width="3"/>`,
  `<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fb8f0"/><stop offset="1" stop-color="#3a6fd8"/></linearGradient>`);
