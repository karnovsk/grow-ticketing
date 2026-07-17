import { describe, expect, test } from 'vitest';
import { formatItemList, formatTimestamp } from './format';

describe('formatItemList', () => {
  test('joins multiple items with quantities', () => {
    expect(
      formatItemList([
        { name: 'Widget', quantity: 2 },
        { name: 'Gadget', quantity: 1 },
      ]),
    ).toBe('2 x Widget, 1 x Gadget');
  });

  test('returns a message for an empty list', () => {
    expect(formatItemList([])).toBe('No items');
  });
});

describe('formatTimestamp', () => {
  test('formats a unix seconds timestamp as a locale string', () => {
    const result = formatTimestamp(0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
