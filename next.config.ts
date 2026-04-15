import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import './src/libs/Env';

const baseConfig: NextConfig = {
  eslint: {
    dirs: ['.'],
  },
  allowedDevOrigins: ['*.replit.dev', '*.kirk.replit.dev', '*.repl.co'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'posthog.com',
      },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    forceSwcTransforms: false,
  },
};

const nextIntlConfig = createNextIntlPlugin('./src/libs/I18n.ts')(baseConfig);

const configWithPlugins = nextIntlConfig;

export default configWithPlugins;
