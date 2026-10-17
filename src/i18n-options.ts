import type {InitOptions} from 'i18next';

// Shared by the browser entry point and language-detection regression tests.
export const i18nOptions = {
  supportedLngs: ['en', 'zh', 'ko', 'ja', 'es', 'de'],
  load: 'languageOnly',
  fallbackLng: 'en',
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
  },
  debug: false,
  interpolation: {escapeValue: false},
} satisfies InitOptions;
