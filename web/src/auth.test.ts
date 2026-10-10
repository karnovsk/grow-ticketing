import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';

const fakeAuth = vi.hoisted(() => ({ languageCode: null as string | null }));
vi.mock('./firebaseClient', () => ({ auth: fakeAuth }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { sendPasswordResetEmail } from 'firebase/auth';
import { requestPasswordReset } from './auth';

const sendMock = vi.mocked(sendPasswordResetEmail);

describe('requestPasswordReset', () => {
  beforeEach(() => {
    sendMock.mockReset();
    fakeAuth.languageCode = null;
  });

  test('sends in the active language with a link back to the app', async () => {
    sendMock.mockResolvedValue(undefined);
    await expect(requestPasswordReset('staff@example.com', 'he')).resolves.toBe('sent');
    expect(fakeAuth.languageCode).toBe('he');
    expect(sendMock).toHaveBeenCalledWith(fakeAuth, 'staff@example.com', {
      url: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
    });
  });

  test('retries without the return link when this host is not an authorized domain', async () => {
    sendMock
      .mockRejectedValueOnce(new FirebaseError('auth/unauthorized-continue-uri', 'nope'))
      .mockResolvedValueOnce(undefined);
    await expect(requestPasswordReset('staff@example.com', 'en')).resolves.toBe('sent');
    expect(sendMock).toHaveBeenLastCalledWith(fakeAuth, 'staff@example.com');
  });

  test.each([
    ['auth/invalid-email', 'invalidEmail'],
    ['auth/missing-email', 'invalidEmail'],
    ['auth/too-many-requests', 'tooManyRequests'],
    ['auth/network-request-failed', 'failed'],
  ])('maps %s to %s', async (code, outcome) => {
    sendMock.mockRejectedValue(new FirebaseError(code, 'error'));
    await expect(requestPasswordReset('staff@example.com', 'en')).resolves.toBe(outcome);
  });

  test('treats a non-Firebase error as a failure', async () => {
    sendMock.mockRejectedValue(new Error('boom'));
    await expect(requestPasswordReset('staff@example.com', 'en')).resolves.toBe('failed');
  });
});
