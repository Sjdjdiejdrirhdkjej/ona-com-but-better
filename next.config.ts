import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const baseConfig: NextConfig = {
  eslint: {
    dirs: ['.'],
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    '*.replit.dev',
    '*.kirk.replit.dev',
    '*.picard.replit.dev',
    '*.repl.co',
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  serverExternalPackages: ['@daytonaio/sdk', 'playwright', 'ws'],
};

const nextIntlConfig = createNextIntlPlugin('./src/libs/I18n.ts')(baseConfig);

const configWithPlugins = nextIntlConfig;

export default configWithPlugins;
