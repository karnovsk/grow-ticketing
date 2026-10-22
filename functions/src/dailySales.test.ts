import { salesDayKey } from './dailySales';

describe('salesDayKey', () => {
  test('uses the venue day, not UTC, just after local midnight', () => {
    // 00:30 on Oct 22 in Jerusalem (UTC+3 in October) is still Oct 21 in UTC.
    expect(salesDayKey(new Date('2026-10-21T21:30:00Z'))).toBe('2026-10-22');
  });

  test('keeps a late-evening sale on the same local day', () => {
    expect(salesDayKey(new Date('2026-10-22T20:59:00Z'))).toBe('2026-10-22');
  });

  test('follows the winter offset (UTC+2)', () => {
    expect(salesDayKey(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
    expect(salesDayKey(new Date('2026-12-31T21:30:00Z'))).toBe('2026-12-31');
  });
});
