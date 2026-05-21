/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_PARK_ACTIVITY_PARK?: 'magic-kingdom' | 'epcot' | 'hollywood-studios' | 'animal-kingdom';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
