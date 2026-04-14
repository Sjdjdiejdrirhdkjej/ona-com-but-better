# Ona — AI Background Software Engineering Platform

## Project Overview
An Ona.com clone — a platform for AI background software engineering agents. The landing page visually matches ona.com, and `/app` is a real AI chat interface powered by Fireworks AI (Llama 4 Maverick) where users can issue tasks to background agents that produce pull requests.

## Architecture
- **Framework**: Next.js 15 with App Router and Turbopack
- **Database**: PGLite (embedded PostgreSQL, no Docker needed) — runs as a local socket server (`pglite-server --db=local.db`)
- **ORM**: Drizzle ORM
- **Styling**: Tailwind CSS v4
- **i18n**: next-intl with `[locale]` routing, locales en/fr, `as-needed` prefix (so `/app` works without prefix)
- **AI**: Fireworks AI — Kimi K2.5 (`accounts/fireworks/models/kimi-k2p5`), streaming, vision/image support, 262k context, tool-use
- **Package manager**: npm (with `legacy-peer-deps=true` in `.npmrc`)

## Replit Configuration
- **Dev server**: port 5000, bound to `0.0.0.0` (required for Replit preview)
- **Workflow**: "Start application" runs `npm run dev` (starts PGLite file server + Next.js dev server in parallel)
- **Secrets**: `FIREWORKS_API_KEY` (Fireworks AI)

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
- System prompt positions Ona as a background software engineering agent platform
- Suggestion chips: Weekly digest, Review PRs, Find CVEs, COBOL migration

## Development
```bash
npm run dev          # Start dev server + PGLite
npm run build        # Build for production
npm run db:generate  # Generate Drizzle migrations
npm run db:studio    # Open Drizzle Studio
```
