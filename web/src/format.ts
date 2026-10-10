import { t, localeTag } from './i18n';

export interface FormatItem {
  name: string;
  quantity: number;
}

// Grow's payload carries no per-item quantity — only the total paid — so items
// are always shown by name alone, with the amount shown once per ticket.
export function itemNames(items: FormatItem[]): string[] {
  return items.length === 0 ? [t('noItems')] : items.map((item) => item.name);
}

// Distinct item names across tickets, in first-seen order, for the dashboard's
// item filter.
export function collectItemNames(tickets: { items: FormatItem[] }[]): string[] {
  const names = new Set<string>();
  for (const ticket of tickets) {
    for (const item of ticket.items) names.add(item.name);
  }
  return [...names];
}

// Number of distinct item tints in style.css (.item-tag[data-tint]).
export const ITEM_TINT_COUNT = 6;

// A stable tint per item name, so the same item reads the same color on every
// screen and every day — a glance cue only; the name is always shown too.
export function itemTint(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % ITEM_TINT_COUNT;
}

const CURRENCY = import.meta.env.VITE_CURRENCY || 'ILS';

export function formatAmount(sum: number): string {
  return new Intl.NumberFormat(localeTag(), {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: Number.isInteger(sum) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(sum);
}

export function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(localeTag());
}

export function formatDateShort(seconds: number): string {
  const date = new Date(seconds * 1000);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}
