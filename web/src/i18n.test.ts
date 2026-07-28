import { describe, expect, test, beforeEach } from 'vitest';
import { getLang, setLang, t, applyDir, localeTag, translations, TranslationKey } from './i18n';

describe('translations', () => {
  test('every key has a non-empty value in both languages', () => {
    const heKeys = Object.keys(translations.he).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(heKeys).toEqual(enKeys);
    for (const key of heKeys) {
      expect(translations.he[key as TranslationKey].length).toBeGreaterThan(0);
      expect(translations.en[key as TranslationKey].length).toBeGreaterThan(0);
    }
  });
});

describe('t', () => {
  beforeEach(() => setLang('en'));

  test('returns the string for the active language', () => {
    setLang('en');
    expect(t('navScan')).toBe('Scan');
    setLang('he');
    expect(t('navScan')).toBe('סריקה');
  });

  test('interpolates {{param}} placeholders', () => {
    setLang('en');
    expect(t('headerLoggedInAs', { email: 'a@b.com' })).toBe('Logged in as a@b.com');
  });
});

describe('getLang/setLang', () => {
  test('persists the active language to localStorage', () => {
    setLang('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(getLang()).toBe('en');
  });
});

describe('applyDir', () => {
  test('sets the document lang/dir attributes for the active language', () => {
    setLang('he');
    applyDir();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');

    setLang('en');
    applyDir();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('localeTag', () => {
  test('maps language to a BCP-47 tag', () => {
    setLang('he');
    expect(localeTag()).toBe('he-IL');
    setLang('en');
    expect(localeTag()).toBe('en-US');
  });
});
