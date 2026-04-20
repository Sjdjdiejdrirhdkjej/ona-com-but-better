import { eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { userCreditsSchema } from '@/models/Schema';

export type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Credits are cent-denominated: 1 credit = 1 cent.
 * The rate defaults to 1 credit per 1,000 tokens, overridable via
 * CREDITS_PER_1000_TOKENS env. Each successful AI provider call is charged a
 * minimum of 1 credit so micro-calls still register.
 */
const DEFAULT_CREDITS_PER_1000_TOKENS = 1;

function getRate(): number {
  const raw = process.env.CREDITS_PER_1000_TOKENS;
  if (!raw) return DEFAULT_CREDITS_PER_1000_TOKENS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CREDITS_PER_1000_TOKENS;
  return n;
}

export function computeCreditCost(usage: ProviderUsage | undefined): number {
  if (!usage) return 0;
  const total = usage.total_tokens
    ?? ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0));
  if (total <= 0) return 0;
  const rate = getRate();
  return Math.max(1, Math.ceil((total / 1000) * rate));
}

/**
 * Default signup grant, overridable via SIGNUP_CREDITS env. Must be an
 * integer >= 0; invalid values fall back to the default.
 */
const DEFAULT_SIGNUP_CREDITS = 500;

function getSignupCredits(): number {
  const raw = process.env.SIGNUP_CREDITS;
  if (raw === undefined || raw === '') return DEFAULT_SIGNUP_CREDITS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SIGNUP_CREDITS;
  return Math.floor(n);
}

/**
 * Seeds a starting credit balance for a newly signed-up user. Idempotent: if
 * the user already has a `user_credits` row (any balance, including 0 from a
 * prior auto-create), this is a no-op. Safe to call on every sign-in.
 *
 * Returns the number of credits seeded, or `0` if the user already existed or
 * the write failed.
 */
export async function seedUserCreditsIfNew(
  userId: string,
  amount: number = getSignupCredits(),
): Promise<number> {
  if (!userId || amount <= 0) return 0;
  try {
    const now = new Date();
    const rows = await db
      .insert(userCreditsSchema)
      .values({
        userId,
        credits: amount,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: userCreditsSchema.userId })
      .returning({ credits: userCreditsSchema.credits });
    return rows[0]?.credits ?? 0;
  } catch (err) {
    logger.warn({ err, userId, amount }, 'seedUserCreditsIfNew: failed to seed balance');
    return 0;
  }
}

export async function getUserCredits(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ credits: userCreditsSchema.credits })
      .from(userCreditsSchema)
      .where(eq(userCreditsSchema.userId, userId))
      .limit(1);
    return rows[0]?.credits ?? 0;
  } catch (err) {
    logger.warn({ err, userId }, 'getUserCredits: failed to read balance');
    return 0;
  }
}

/**
 * Atomically deducts `amount` credits from the user's balance. Creates the
 * row if it does not yet exist (with a negative balance for first-time users).
 *
 * Balances are allowed to go negative by design — this module only meters
 * usage. Callers that need to gate on balance should call `getUserCredits`
 * before invoking the provider.
 *
 * Returns the new balance, or `null` if the deduction could not be persisted.
 */
export async function deductCredits(userId: string, amount: number): Promise<number | null> {
  if (!userId || amount <= 0) {
    return null;
  }
  try {
    const now = new Date();
    const [row] = await db
      .insert(userCreditsSchema)
      .values({
        userId,
        credits: -amount,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userCreditsSchema.userId,
        set: {
          credits: sql`${userCreditsSchema.credits} - ${amount}`,
          updatedAt: now,
        },
      })
      .returning({ credits: userCreditsSchema.credits });

    return row?.credits ?? null;
  } catch (err) {
    logger.warn({ err, userId, amount }, 'deductCredits: failed to persist deduction');
    return null;
  }
}

/**
 * Convenience wrapper: compute cost from a provider usage object, deduct it,
 * and return `{ cost, balance }`. Meant to be invoked from the top-level
 * chat route after each provider call, so session-authed UI callers and
 * API-key callers are billed uniformly on the authenticated user's balance.
 */
export async function deductCreditsForUsage(
  userId: string,
  usage: ProviderUsage | undefined,
): Promise<{ cost: number; balance: number | null } | null> {
  const cost = computeCreditCost(usage);
  if (cost <= 0) return null;
  const balance = await deductCredits(userId, cost);
  return { cost, balance };
}
