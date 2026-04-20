# Project knowledge

## What this is

**ONA but OPEN SOURCE** — an open-source clone of the [Ona](https://ona.com) platform: a full-stack AI background software engineering agent. Users describe tasks in a chat UI, and an autonomous agent uses GitHub, Daytona sandboxes, a Librarian research subagent, an Oracle deep-reasoning subagent, and a Browser Use subagent to deliver changes end-to-end (task in → pull request out).

Built with Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + Drizzle ORM + PostgreSQL, deployed via Replit/Vercel.

## Quickstart

- **Prereqs:** Node 22 (see `engines` in `package.json`), npm with `legacy-peer-deps=true` (`.npmrc`).
- **Install:** `npm install` (on Replit, use the Replit package installer instead — see `replit.md` "Replit Installation" section; raw `npm install` hits `ENOTEMPTY` errors there).
- **Dev:** `npm run dev` — starts Next.js with Turbopack on port **5000**, host `0.0.0.0`.
- **Build:** `npm run build`
- **Start prod:** `npm run start` (port 5000)
- **DB migrations:** `npm run db:generate` (generates from `src/models/Schema.ts` into `migrations/`)
- **DB studio:** `npm run db:studio`
- **Clean:** `npm run clean` (removes `.next`, `out`, `coverage`)

> After code/dependency changes on Replit, restart the "Start application" workflow.

## Required env vars

Create `.env.local` for local dev. Key vars (see `src/libs/Env.ts`):

- **DB (tried in order):** `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_DATABASE_URL`, `DATABASE_URL`
- **Session:** `SESSION_SECRET` (32+ chars) — cookie name `replit_auth_session`
- **AI:** `FIREWORKS_API_KEY` (+ optional model overrides like `FIREWORKS_BROWSER_MODEL`)
- **Sandboxes:** `DAYTONA_API_KEY`
- **Research/Browser:** `FIRECRAWL_API_KEY`
- **GitHub OAuth device flow:** `GITHUB_CLIENT_ID`
- **Credits (optional):** `CREDITS_PER_1000_TOKENS`

## Architecture

### App Router (`src/app/[locale]/`)

- `(marketing)/` — ona.com-style landing pages (home, about, portfolio). ampcode.com-inspired editorial layout.
- `app/page.tsx` — **the** chat UI (a ~2100-line client component). Streaming SSE, tool-step visualization, todo panel, @-mention file picker, image upload/paste, model selector, theme toggle.
- `(auth)/` — sign-in/up, dashboard.
- `sandbox-modify/[sandboxId]/page.tsx` — per-sandbox env var editor (localStorage-backed).

### API routes (`src/app/api/`)

- **`chat/route.ts`** — central agent endpoint. Runs the "Ultrawork" agentic loop with Fireworks AI, streaming SSE events. Handles tool calls for GitHub, Daytona, Librarian, Oracle, Browser Use. Largest & most critical file.
- `conversations/` — CRUD for conversation history.
- `jobs/[jobId]/events/` — SSE event stream for background job progress (reconnect polling every 3s).
- `github/device/` — GitHub OAuth device flow (start/poll/disconnect).
- `login`, `callback`, `logout` — Replit OIDC (PKCE + nonce via `openid-client`).
- `auth/user/` — current user.
- `sandbox/files/` — list files in a Daytona sandbox.
- `settings/api-keys/` — per-user hashed API keys (raw shown once; used as `Authorization: Bearer <key>`).

### Core libraries (`src/libs/`)

- **Daytona.ts** — sandbox tools (`sandbox_create/exec/write_file/read_file/list_files/delete/git_clone`).
- **GitHub.ts** — full GitHub API; `github_*` tools for repos/files/branches/commits/PRs/issues. **Blocks direct writes to default branch by default** — feature branches + PRs only.
- **Librarian.ts** — research subagent (up to 15 iterations). Tools: `scrape_page` (Firecrawl), `fetch_url`, `search_web` (DuckDuckGo), `npm_package`, `github_readme`. Exposed as `call_librarian`.
- **Oracle.ts** — deep-reasoning subagent (GLM 5.1). Exposed as `call_oracle` for complex architecture/debugging/synthesis.
- **BrowserUse.ts** — browser automation (up to 25 iterations). Firecrawl CDP + Playwright, accessibility tree (no vision model). Exposed as `call_browser_use`.
- **DB.ts** — Drizzle + pg. Auto-migrates on startup; **skips migrations during `next build`**; build-time proxy when no DB URL.
- **session.ts** / **auth.ts** — iron-session config (`replit_auth_session`, SameSite=Lax, 7-day expiry).
- **Env.ts** — centralized env access (no validation lib; reads `process.env`).
- **ApiKeys.ts** — hashing/verification for programmatic API keys.

### AI models (defined in `chat/route.ts` as `ONA_MODELS`)

- `ona-max` — GLM 5.1 (default for accuracy)
- `ona-max-fast` — Kimi K2.5 Turbo (fastest)
- `ona-mini` — DeepSeek V3.2

All route through Fireworks AI with a fallback chain; overridable via env.

### Ultrawork agent loop

AI plans with `todo_write`, tracks with `todo_read`, must call `task_complete` to exit. Loop re-injects the AI if it stops with pending todos. **Loop detection:** stops if 3 consecutive tool-call batches are identical. **Intent-without-action detection:** catches narrated plans with no actual tool calls. **Anti-cutoff:** `finish_reason=length` auto-injects a continuation turn.

### Background execution

Agent loop runs as a **detached server-side async** — if the tab closes, work continues. State persists in `agent_jobs` + `agent_events`. Page reload → polls `/api/jobs/[jobId]/events?after=<cursor>` to replay events. Tool-call batches are saved as `tool_steps` messages and render permanently.

### Database schema (`src/models/Schema.ts`)

- `user_github_tokens`, `api_keys`, `user_credits`, `counter`
- `conversations`, `messages` (roles: `user` | `assistant` | `tool_steps`)
- `agent_jobs` (status: `running | done | error`)
- `agent_events` (sandbox_booting, sandbox_ready, tool_call, tool_start, tool_complete, tool_done, next_assistant_msg, content, error, done)

Migrations in `./migrations/` auto-applied at runtime (not at build).

### i18n

`next-intl` with `[locale]` routing, `as-needed` prefix (so `/app` works without prefix). Locales: `en` (default), `fr`. Files in `src/locales/`. Crowdin auto-generates French — **only edit `en.json`**.

### Auth

1. **Replit OIDC** (primary) — `openid-client` PKCE + nonce against `https://replit.com/oidc` with dynamic client registration. Session in iron-session cookie.
2. **GitHub device flow** (for repo access) — token in session cookie + persisted to `user_github_tokens`.

Middleware (`src/middleware.ts`) protects `/app` (requires `replit_session` cookie), redirects authed users from marketing root to `/app`. **API routes bypass middleware entirely.**

Mobile auth opens Replit sign-in in a separate tab and polls `/api/auth/user?optional=1`; desktop uses direct `/api/login?returnTo=...`. Completion signals via BroadcastChannel/localStorage.

## Conventions

- **TypeScript:** strict mode with `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`. Target ES2022.
- **Lint:** ESLint with `@antfu/eslint-config` + Next.js/JSX-a11y/Jest-DOM/Playwright/Storybook plugins. Overrides: allow top-level await, **use `type` not `interface`**, 1tbs brace style. Auto-fixes on commit via **lefthook**.
- **Styling:** Tailwind CSS v4 (PostCSS). App background `#fbfbfa` light / `#101010` dark. Serif font: `Georgia, "Times New Roman", serif`.
- **Testing:** Vitest for unit/integration (`src/**/*.test.ts`, UI tests in `**/*.test.tsx` with Playwright browser); Playwright E2E in `tests/e2e/`.
- **Data-driven content:** keep marketing copy/assets in config modules, not hardcoded in components (see `todo.md` for the 1:1 ona.com clone plan).
- **File-edit tool steps** attach unified diffs (for `sandbox_write_file`, `github_upsert_file`, `github_delete_file`) — the UI renders a collapsible diff panel.
- **Credits:** 1 credit = 1 cent. Deducted on each provider call using `CREDITS_PER_1000_TOKENS` (fallback: 1/1k tokens, 1-credit min).

## Gotchas

- **Port 5000, host 0.0.0.0** — required for Replit preview. Don't change.
- **`@next/swc-linux-x64-gnu` must match the Next.js version exactly** — otherwise silent fallback to slow JS transforms. It's an `optionalDependencies` entry.
- **Never direct-push to default branch.** `GitHub.ts` enforces branch + PR unless the user explicitly requests a direct push.
- **DB migrations skip during `next build`.** Runtime fails explicitly if no supported DB URL is configured.
- **Hydration:** theme is applied client-side via `src/components/ThemeInitializer.tsx` to avoid server/client HTML attribute mismatches in the Replit preview.
- **Browser compat fallbacks** (clipboard, ID generation, ResizeObserver) live in `src/utils/browserCompat.ts`.
- **On Replit, do NOT use raw `npm install`** — use the Replit package installer (see `replit.md` for the exact batches). Raw `npm install` hits `ENOTEMPTY` / rename conflicts.
- **SSE stream drops:** the client keeps the active job, resets job-generated UI messages, and replays persisted events from the beginning to avoid duplicate streamed text.
- **Vercel build:** uses `npm install --legacy-peer-deps` + `npm run build`. No local PGlite server started; no recursive `build:*` scripts.
- **Locale files:** only edit `en.json`; `fr.json` is Crowdin-managed.
