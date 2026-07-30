import { describe, expect, test } from 'vitest';
import { fuzzyMatch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  test('matches an exact substring', () => {
    expect(fuzzyMatch('dana', ['Dana Levi', 'dana@example.com', null])).not.toBeNull();
  });

  test('matches out-of-order characters as a subsequence', () => {
    expect(fuzzyMatch('dnlv', ['Dana Levi'])).not.toBeNull();
  });

  test('does not match when characters are missing', () => {
    expect(fuzzyMatch('danz', ['Dana Levi', 'dana@example.com'])).toBeNull();
  });

  test('is case-insensitive', () => {
    expect(fuzzyMatch('DANA', ['dana levi'])).not.toBeNull();
  });

  test('treats an empty query as matching everything', () => {
    expect(fuzzyMatch('', ['anything'])).not.toBeNull();
    expect(fuzzyMatch('   ', ['anything'])).not.toBeNull();
  });

  test('ignores null/empty candidate fields', () => {
    expect(fuzzyMatch('dana', [null, '', 'Dana Levi'])).not.toBeNull();
  });

  test('scores a contiguous match higher than a scattered one', () => {
    const contiguous = fuzzyMatch('dana', ['Dana Levi']);
    const scattered = fuzzyMatch('dana', ['D x a x n x a']);
    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(contiguous! > scattered!).toBe(true);
  });

  test('returns null when every candidate is null/empty and the query is non-empty', () => {
    expect(fuzzyMatch('dana', [null, ''])).toBeNull();
  });
});
