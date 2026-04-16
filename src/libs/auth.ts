import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

const databaseUrl
  = process.env.POSTGRES_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.POSTGRES_DATABASE_URL
  ?? process.env.DATABASE_URL;

const isLocal = databaseUrl
  ? databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
  : true;

const replitDomain = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : undefined;

const appUrl
  = process.env.BETTER_AUTH_URL
  ?? process.env.NEXT_PUBLIC_APP_URL
  ?? replitDomain;

export const auth = betterAuth({
  database: new Pool({
    connectionString: databaseUrl,
    ssl: !isLocal ? true : undefined,
  }),
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [
    appUrl ?? '',
    process.env.NEXT_PUBLIC_APP_URL ?? '',
  ].filter(Boolean),
});
