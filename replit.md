# ONA but OPEN SOURCE — AI Background Software Engineering Platform

## Project Overview
An open-source platform for AI background software engineering agents. The landing page uses a minimalist AI-agent platform aesthetic, and `/app` is a real AI chat interface powered by Fireworks AI where users can issue tasks to background agents that produce pull requests. The app is branded as “ONA but OPEN SOURCE”.

## Architecture
- **Framework**: Next.js 15 with App Router and Turbopack
- **Database**: PostgreSQL using Drizzle ORM; Vercel-style env vars are preferred in this order: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_DATABASE_URL`, then `DATABASE_URL`
- **ORM**: Drizzle ORM
- **Styling**: Tailwind CSS v4
- **i18n**: next-intl with `[locale]` routing, locales en/fr, `as-needed` prefix (so `/app` works without prefix)
- **AI**: Fireworks AI — main chat ONA Max uses Kimi K2.5 (`accounts/fireworks/models/kimi-k2p5`); ONA Max Fast uses Kimi K2.5 Turbo (`accounts/fireworks/routers/kimi-k2p5-turbo`); the Librarian research subagent uses Kimi K2 Thinking (`accounts/fireworks/models/kimi-k2-thinking`); the Browser Use Expert subagent uses Kimi K2 Instruct 0905 (`accounts/fireworks/models/kimi-k2-instruct-0905`) — all overridable via env vars
- **Package manager**: npm (with `legacy-peer-deps=true` in `.npmrc`)

## Replit Configuration
- **Dev server**: port 5000, bound to `0.0.0.0` (required for Replit preview)
- **Workflow**: "Start application" runs `npm run dev` (Next.js dev server on port 5000)
- **Preview compatibility**: `next.config.ts` allows Replit dev origins including the current `REPLIT_DEV_DOMAIN` so proxied `_next` assets load correctly.
- **Secrets**: `FIREWORKS_API_KEY` (Fireworks AI)

## Vercel Build Configuration
- **Build command**: `npm run build`, which runs `next build` directly
- **Install command**: `npm install --legacy-peer-deps`
- The build no longer starts a local PGlite server or expands recursive `build:*` scripts.
- `src/libs/DB.ts` skips Drizzle migrations during Next.js production builds and fails explicitly at runtime if no supported database connection string is configured.

## Key Files
- `src/app/[locale]/(marketing)/page.tsx` — Full ona.com landing page (hero, features, testimonials, footer)
- `src/app/[locale]/app/page.tsx` — Chat UI at /app with real AI streaming + image upload
- `src/app/api/chat/route.ts` — Server-side streaming API route calling Fireworks AI
- `src/app/[locale]/app/layout.tsx` — Minimal layout for /app
- `src/app/[locale]/(marketing)/layout.tsx` — Marketing nav with NavPromptBox + Get Started
- `src/components/MobileMenu.tsx` — Mobile hamburger with prompt box
- `src/components/NavPromptBox.tsx` — Desktop navbar prompt input
- `src/libs/Env.ts` — Environment variable validation

## Design Constants
- Background: `#f7f6f2`
- Serif font: `Georgia, "Times New Roman", serif`
- Dark navy (announcement bar): `#18182a`
- Agent avatar gradient: `linear-gradient(135deg,#7b68ee,#9370db)`

## Chat Interface (/app)
- Real streaming AI responses via `src/app/api/chat/route.ts`
- Image upload (file picker button) and paste-from-clipboard support
- System prompt positions ONA but OPEN SOURCE as a background software engineering agent platform
- Suggestion chips: Inspect repos, Clone a repo, Review PRs, Find CVEs
- Librarian research tasks are handled by `src/libs/Librarian.ts` as an autonomous source-grounded research analyst with a longer research loop and detailed implementation-ready reports
- Browser automation tasks are handled by `src/libs/BrowserUse.ts` — the Browser Use Expert subagent uses Firecrawl's cloud-hosted browser (full JS rendering) to navigate, click, fill forms, scroll, screenshot, and extract data from live websites. Invoked via `call_browser_use` tool — internal tools (`browse`, `screenshot`, `search_web`) are never exposed to the main AI. Model overridable via `FIREWORKS_BROWSER_MODEL` env var.

## Background Agent System
- **Persistent tool steps**: Tool call batches (e.g., "Reading file", "Creating branch") are saved as `tool_steps` messages in the DB and rendered permanently in the conversation — they never disappear
- **Background execution**: The agent loop runs as a detached server-side async. If the tab closes, work continues on the server. Progress is written to `agent_events` table in real-time
- **Reconnect polling**: On page load, conversations with an active job ID start polling `/api/jobs/[jobId]/events?after=<cursor>` every 3 seconds. Events are replayed to reconstruct state
- **Server-side message saving**: The API route saves both `tool_steps` messages and `assistant` messages directly to the `messages` table — the frontend no longer saves assistant messages
- **`BackgroundWorkingBanner`**: Shows "Working in background…" indicator in the chat when the agent is running after SSE disconnect

## Database Schema
- `conversations` — conversation records
- `messages` — chat messages; `role` can be `user`, `assistant`, or `tool_steps` (JSON array of ToolStep)
- `agent_jobs` — one per `/api/chat` call; status: `running | done | error`
- `agent_events` — sequential event log per job (tool_call, tool_start, tool_complete, tool_done, content, error, done)

## Development
```bash
npm run dev          # Start Next.js dev server on port 5000
npm run build        # Build for production
npm run db:generate  # Generate Drizzle migrations
npm run db:studio    # Open Drizzle Studio
```

## Replit Installation (for new sessions)

**Do not use `npm install` directly** — it consistently fails in Replit with `ENOTEMPTY` rename errors or silent timeouts because the environment cannot cleanly reorganize a pre-existing `node_modules` tree.

### Correct setup steps for a fresh session

1. **Provision the database** via the Replit code execution sandbox:
   ```javascript
   const status = await checkDatabase();
   if (!status.provisioned) {
     await createDatabase();
   }
   ```
   This sets `DATABASE_URL` and related env vars automatically.

2. **If `node_modules` is corrupted or missing binaries**, remove it first:
   ```bash
   rm -rf /home/runner/workspace/node_modules
   ```

3. **Install packages using the Replit package installer** (not `npm install`), split into batches:

   **Core / runtime:**
   ```javascript
   await installLanguagePackages({ language: "nodejs", packages: [
     "next", "react", "react-dom"
   ]});
   ```

   **App dependencies:**
   ```javascript
   await installLanguagePackages({ language: "nodejs", packages: [
     "next-intl", "@t3-oss/env-nextjs", "zod", "drizzle-orm",
    "pg", "pino", "pino-pretty", "posthog-js", "react-markdown", "rehype-highlight",
     "remark-gfm", "highlight.js", "react-hook-form",
     "@hookform/resolvers", "@electric-sql/pglite", "@daytonaio/sdk"
   ]});
   ```

   **Dev tools:**
   ```javascript
   await installLanguagePackages({ language: "nodejs", packages: [
     "tailwindcss", "@tailwindcss/postcss", "postcss", "typescript",
     "@types/node", "@types/react", "@types/react-dom", "@types/pg",
     "drizzle-kit", "npm-run-all2", "cross-env",
     "@electric-sql/pglite-socket", "dotenv-cli"
   ]});
   ```

4. **Restart the "Start application" workflow** — the app should compile and be ready.

### Why this works
Replit's native package installer handles dependency resolution and binary linking correctly in the NixOS container, whereas `npm install` races against the existing `node_modules` tree and hits filesystem rename conflicts (`ENOTEMPTY`).
