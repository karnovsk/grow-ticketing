/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_THEME?: string;
  // ISO 4217 code for amounts shown in the staff app; defaults to ILS.
  readonly VITE_CURRENCY?: string;
  // Per-language app title (header, login screen, browser tab); generic defaults when unset.
  readonly VITE_APP_TITLE_EN?: string;
  readonly VITE_APP_TITLE_HE?: string;
}
