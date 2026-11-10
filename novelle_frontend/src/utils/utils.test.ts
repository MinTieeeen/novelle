import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatNumber, formatRating, initials, vnLocalToUtcIso } from '@/utils/format';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

describe('format', () => {
  it('formats numbers and ratings the Vietnamese way', () => {
    expect(formatNumber(48210)).toBe('48.210');
    expect(formatRating(4.6)).toBe('4,6');
    expect(formatNumber(null)).toBe('–');
  });

  it('shows UTC timestamps in Vietnam time', () => {
    expect(formatDate('2026-10-14T18:30:00Z')).toBe('15/10/2026');
    expect(formatDateTime('2026-10-15T03:00:00Z')).toBe('15/10/2026 10:00');
  });

  it('converts a Vietnam date and time to UTC', () => {
    expect(vnLocalToUtcIso(new Date(2026, 9, 15), '10:00')).toBe('2026-10-15T03:00:00.000Z');
  });

  it('builds initials', () => {
    expect(initials('Lan Anh')).toBe('LA');
    expect(initials('Mộc Lan')).toBe('ML');
    expect(initials('admin')).toBe('AD');
  });
});

describe('sanitizeHtml', () => {
  it('keeps only the chapter tags allowed by the backend', () => {
    const dirty = '<p onclick="x()">Hi <em>a</em><script>alert(1)</script><img src=x onerror=y><a href="#">l</a></p>';
    expect(sanitizeHtml(dirty)).toBe('<p>Hi <em>a</em>l</p>');
  });
});

describe('cn', () => {
  it('treats design-system text sizes as sizes, not colours', () => {
    expect(cn('text-body text-foreground', 'text-small')).toBe('text-foreground text-small');
    expect(cn('text-muted-foreground', 'text-foreground')).toBe('text-foreground');
  });
});
