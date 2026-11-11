// Icônes dessinées pour l'appli (traits simples, couleur héritée du texte).
const P = {
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.2.2 3.7 1.7 4.1 4.3"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  script: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 11h6.5M9 14.5h6.5M9 18h4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16.5v-5M11.5 16.5V7M16 16.5v-8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  filter: '<path d="M4 5h16l-6.2 7.5V19l-3.6-1.8v-4.7L4 5Z"/>',
  layers: '<path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z"/><path d="m3 13 9 4.5 9-4.5"/>',
  locate: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.2"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10.5 10.5 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  camera: '<path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4V8Z"/><circle cx="12" cy="13.3" r="3.4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17.5 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  building: '<path d="M5 20.5V4h10v16.5M15 9h4v11.5M3 20.5h18"/><path d="M8 7.5h1.5M11 7.5h1.5M8 11h1.5M11 11h1.5M8 14.5h1.5M11 14.5h1.5"/>',
  house: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  userPlus: '<circle cx="10" cy="8.5" r="3.6"/><path d="M3.5 20c.8-3.8 3.4-6 6.5-6 1.8 0 3.4.7 4.6 2"/><path d="M18.5 13v6M15.5 16h6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  star: '<path d="m12 3.8 2.5 5.3 5.7.6-4.3 3.9 1.2 5.6L12 16.4l-5.1 2.8 1.2-5.6-4.3-3.9 5.7-.6L12 3.8Z"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  euro: '<path d="M17.5 6.3A7 7 0 1 0 17.5 17.7"/><path d="M4.5 10h9M4.5 14h9"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  door: '<path d="M6 20.5V3.5h10v17"/><path d="M4 20.5h16M13 12.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tag: '<path d="M3.5 12V4.5H11l9.5 9.5-7.5 7.5L3.5 12Z"/><circle cx="7.8" cy="8.8" r="1.4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  pdf: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5"/><path d="M8.5 16.5h7M8.5 13h7"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  undo: '<path d="M8.5 5 4 9.5 8.5 14"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
};

export function icon(name, size = 22, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const starIcon = (filled, size = 16) =>
  `<svg class="ic star ${filled ? 'on' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${'m12 3.8 2.5 5.3 5.7.6-4.3 3.9 1.2 5.6L12 16.4l-5.1 2.8 1.2-5.6-4.3-3.9 5.7-.6L12 3.8Z'}" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
