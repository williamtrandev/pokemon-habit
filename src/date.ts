import { ISODate } from './types';

// Trả về ngày hôm nay theo giờ địa phương, dạng 'YYYY-MM-DD'
export function todayStr(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function nextDay(s: ISODate): ISODate {
  return addDays(s, 1);
}

// Số ngày giữa hai mốc (b - a), có thể âm
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86400000);
}

const WEEKDAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function weekdayLabel(s: ISODate): string {
  return WEEKDAYS_VI[parseDate(s).getDay()];
}

// Lấy N ngày gần nhất (bao gồm hôm nay), cũ -> mới
export function lastNDays(n: number, end: ISODate = todayStr()): ISODate[] {
  const out: ISODate[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}
