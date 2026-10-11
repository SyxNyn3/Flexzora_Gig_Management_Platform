/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** May be unset — guard reads via `isStripeDemoMode` before use. */
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  /** 'true' to show the Google OAuth button (requires a configured provider). */
  readonly VITE_ENABLE_GOOGLE_AUTH?: string;
  /** 'true' to show the Apple OAuth button (requires a configured provider). */
  readonly VITE_ENABLE_APPLE_AUTH?: string;
  /** 'true' to enable the Company Copilot panel. */
  readonly VITE_ENABLE_COPILOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
