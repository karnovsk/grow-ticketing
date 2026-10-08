import { resolveRootRedirect } from './rootRedirect';

describe('resolveRootRedirect', () => {
  const original = process.env.ROOT_REDIRECT_URL;

  afterEach(() => {
    process.env.ROOT_REDIRECT_URL = original;
  });

  test('redirects to the configured URL', () => {
    process.env.ROOT_REDIRECT_URL = 'https://example.com/menu';
    expect(resolveRootRedirect()).toEqual({ status: 302, location: 'https://example.com/menu' });
  });

  test('returns 500 with no location when ROOT_REDIRECT_URL is not configured', () => {
    delete process.env.ROOT_REDIRECT_URL;
    expect(resolveRootRedirect()).toEqual({ status: 500, location: null });
  });
});
