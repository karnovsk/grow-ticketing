import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from './firebaseClient';
import type { Lang } from './i18n';

export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export type PasswordResetOutcome = 'sent' | 'invalidEmail' | 'tooManyRequests' | 'failed';

// With email enumeration protection on (Authentication → Settings), Firebase
// reports success for unknown addresses too, so 'sent' never confirms that a
// staff account exists — and the UI must not claim it does.
export async function requestPasswordReset(email: string, lang: Lang): Promise<PasswordResetOutcome> {
  // Picks the Hebrew or English version of the console's reset-email template.
  auth.languageCode = lang;
  // The link's "continue" button returns to wherever this app is served
  // (habaronit.com/staff in production), derived rather than hardcoded so
  // the codebase stays generic across deployments.
  const continueUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  try {
    try {
      await sendPasswordResetEmail(auth, email, { url: continueUrl });
    } catch (error) {
      // The continue URL's domain must be in Authentication → Settings →
      // Authorized domains. Hosts that aren't (preview channels, a LAN IP in
      // dev) still get a working reset email, just without the return link.
      if (!(error instanceof FirebaseError) || error.code !== 'auth/unauthorized-continue-uri') throw error;
      await sendPasswordResetEmail(auth, email);
    }
    return 'sent';
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'auth/invalid-email' || code === 'auth/missing-email') return 'invalidEmail';
    if (code === 'auth/too-many-requests') return 'tooManyRequests';
    return 'failed';
  }
}
