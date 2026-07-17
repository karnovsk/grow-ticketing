import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseClient';

export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
