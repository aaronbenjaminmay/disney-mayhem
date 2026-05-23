/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_PARK_ACTIVITY_PARK?: 'magic-kingdom' | 'epcot' | 'hollywood-studios' | 'animal-kingdom';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TRIP_ID?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
