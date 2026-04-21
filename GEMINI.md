# GEMINI.md - ONA Project Context

This file provides critical context and instructions for AI agents working on the **ONA but OPEN SOURCE** project.

## Project Overview

**ONA** is an autonomous, background software engineering agent. It takes a task description and delivers end-to-end results (typically a Pull Request) by utilizing a suite of tools including GitHub, Daytona sandboxes, and specialized subagents.

### Tech Stack
- **Framework:** Next.js 15 (App Router) + React 19
- **Language:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL with Drizzle ORM
- **AI Provider:** Fireworks AI (Models: Kimi K2.5, Qwen3 Coder)
- **Infrastructure:** Daytona (Sandboxes), Firecrawl (Research), Iron Session (Auth)
- **I18n:** `next-intl` (Locales: `en`, `fr`)

## Core Agent Workflow: "Ultrawork Loop"

The ONA agent operates within a structured loop enforced by the system. For any multi-step task, the agent MUST follow this pattern:

1.  **Plan:** Immediately call `todo_write` with a complete breakdown of steps.
2.  **Execute & Update:** As steps are started and finished, call `todo_write` to update statuses (`pending` -> `in_progress` -> `done`).
3.  **Verify:** Use Daytona sandboxes (`sandbox_exec`) to run tests/builds before finalizing.
4.  **Complete:** Call `task_complete` with a summary to exit the loop. Stopping without calling this tool will cause the system to re-inject the agent if todos are still pending.

## Development Conventions

### Source Control & Pull Requests
- **PRs are the Default:** Always prefer creating a branch (`ona/<short-slug>`) and opening a PR.
- **Default Branch Protection:** Tools (`github_upsert_file`, `github_delete_file`) explicitly block direct pushes to the default branch unless `allowDirectPushToDefaultBranch` is explicitly set to `true`.
- **PR Body Format:** PRs must include "What changed", "Why", "Files affected", and "How to test".

### Code Style
- **TypeScript:** Prefer `type` over `interface`. Use strict typing.
- **Naming:** React components in `PascalCase`, libraries/utilities in `camelCase`.
- **Semicolons:** Use them.
- **Brace Style:** `1tbs`.

### Internationalization (i18n)
- **English First:** Only edit `src/locales/en.json`.
- **Crowdin:** `fr.json` and other locales are managed by Crowdin; do not edit them manually.

### Database
- **Migrations:** Managed via Drizzle. Run `npm run db:generate` after schema changes in `src/models/Schema.ts`. Migrations are auto-applied at runtime.

## Subagent Architecture

ONA delegates complex tasks to specialized subagents:
- **Librarian Pro:** Unified research and browser automation. Use for documentation lookups and live web verification.
- **Oracle:** Deep-reasoning agent (GLM 5.1). Use for architecture decisions, complex debugging, and strategy review.
- **Editor:** Specialized in local file editing via precise string replacement. Use `call_editor` for all codebase modifications.
- **Fleet:** Handles parallel, independent tasks across multiple repositories.

## Building and Running

| Task | Command |
| :--- | :--- |
| **Development** | `npm run dev` (Port 5000) |
| **Build** | `npm run build` |
| **Test (Unit)** | `npx vitest` |
| **Test (E2E)** | `npx playwright test` |
| **DB Generate** | `npm run db:generate` |
| **DB Studio** | `npm run db:studio` |
| **Lint** | `npx eslint --fix .` |

## Key Directories
- `src/app`: Routes and API handlers.
- `src/libs`: Core services (GitHub, Daytona, Subagents).
- `src/components`: UI components.
- `src/models`: Database schema (`Schema.ts`).
- `migrations`: SQL migration files.

## Security & Reliability
- **Secrets:** Use `.env.local`. Never log or commit keys.
- **Resilience:** The project uses Circuit Breakers, Resilient API clients, and Memory Monitoring.
- **Credits:** Each AI call costs credits (1 credit = 1 cent). Usage is tracked in the `user_credits` table.
