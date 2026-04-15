import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@/models/Schema';

// Stores the db connection in the global scope to prevent multiple instances due to hot reloading with Next.js
const globalForDb = globalThis as unknown as {
  drizzle: NodePgDatabase<typeof schema>;
};

const databaseUrl = process.env.POSTGRES_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.POSTGRES_DATABASE_URL
  ?? process.env.DATABASE_URL;
const isNextProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';

const createBuildTimeDb = () => {
  return new Proxy({}, {
    get() {
      throw new Error('Database access is unavailable during the Next.js production build.');
    },
  }) as NodePgDatabase<typeof schema>;
};

const createDbConnection = () => {
  if (!databaseUrl) {
    throw new Error('No database connection string is configured. Add POSTGRES_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, POSTGRES_DATABASE_URL, or DATABASE_URL before using database-backed routes.');
  }

  const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  const hasSSLParam = databaseUrl.includes('ssl=');
  return drizzle({
    connection: {
      connectionString: databaseUrl,
      ssl: !isLocal && !hasSSLParam ? true : undefined,
    },
    schema,
  });
};

const db = globalForDb.drizzle || (isNextProductionBuild && !databaseUrl ? createBuildTimeDb() : createDbConnection());

// Only store in global during development to prevent hot reload issues
if (process.env.NODE_ENV !== 'production') {
  globalForDb.drizzle = db;
}

if (!isNextProductionBuild) {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  });
}

export { db };
