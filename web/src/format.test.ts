import { describe, expect, test } from 'vitest';
import { formatItemList, formatTimestamp } from './format';
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
