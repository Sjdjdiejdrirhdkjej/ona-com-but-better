import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@/models/Schema';
import { logger } from '@/libs/Logger';

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoff(attempt: number): number {
  const exponentialDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
}

// Stores the db connection in the global scope to prevent multiple instances due to hot reloading with Next.js
const globalForDb = globalThis as unknown as {
  drizzle: NodePgDatabase<typeof schema> | undefined;
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

async function connectWithRetry(): Promise<NodePgDatabase<typeof schema>> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!databaseUrl) {
        throw new Error('No database connection string is configured. Add POSTGRES_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, POSTGRES_DATABASE_URL, or DATABASE_URL before using database-backed routes.');
      }

      const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
      const hasSSLParam = databaseUrl.includes('ssl=');
      const db = drizzle({
        connection: {
          connectionString: databaseUrl,
          ssl: !isLocal && !hasSSLParam ? true : undefined,
        },
        schema,
      });

      // Verify connection by executing a test query
      await db.execute('SELECT 1');

      logger.info(`Database connection established (attempt ${attempt}/${MAX_RETRIES})`);
      return db;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const isLastAttempt = attempt === MAX_RETRIES;
      
      logger.warn(`Database connection attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      
      if (!isLastAttempt) {
        const delay = calculateBackoff(attempt);
        logger.info(`Retrying database connection in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }

  const finalError = lastError ?? new Error('Failed to connect to database after maximum retries');
  logger.error('Database connection failed permanently after', MAX_RETRIES, 'attempts');
  throw finalError;
}

async function runMigrations(db: NodePgDatabase<typeof schema>): Promise<void> {
  if (isNextProductionBuild) {
    logger.warn('Skipping migrations during production build');
    return;
  }

  try {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), 'migrations'),
    });
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Database migration failed:', error);
    // Don't throw - the app might still work with existing schema
  }
}

// Initialize the database connection
const createDbConnection = async (): Promise<NodePgDatabase<typeof schema>> => {
  if (isNextProductionBuild && !databaseUrl) {
    return createBuildTimeDb();
  }

  const db = await connectWithRetry();
  await runMigrations(db);
  return db;
};

// Only initialize once and store in global during development to prevent hot reload issues
let dbPromise: Promise<NodePgDatabase<typeof schema>> | undefined;

if (process.env.NODE_ENV === 'production') {
  dbPromise = createDbConnection();
} else {
  if (!globalForDb.drizzle) {
    globalForDb.drizzle = undefined;
    dbPromise = createDbConnection().then(db => {
      globalForDb.drizzle = db;
      return db;
    });
  } else {
    dbPromise = Promise.resolve(globalForDb.drizzle);
  }
}

// Export a function to get the database instance
export async function getDb(): Promise<NodePgDatabase<typeof schema>> {
  if (!dbPromise) {
    dbPromise = createDbConnection();
  }
  return dbPromise;
}

// Keep synchronous export for backward compatibility
// This will be deprecated in favor of getDb()
export const db = globalForDb.drizzle ?? ({} as NodePgDatabase<typeof schema>);

// Re-export for convenience
export { schema };
