/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TESLA_CLIENT_ID: string;
  readonly VITE_TESLA_WEB_REDIRECT_URI: string;
  /** Stripe publishable key (safe to expose in browser) */
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
