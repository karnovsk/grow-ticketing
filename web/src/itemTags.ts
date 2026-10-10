// web/src/itemTags.ts
import { itemNames, itemTint, formatAmount, FormatItem } from './format';

// What was bought is the one thing staff must not misread at the counter, so
// every screen shows it the same way: one tinted tag per item name, then the
// amount paid. There is no quantity — Grow only sends the total.
export function renderItemLine(ticket: { items: FormatItem[]; paymentSum: number }, size: 'sm' | 'lg' = 'sm') {
  const line = document.createElement('span');
  line.className = `item-line item-line-${size}`;
  for (const name of itemNames(ticket.items)) {
    const tag = document.createElement('span');
    tag.className = 'item-tag';
    tag.dataset.tint = String(itemTint(name));
    tag.textContent = name;
    tag.title = name;
    line.appendChild(tag);
  }
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = formatAmount(ticket.paymentSum);
  line.appendChild(amount);
  return line;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 7v6M12 16.5v.5',
  cross: 'M7 7l10 10M17 7L7 17',
} as const;

export type IconName = keyof typeof ICON_PATHS;

// Decorative: every icon sits next to text that already says the same thing.
export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}

export function statusPill(status: 'issued' | 'validated', label: string): HTMLSpanElement {
  const pill = document.createElement('span');
  pill.className = `pill pill-${status}`;
  if (status === 'validated') pill.appendChild(icon('check', 'icon icon-sm'));
  pill.append(label);
  return pill;
}
