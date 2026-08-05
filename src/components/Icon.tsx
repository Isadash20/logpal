/** Inline 24×24 stroke icons. Kept in one file so there is no icon dependency. */

export type IconName =
  | 'back'
  | 'forward'
  | 'down'
  | 'up'
  | 'plus'
  | 'minus'
  | 'search'
  | 'barcode'
  | 'check'
  | 'close'
  | 'star'
  | 'star-filled'
  | 'more'
  | 'calendar'
  | 'home'
  | 'diary'
  | 'progress'
  | 'menu'
  | 'trash'
  | 'edit'
  | 'camera'
  | 'water'
  | 'note'
  | 'flame'
  | 'dumbbell'
  | 'settings'
  | 'user'
  | 'scale'
  | 'ruler'
  | 'clock'
  | 'copy'
  | 'bookmark'
  | 'chart'
  | 'info'
  | 'dots'
  | 'mic'
  | 'mealscan'
  | 'sunrise'
  | 'sun'
  | 'moon'
  | 'stars'
  | 'plan'

const PATHS: Record<IconName, string> = {
  back: 'M15 19l-7-7 7-7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  barcode: 'M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18M6 6l12 12',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z',
  'star-filled':
    'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  calendar: 'M7 3v4M17 3v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  home: 'M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  diary: 'M4 4h13a2 2 0 012 2v14H6a2 2 0 01-2-2zM8 4v16M11 9h6M11 13h6',
  progress: 'M3 20V10M9 20V4M15 20v-7M21 20V7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  trash: 'M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z',
  camera:
    'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a4 4 0 100-8 4 4 0 000 8z',
  water: 'M12 3s6 6.6 6 11a6 6 0 01-12 0c0-4.4 6-11 6-11z',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5',
  flame: 'M12 3c3 4 6 5.5 6 9a6 6 0 01-12 0c0-2 1-3.5 2-5 .5 1.5 1.5 2 2 2 0-2 1-4 2-6z',
  dumbbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007.5 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 13.6H3a2 2 0 110-4h.1A1.6 1.6 0 004.7 7.5l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9.5a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  scale: 'M4 20h16M6 20V9l6-5 6 5v11M9 13h6',
  ruler: 'M3 8h18v8H3zM7 8v3M11 8v5M15 8v3M19 8v5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  copy: 'M9 9h10v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM5 15V5a2 2 0 012-2h8',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16v-5M12 8h.01',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3',
  mealscan:
    'M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  sunrise: 'M12 3v5M5.6 10.6L4.2 9.2M18.4 10.6l1.4-1.4M3 17h18M7 17a5 5 0 0110 0',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z',
  stars: 'M12 3l1.6 3.6L17 8l-3.4 1.4L12 13l-1.6-3.6L7 8l3.4-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  plan: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01',
}

/** The three-dot and sun icons read as dots, not strokes. */
const DOT_ICONS = new Set<IconName>(['dots', 'more'])

export function Icon({
  name,
  size = 22,
  strokeWidth = 1.9,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const filled = name === 'star-filled'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={DOT_ICONS.has(name) ? 3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
