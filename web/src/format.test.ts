import { describe, expect, test } from 'vitest';
import { formatItemList, formatTimestamp, formatDateShort } from './format';
import { setLang } from './i18n';

describe('formatItemList', () => {
  test('joins multiple items with quantities', () => {
    setLang('en');
    expect(
      formatItemList([
        { name: 'Widget', quantity: 2 },
        { name: 'Gadget', quantity: 1 },
      ]),
    ).toBe('2 × Widget, 1 × Gadget');
  });

  test('returns a translated message for an empty list', () => {
    setLang('en');
    expect(formatItemList([])).toBe('No items');
    setLang('he');
    expect(formatItemList([])).toBe('אין פריטים');
  });
});

describe('formatTimestamp', () => {
  test('formats a unix seconds timestamp using the active locale', () => {
    setLang('en');
    const enResult = formatTimestamp(0);
    expect(typeof enResult).toBe('string');
    expect(enResult.length).toBeGreaterThan(0);

    setLang('he');
    const heResult = formatTimestamp(0);
    expect(typeof heResult).toBe('string');
    expect(heResult.length).toBeGreaterThan(0);
  });
});

describe('formatDateShort', () => {
  test('formats a unix seconds timestamp as dd/mm/yy', () => {
    const date = new Date(2026, 2, 5, 12, 0, 0);
    expect(formatDateShort(date.getTime() / 1000)).toBe('05/03/26');
  });

  test('pads single-digit day and month', () => {
    const date = new Date(2026, 0, 9, 12, 0, 0);
    expect(formatDateShort(date.getTime() / 1000)).toBe('09/01/26');
  });
});
