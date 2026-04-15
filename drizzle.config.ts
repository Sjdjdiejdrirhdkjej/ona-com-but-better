import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './migrations',
  schema: './src/models/Schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL
      ?? process.env.POSTGRES_PRISMA_URL
      ?? process.env.POSTGRES_URL_NON_POOLING
      ?? process.env.POSTGRES_DATABASE_URL
      ?? process.env.DATABASE_URL
      ?? '',
  },
  verbose: true,
  strict: true,
});
