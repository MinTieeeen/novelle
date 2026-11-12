import { useCallback, useEffect, useState, type CSSProperties } from 'react';

export type ReaderTheme = 'paper' | 'sepia' | 'night';

export interface ReaderSettings {
  theme: ReaderTheme;
  /** px, 16–24 */
  fontSize: number;
  /** unitless, 1.5–2 */
  lineHeight: number;
}

export const READER_FONT_MIN = 16;
export const READER_FONT_STEP = 1;
export const READER_FONT_MAX = 24;
/** Line spacing choices of the settings panel (board ReaderSettings). */
export const LINE_SPACING = [
  { label: 'Hẹp', value: 1.5 },
  { label: 'Vừa', value: 1.75 },
  { label: 'Rộng', value: 2 },
] as const;

export const READER_THEMES: { value: ReaderTheme; label: string }[] = [
  { value: 'paper', label: 'Sáng' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'night', label: 'Tối' },
];

const STORAGE_KEY = 'novelle-reader-settings';
const DEFAULTS: ReaderSettings = { theme: 'paper', fontSize: 19, lineHeight: 1.75 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function nearestSpacing(n: number): number {
  return LINE_SPACING.reduce<number>((best, o) => (Math.abs(o.value - n) < Math.abs(best - n) ? o.value : best), DEFAULTS.lineHeight);
}

function load(): ReaderSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ReaderSettings>;
    return {
      theme: raw.theme === 'sepia' || raw.theme === 'night' ? raw.theme : 'paper',
      fontSize: clamp(Number(raw.fontSize) || DEFAULTS.fontSize, READER_FONT_MIN, READER_FONT_MAX),
      lineHeight: nearestSpacing(Number(raw.lineHeight) || DEFAULTS.lineHeight),
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Reading preferences (font size, line spacing, reading theme), kept in localStorage (not personal data).
 * Spread `readerProps` on the reader page root: data-reader-theme sets the reader-* colours (globals.css)
 * and the CSS variables size the `.reader` text (styles/reader.css).
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage blocked: settings last for this page only.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((s) => ({
      ...s,
      ...patch,
      fontSize: clamp(patch.fontSize ?? s.fontSize, READER_FONT_MIN, READER_FONT_MAX),
      lineHeight: nearestSpacing(patch.lineHeight ?? s.lineHeight),
    }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const readerProps = {
    'data-reader-theme': settings.theme,
    style: {
      '--reader-size': `${settings.fontSize}px`,
      '--reader-leading': String(settings.lineHeight),
    } as CSSProperties,
  };

  return { settings, update, reset, readerProps };
}
