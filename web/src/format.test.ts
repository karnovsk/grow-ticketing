import { describe, expect, test } from 'vitest';
import { itemNames, collectItemNames, itemTint, ITEM_TINT_COUNT, formatAmount, formatTimestamp, formatDateShort } from './format';
import { setLang } from './i18n';

describe('itemNames', () => {
  test('lists item names without quantities', () => {
    expect(
      itemNames([
        { name: 'Widget', quantity: 1 },
        { name: 'Gadget', quantity: 1 },
      ]),
    ).toEqual(['Widget', 'Gadget']);
  });

  test('returns a translated message for an empty list', () => {
    setLang('en');
    expect(itemNames([])).toEqual(['No items']);
    setLang('he');
    expect(itemNames([])).toEqual(['אין פריטים']);
  });
});

describe('collectItemNames', () => {
  test('returns distinct names in first-seen order', () => {
    const tickets = [
      { items: [{ name: 'Beer', quantity: 1 }] },
      { items: [{ name: 'Wine', quantity: 1 }, { name: 'Beer', quantity: 1 }] },
    ];
    expect(collectItemNames(tickets)).toEqual(['Beer', 'Wine']);
  });
});

describe('itemTint', () => {
  test('is stable and within range', () => {
    expect(itemTint('Beer')).toBe(itemTint('Beer'));
    for (const name of ['Beer', 'Wine', 'כרטיס כניסה', '']) {
      expect(itemTint(name)).toBeGreaterThanOrEqual(0);
      expect(itemTint(name)).toBeLessThan(ITEM_TINT_COUNT);
    }
  });
});

describe('formatAmount', () => {
  test('formats whole amounts without decimals and fractional ones with two', () => {
    setLang('en');
    expect(formatAmount(60)).toBe('₪60');
    expect(formatAmount(12.5)).toBe('₪12.50');
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
