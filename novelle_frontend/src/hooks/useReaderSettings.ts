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
export const READER_FONT_MAX = 24;
const STORAGE_KEY = 'novelle-reader-settings';
const DEFAULTS: ReaderSettings = { theme: 'paper', fontSize: 19, lineHeight: 1.75 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function load(): ReaderSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ReaderSettings>;
    return {
      theme: raw.theme === 'sepia' || raw.theme === 'night' ? raw.theme : 'paper',
      fontSize: clamp(Number(raw.fontSize) || DEFAULTS.fontSize, READER_FONT_MIN, READER_FONT_MAX),
      lineHeight: clamp(Number(raw.lineHeight) || DEFAULTS.lineHeight, 1.5, 2),
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Reading preferences (font size, line height, reading theme), kept in localStorage. Spread
 * `readerProps` on the `.reader` element (styles/reader.css).
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
    }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const readerProps = {
    'data-theme': settings.theme,
    style: {
      '--reader-size': `${settings.fontSize}px`,
      '--reader-leading': String(settings.lineHeight),
    } as CSSProperties,
  };

  return { settings, update, reset, readerProps };
}
