import type { LocalePrefixMode } from 'next-intl/routing';

const localePrefix: LocalePrefixMode = 'as-needed';

export const AppConfig = {
  name: 'Ona',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localePrefix,
};
