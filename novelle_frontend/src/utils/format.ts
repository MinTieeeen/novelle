import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('vi');

/** API timestamps are UTC ISO strings; the UI always shows Vietnam time. */
export const VN_TZ = 'Asia/Ho_Chi_Minh';

const numberFormat = new Intl.NumberFormat('vi-VN');
const ratingFormat = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/** 48210 → "48.210" */
export function formatNumber(value: number | null | undefined): string {
  return value == null ? '–' : numberFormat.format(value);
}

/** 1250000 → "1,3 Tr" (stat cards, charts) */
export function formatCompact(value: number | null | undefined): string {
  return value == null ? '–' : compactFormat.format(value);
}

/** 4.6 → "4,6" */
export function formatRating(value: number | null | undefined): string {
  return value == null ? '–' : ratingFormat.format(value);
}

/** "2026-10-15T03:00:00Z" → "15/10/2026" */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dayjs.utc(iso).tz(VN_TZ).format('DD/MM/YYYY') : '';
}

/** "2026-10-15T03:00:00Z" → "15/10/2026 10:00" */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dayjs.utc(iso).tz(VN_TZ).format('DD/MM/YYYY HH:mm') : '';
}

/** "2026-10-15T03:00:00Z" → "10:00" */
export function formatTime(iso: string | null | undefined): string {
  return iso ? dayjs.utc(iso).tz(VN_TZ).format('HH:mm') : '';
}

/** → "2 giờ trước" */
export function formatRelative(iso: string | null | undefined): string {
  return iso ? dayjs.utc(iso).fromNow() : '';
}

/** Local date + "HH:mm" typed in Vietnam time → UTC ISO string for the API (schedule publish). */
export function vnLocalToUtcIso(date: Date, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const local = dayjs.tz(dayjs(date).format('YYYY-MM-DD'), VN_TZ).hour(h ?? 0).minute(m ?? 0).second(0);
  return local.utc().toISOString();
}

/** 1–2 initials for avatars: "Lan Anh" → "LA" */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

export { dayjs };
