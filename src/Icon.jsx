// Small line icons drawn for ImmoCongo (24×24, they take the text colour). Used instead of emojis,
// which look different on every phone. Decorative: screen readers skip them (aria-hidden).
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>,
  heart: <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8.1 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.4 3.6 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z" />,
  pin: <><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  bed: <><path d="M2.5 19V6M2.5 15h19M21.5 19v-6a3 3 0 0 0-3-3H11v5" /><circle cx="6.5" cy="11.5" r="2" /></>,
  verified: <><path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6l7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.8-5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  whatsapp: <><path d="M3.6 20.4l1.2-4.1a8.6 8.6 0 1 1 3.1 3.1l-4.3 1Z" /><path d="M9.2 8.4c.2-.4.5-.5.8-.5h.5l.9 2.1-.6.8c.4 1 1.4 2 2.4 2.4l.8-.6 2.1.9v.5c0 .3-.1.6-.5.8-.6.4-1.5.5-2.6 0a8 8 0 0 1-3.9-3.9c-.4-1.1-.4-2 .1-2.5Z" fill="currentColor" strokeWidth="1" /></>,
  message: <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 3.5V17a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />,
  share: <><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  city: <><path d="M3 21h18M5 21V8l6-3v16M11 21V10l8 3v8" /><path d="M8 10v.01M8 13v.01M8 16v.01M15 15v.01M15 18v.01" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3Z" />,
  logout: <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" />,
  login: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />,
  star: <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9L12 3Z" />,
};

export default function Icon({ name, size = 20, fill = "none", strokeWidth = 2, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: "block", ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
