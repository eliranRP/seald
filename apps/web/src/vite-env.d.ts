/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Cookie-consent runtime exposed by `/scripts/cookie-consent.js`
 * (loaded from `apps/web/index.html` and the Astro landing's BaseLayout).
 * The script sets this on `window` once it has initialised; callers must
 * therefore null-check before invoking. See T-30 / `apps/landing/public/scripts/cookie-consent.js`.
 */
interface SealdConsentApi {
  openBanner(): void;
  getChoice(): 'accepted' | 'rejected' | null;
}

interface Window {
  SealdConsent?: SealdConsentApi;
}
