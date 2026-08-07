import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp);

// Opt-in local dev flag (see .env.example) — points the app at
// `firebase emulators:start` instead of production. Using the page's own
// hostname (rather than hardcoding 127.0.0.1) means this also works when
// the page is loaded from another device on the LAN via this machine's IP
// (firebase.json binds the emulators to 0.0.0.0 for that reason) — from
// localhost the emulator host is a trustworthy loopback origin so plain
// http:// works despite the page itself being https:// (vite-plugin-basic-ssl
// for camera access), but from a LAN IP the browser's mixed-content policy
// does NOT exempt it and will block these calls unless that device's browser
// is told to trust it (e.g. chrome://flags/#unsafely-treat-insecure-origin-as-secure
// with this machine's LAN origin added, on the *other* device).
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  const emulatorHost = window.location.hostname;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
}
