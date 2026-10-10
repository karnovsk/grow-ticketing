/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_THEME?: string;
  // ISO 4217 code for amounts shown in the staff app; defaults to ILS.
  readonly VITE_CURRENCY?: string;
}
