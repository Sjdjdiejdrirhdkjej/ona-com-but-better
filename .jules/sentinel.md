# Sentinel's Journal — Critical Security Learnings

## 2026-08-19 - Unauthenticated route hidden by per-route auth architecture
**Vulnerability:** `GET /api/sandbox/files` had no authentication and no ownership check. Any unauthenticated caller who knew/guessed a `conversationId` could list the full file tree of another user's private Daytona sandbox (information disclosure of user code structure). Every sibling route (`/api/conversations/**`, `/api/chat`, `/api/credits/**`) uses `getRequestAuth`, which made this route the silent outlier.

**Learning:** Auth in this app is enforced per-route (`src/libs/ApiKeys.ts getRequestAuth`), NOT in `src/middleware.ts` — the middleware only handles graceful-shutdown (503) and i18n routing, and it early-returns for every `/api/*` path. A route that forgets the `getRequestAuth` call is therefore fully public with no safety net. Additionally, note that `getRequestAuth` returns `null` (not a failure) when there is no session AND no bearer token — sibling routes vary in whether they then reject or allow anonymous access, so each route must decide explicitly.

**Prevention:** Every new handler under `src/app/api/**` must call `getRequestAuth(req)` and scope DB queries with `and(eq(resource.id, id), eq(resource.userId, auth.userId))`. Key fact that makes strict auth safe here: `sandboxId` is only ever attached to conversations inside `/api/chat`, which already requires authentication, so no legitimate anonymous flow depends on sandbox data.
