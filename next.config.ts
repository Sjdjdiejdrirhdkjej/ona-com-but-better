import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';
import './src/libs/Env';

const baseConfig: NextConfig = {
  eslint: {
    dirs: ['.'],
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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

const configWithPlugins = process.env.ANALYZE === 'true'
  ? withBundleAnalyzer()(nextIntlConfig)
  : nextIntlConfig;

export default configWithPlugins;
