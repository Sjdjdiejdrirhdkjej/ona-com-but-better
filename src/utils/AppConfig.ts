import type { LocalePrefixMode } from 'next-intl/routing';

const localePrefix: LocalePrefixMode = 'as-needed';

export const AppConfig = {
  name: 'ONA',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localePrefix,
};
