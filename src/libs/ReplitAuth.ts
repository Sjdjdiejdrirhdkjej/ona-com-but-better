import {
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  dynamicClientRegistration,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  authorizationCodeGrant,
} from 'openid-client';
import type { Configuration } from 'openid-client';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

const ISSUER_URL = new URL('https://replit.com/oidc');
const DEFAULT_RETURN_TO = '/app';

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type OidcSessionData = {
  user?: SessionUser;
  oidcState?: string;
  oidcNonce?: string;
  codeVerifier?: string;
  returnTo?: string;
  authOrigin?: string;
};

const SESSION_OPTIONS = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'replit_auth_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

const cachedConfigs = new Map<string, Configuration>();

export function getPrimaryDomain(): string {
  const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
  if (!raw) throw new Error('REPLIT_DOMAINS or REPLIT_DEV_DOMAIN env var is not set');
  return raw.split(',')[0]!.trim();
}

function normalizeOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported request protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}

function getConfiguredHosts(): Set<string> {
  const hosts = new Set<string>();
  const rawValues = [
    process.env.REPLIT_DOMAINS,
    process.env.REPLIT_DEV_DOMAIN,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean);

  for (const rawValue of rawValues) {
    for (const value of rawValue!.split(',')) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
        hosts.add(parsed.host.toLowerCase());
      } catch {
      }
    }
  }

  return hosts;
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
}

function isReplitHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase();
  return !!hostname && (
    hostname.endsWith('.replit.dev')
    || hostname.endsWith('.repl.co')
    || hostname.endsWith('.replit.app')
  );
}

function isAllowedHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  return isLocalHost(normalizedHost) || isReplitHost(normalizedHost) || getConfiguredHosts().has(normalizedHost);
}

export function getAppBaseUrl(request?: Request): string {
  if (!request) {
    return normalizeOrigin(`https://${getPrimaryDomain()}`);
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  if (host) {
    if (!isAllowedHost(host)) {
      return normalizeOrigin(`https://${getPrimaryDomain()}`);
    }

    const proto = isLocalHost(host) ? (forwardedProto || 'http') : 'https';
    return normalizeOrigin(`${proto}://${host}`);
  }

  return normalizeOrigin(new URL(request.url).origin);
}

export function getRedirectUri(baseUrl?: string): string {
  const origin = baseUrl ? normalizeOrigin(baseUrl) : getAppBaseUrl();
  return `${origin}/api/callback`;
}

export function getSafeReturnPath(returnTo: string | null | undefined, baseUrl: string): string {
  if (!returnTo) {
    return DEFAULT_RETURN_TO;
  }

  try {
    const base = new URL(baseUrl);
    const parsed = new URL(returnTo, base);

    if (parsed.origin !== base.origin || !parsed.pathname.startsWith('/')) {
      return DEFAULT_RETURN_TO;
    }

    if (parsed.pathname.startsWith('/api/')) {
      return DEFAULT_RETURN_TO;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

export async function getReplitOidcConfig(redirectUri = getRedirectUri()): Promise<Configuration> {
  const cached = cachedConfigs.get(redirectUri);
  if (cached) return cached;

  const config = await dynamicClientRegistration(
    ISSUER_URL,
    {
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      client_name: 'ONA App',
    },
  );

  cachedConfigs.set(redirectUri, config);
  return config;
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<OidcSessionData>(cookieStore, SESSION_OPTIONS);
}

export async function buildReplitLoginUrl(config: Configuration, redirectUri = getRedirectUri()): Promise<{ url: URL; state: string; nonce: string; codeVerifier: string }> {
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();
  const nonce = randomNonce();

  const url = buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url, state, nonce, codeVerifier };
}

export { authorizationCodeGrant };
