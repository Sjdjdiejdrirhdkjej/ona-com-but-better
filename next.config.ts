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
  transpilePackages: [
    'react-markdown',
    'rehype-highlight',
    'remark-gfm',
    'remark-parse',
    'rehype-parse',
    'unified',
    'bail',
    'is-plain-obj',
    'trough',
    'vfile',
    'vfile-message',
    'unist-util-stringify-position',
    'mdast-util-from-markdown',
    'mdast-util-to-markdown',
    'mdast-util-gfm',
    'micromark',
    'decode-named-character-reference',
    'character-entities',
    'hast-util-to-jsx-runtime',
    'hast-util-raw',
    'hastscript',
    'property-information',
    'space-separated-tokens',
    'comma-separated-tokens',
    'lowlight',
  ],
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
