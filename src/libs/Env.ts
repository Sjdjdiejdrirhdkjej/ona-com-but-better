import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod/v4';

export const Env = createEnv({
  server: {
    DATABASE_URL: z.string().optional(),
    DAYTONA_API_KEY: z.string().optional(),
    POSTGRES_DATABASE_URL: z.string().optional(),
    POSTGRES_PRISMA_URL: z.string().optional(),
    POSTGRES_URL: z.string().optional(),
    POSTGRES_URL_NON_POOLING: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DAYTONA_API_KEY: process.env.DAYTONA_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NODE_ENV: process.env.NODE_ENV,
    POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
