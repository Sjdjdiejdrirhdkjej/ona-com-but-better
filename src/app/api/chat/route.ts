import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { getBearerToken, getRequestAuth } from '@/libs/ApiKeys';
import { agentEventsSchema, agentJobsSchema, conversationsSchema, messagesSchema } from '@/models/Schema';
import { getGitHubToken, githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';
import { daytonaToolDefinitions, isDaytonaTool, prebootSandbox, runDaytonaTool } from '@/libs/Daytona';
import { callLibrarianProToolDefinition, isCallLibrarianProTool, runLibrarianProSubagent } from '@/libs/LibrarianPro';
import { callOracleToolDefinition, isCallOracleTool, runOracleSubagent } from '@/libs/Oracle';
import { callEditorToolDefinition, isCallEditorTool, runEditorSubagent } from '@/libs/Editor';
import type { TouchedFileDiff } from '@/libs/FileDiff';

export const runtime = 'nodejs';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

// ── Ultrawork todo types ────────────────────────────────────────────────────
type TodoStatus = 'pending' | 'in_progress' | 'done';
type TodoItem = { id: string; task: string; status: TodoStatus };
type ToolStepUpdate = { label: string; status: string; touchedFiles?: TouchedFileDiff[] };

function getTouchedFiles(result: unknown): TouchedFileDiff[] | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const files = (result as { touchedFiles?: unknown }).touchedFiles;
  if (!Array.isArray(files)) return undefined;
  const normalized = files.filter((file): file is TouchedFileDiff => {
    const item = file as Partial<TouchedFileDiff>;
    return typeof item.path === 'string' && typeof item.diff === 'string';
  });
  return normalized.length > 0 ? normalized : undefined;
}

const TODO_WRITE_TOOL = {
  type: 'function',
  function: {
    name: 'todo_write',
    description: 'Write your complete todo list for the current task. Call this at the start of any multi-step task and update it whenever a step changes status. The user can see this list in real time. Replace the entire list each call.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Short unique ID, e.g. "1", "2", "3".' },
              task: { type: 'string', description: 'Task description.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'], description: 'Current status.' },
            },
            required: ['id', 'task', 'status'],
          },
          description: 'Complete todo list — replaces previous list entirely.',
        },
      },
      required: ['todos'],
    },
  },
} as const;

const TODO_READ_TOOL = {
  type: 'function',
  function: {
    name: 'todo_read',
    description: 'Read the current todo list to review what is pending, in progress, or done.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
} as const;

const TASK_COMPLETE_TOOL = {
  type: 'function',
  function: {
    name: 'task_complete',
    description: 'Signal that you have fully finished the task. You MUST call this tool to exit the ultrawork loop — stopping your response without calling it will cause the system to re-prompt you to continue. Only call this when all todos are done and the work is verified.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished.' },
      },
      required: ['summary'],
    },
  },
} as const;

const ULTRAWORK_TOOLS = [TODO_WRITE_TOOL, TODO_READ_TOOL, TASK_COMPLETE_TOOL];

export const ONA_MODELS = {
  'ona-max': {
    label: 'Hands on experience',
    description: 'GLM 5.1 — most capable',
    fireworksId: 'accounts/fireworks/models/glm-5p1',
    maxTokens: 16384,
    temperature: 0.08,
  },
  'ona-hands-off': {
    label: 'Hands off experience',
    description: 'Qwen3 Coder 480B — maximum autonomy, agentic coding, 262K context, RL-trained tool use',
    fireworksId: 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
    maxTokens: 65536,
    temperature: 0.0,
  },
} as const;

export type OnaModelKey = keyof typeof ONA_MODELS;

const DEFAULT_FIREWORKS_MODELS = [
  'accounts/fireworks/routers/kimi-k2p5-turbo',
  'accounts/fireworks/models/kimi-k2-instruct-0905',
  'accounts/fireworks/models/llama4-maverick-instruct-basic',
];
const FALLBACK_MODELS = [
  process.env.FIREWORKS_MODEL,
  ...(process.env.FIREWORKS_FALLBACK_MODELS?.split(',') ?? DEFAULT_FIREWORKS_MODELS),
].filter((model): model is string => Boolean(model?.trim()))
  .map(model => model.trim())
  .filter((model, index, models) => models.indexOf(model) === index);
const MAX_AGENT_ITERATIONS = 80;

const CURRENT_DATE = new Date().toISOString().slice(0, 10);

const SYSTEM_PROMPT = `You are **ONA**, a fully autonomous background software engineering agent. Your mission is singular: **task in → finished work out**. The user should be able to send a task, walk away, and return to a complete, verified result or a clear explanation of the one genuinely blocking issue.

Today's date: **${CURRENT_DATE}**. Your training data has a knowledge cutoff that predates today. Treat anything your training data says about specific library versions, API shapes, endpoint URLs, package names, or configuration options as **potentially outdated** — always use tools to verify before writing code against external dependencies.

---

## CORE OPERATING PRINCIPLES

### 0. Pull requests are the default delivery path
For any repository change, prefer creating a branch and opening a pull request over pushing directly. The normal flow is: create a branch from the default branch, write all changes to that branch, verify, then open one PR. Do not commit directly to the default branch unless the user explicitly asks you to push directly instead of creating a PR.

### 1. Send-and-walk-away autonomy — own the task end to end
Treat every task as delegated work, not a conversation requiring step-by-step permission. After the user gives a goal, independently discover the repository/app state, make a plan, execute, verify, and deliver. Never ask "should I continue?", "do you want me to?", or "is this okay?" for ordinary implementation choices. Make the safest reasonable decision yourself, document it in the final summary, and keep moving.

Only block on user input when all of these are true:
- the choice materially changes product/business intent or irreversible user data,
- the answer cannot be discovered from code, docs, browser checks, or available tools,
- and making a default choice would likely create the wrong product.

If blocked, do not abandon the task. Finish every independent part first, preserve progress, then ask one concise question with the exact missing decision.

### 2. Efficiency — every tool call has cost
- **Batch parallel reads**: fire multiple \`github_read_file\` calls simultaneously, not sequentially.
- **Map once**: use \`github_get_file_tree\` once to understand repo structure — do not call \`github_list_directory\` repeatedly.
- **Search before reading**: use \`github_search_code\` to locate symbols/patterns across the whole repo before opening files.
- **One PR per task**: write all file changes to one branch, then open one PR — never open multiple.
- **Reuse context**: if you already read a file this session, do not read it again.

### 3. Max accuracy based on task risk
Match effort to risk. For simple factual or explanatory answers, answer directly. For software changes, production bugs, security, data loss, auth, billing, deployment, migrations, or broad architecture decisions, use maximum accuracy mode:
- build and maintain a visible todo list,
- inspect the actual code before deciding,
- call \`call_oracle\` early for complex architecture, debugging strategy, risky migrations, security-sensitive work, or ambiguous multi-step plans,
- call \`call_librarian_pro\` before relying on external/library/API knowledge, or for live web and UI verification,
- verify with the most relevant sandbox command before reporting done.

When accuracy conflicts with speed, choose accuracy for user-facing, production, security, billing, auth, database, and deployment tasks.

### 4. Research before implementing
Before writing code that uses any library, API, or framework you have not explicitly seen working in this conversation: call \`call_librarian_pro\` first. A single research call is far cheaper than implementing against the wrong API and fixing it afterward.

### 5. Verify before reporting
Before opening a PR or claiming a task is complete:
- If the repo has a test suite or build command, run it in a Daytona sandbox on your branch.
- Fix any failures in the same branch before opening the PR.
- Only report "done" when the work is verified.

### 6. Never hallucinate — ground every fact in tool evidence
Every file path, branch name, commit SHA, PR URL, function signature, package version, and code snippet you state must come from a tool result you received in this session. If you have not read it, do not state it.

**Grounding checklist** (mentally verify before every substantive claim):
- Did a tool return this file path? If not, use \`github_get_file_tree\` or \`github_search_code\` to find it.
- Did a tool return this function signature or package version? If not, call \`call_librarian_pro\` to confirm it.
- Did a tool return this URL or endpoint? If not, call \`call_librarian_pro\` to verify it.
- Is this a library API or configuration shape? Then call \`call_librarian_pro\` before writing code — your training data is outdated.

When you catch yourself about to state something you cannot point to in a tool result from this session: **stop, use a tool to get the evidence, then proceed**.

### 7. Knowledge cutoff — external facts expire
Your training knowledge is frozen at a past date. For anything outside the repository itself (npm packages, GitHub APIs, cloud service endpoints, framework APIs, CLI flag syntax, environment variable names, config file formats): treat your recalled knowledge as a **starting hypothesis only** — always verify with \`call_librarian_pro\` before writing code. A single research call is far cheaper than shipping broken code.

### 8. Ultrawork loop — plan, track, and complete
You run inside an enforcement loop. For any multi-step task:
1. **Start**: call \`todo_write\` immediately with a full breakdown of every step. Mark the first step \`in_progress\`, the rest \`pending\`. The user sees this list live.
2. **During**: after finishing each step, call \`todo_write\` again — mark that step \`done\`, the next one \`in_progress\`. Keep the list current at all times.
3. **Finish**: when all steps are done and verified, call \`todo_write\` with everything \`done\`, then call \`task_complete\` with a summary.

\`task_complete\` is the **only exit from the loop**. If you stop without calling it and any todos are still pending, the system will re-inject you to continue. There is no way to exit by simply finishing your response.

Single-turn answers (no multi-step work needed) do not require a todo list — respond directly and the loop exits normally.

---

## TOOL DECISION GUIDE

### GitHub tools — the primary workhorse

**DISCOVER** (do this once at the start of any task)
- \`github_get_viewer\` → confirm identity
- \`github_list_repositories\` → find the correct repo; never assume
- \`github_get_file_tree\` → map the full repo structure in one call

**UNDERSTAND** (fire reads in parallel)
- \`github_read_file\` → read all relevant files simultaneously
- \`github_search_code\` → locate symbols, functions, patterns across the entire codebase at once
- \`github_get_issue\` / \`github_list_issues\` → understand the task requirements
- \`github_list_commits\` → understand recent changes and who owns what
- \`github_get_pr_diff\` → understand what a PR changes before reviewing

**EXECUTE** (write and ship)
- \`github_create_branch\` → one branch per task, named \`ona/<short-slug>\`
- \`github_upsert_file\` → write all changes to the task branch; batch independent file writes when possible
- \`github_create_pull_request\` → one PR per task with a complete body (see PR format below)
- \`github_add_pr_review\` → submit code review with inline comments and an overall verdict
- \`github_add_comment\` → comment on issues or PRs when needed

**When GitHub is NOT connected:**
If the user asks to clone, inspect, or work on a specific repository by name, do NOT just tell them to connect GitHub. Instead:
1. Acknowledge GitHub is not connected so you cannot access their private repos or make commits.
2. Immediately use \`call_librarian_pro\` to search the web for that repository (e.g. "Find the GitHub URL, README, and codebase structure for <repo name>") and return everything you find — file structure, key files, purpose, tech stack, open issues, recent commits, etc.
3. Offer concrete help based on what the librarian found: architecture review, code explanation, suggested improvements, or a plan for when they do connect GitHub.

For all other requests (no specific repo target), tell the user to connect their GitHub account using the button above. You can still assist with architecture, code review of pasted code, and planning.

**When a repo is NOT found in the user's account:**
\`github_list_repositories\` only returns up to 100 repos sorted by recent activity — the target repo may exist but simply not appear in that list. Before concluding a repo is absent:
1. Call \`github_get_repository\` directly with the exact \`owner/repo\` the user mentioned. This is a direct API lookup that succeeds regardless of pagination. If the user did not provide an owner, use the login returned by \`github_get_viewer\` as the owner.
2. Only if \`github_get_repository\` returns a "Not Found" error, try \`github_search_code\` with the repo name to check if it exists under a different owner.
3. Only if both steps confirm the repository truly does not exist in the connected account (wrong name, wrong owner, or it is a public third-party repo), fall back to \`call_librarian_pro\` to search the web for that repository by name and return what you find — README, file structure, tech stack, open issues, official docs, etc.
4. Continue helping with whatever the user's underlying goal was, using the web-sourced information as your context.

---

### \`call_librarian_pro\` — documentation research & live browser automation

**Use for:** ALL external research and web interaction needs. This single subagent handles both static documentation research and live browser automation — replacing the old separate librarian and browser_use tools.

**Static research mode (faster):** library APIs, package versions, changelogs, migration guides, framework patterns, reference implementations, any unfamiliar external dependency. Use BEFORE writing code.

**Live browser mode (when static fails):** verifying a deployed site, filling web forms, extracting data from JS-rendered SPAs, taking screenshots of live UIs, login-required pages, multi-step web workflows.

**Do NOT use for:** information you can read directly from the repository. Use GitHub search/read for that.

**Examples:**
- Research: \`call_librarian_pro({ request: "What is the correct API for drizzle-orm programmatic migrations in a Next.js 15 server component?" })\`
- Browser: \`call_librarian_pro({ request: "Go to https://example.com/login, fill email with test@test.com and password with pass123, submit the form, then return what page appears and take a screenshot." })\`

---

### \`call_oracle\` — deep reasoning

**Use for:** architecture decisions, complex debugging hypotheses, multi-step strategy, tradeoff analysis, planning, and synthesis where a second GLM 5.1 reasoning agent can think deeply and return a comprehensive report.

**Required for max-accuracy tasks:** Use Oracle before major implementation when the task involves auth, payments, security, migrations, data-loss risk, deployment failures, cross-file architecture, vague high-level goals, or repeated failures. Use the report as a planning and review aid, then continue autonomously.

**Do NOT use for:** live/current external facts, package API verification, or browser state. Use \`call_librarian_pro\` for evidence-gathering and live browser work.

**Example:** \`call_oracle({ request: "Evaluate the safest architecture for adding multi-tenant billing to this app, including risks, schema changes, rollout plan, and edge cases." })\`

---

### \`call_editor\` — local file read/write/edit

**Use for:** ALL read and write operations on local project files. Whenever you need to read, create, or modify files in this codebase, delegate to the Editor subagent. This is the ONLY way to touch local files.

**How it works:** The Editor reads each file you specify, applies precise targeted edits using exact string replacement, verifies the results, and returns a report with a diff of every change.

**Always specify every file** the Editor needs to read or modify in the \`files\` array — even files read only for context.

**Do NOT** write file content directly in your response text. Always use \`call_editor\` for local file changes.

**Example:** \`call_editor({ instructions: "In src/components/Header.tsx, change the nav link font size from text-sm to text-xs on mobile", files: ["src/components/Header.tsx"] })\`

---

### Daytona sandbox — code execution & verification

**Use for:** running tests, builds, linters, and scripts — any time you need proof that the code works before opening a PR.

**Always follow this sequence:**
1. \`sandbox_create\` → spin up an isolated container
2. \`sandbox_git_clone\` → clone the repo at your working branch
3. \`sandbox_exec\` → install deps, then run the relevant test/build command
4. Read output. If failures exist: fix the code via GitHub tools, then re-run.
5. \`sandbox_delete\` → always clean up when done

---

## WORKFLOW PLAYBOOKS

### Feature implementation from an issue
1. \`github_get_issue\` + \`github_get_file_tree\` in parallel.
2. \`github_read_file\` all relevant files in parallel.
3. Call \`call_librarian_pro\` for any uncertain library/API usage.
4. \`github_create_branch\` → \`call_editor\` to apply all file changes locally → sandbox verify → \`github_create_pull_request\` referencing the issue.

### Bug fix
1. \`github_search_code\` to locate the bug. \`github_read_file\` the relevant file(s) in parallel.
2. Understand root cause. Fix it. Sandbox-verify. Open PR explaining root cause in the body.

### Code review
1. \`github_get_pr_diff\` → analyse thoroughly.
2. \`github_add_pr_review\` with: inline comments on specific lines, and one of APPROVE / REQUEST_CHANGES / COMMENT as the overall verdict.
3. Flag: bugs, security issues, missing error handling, missing tests, breaking changes, performance problems.

### CVE & dependency remediation
1. \`github_read_file\` all dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml) in parallel.
2. Identify vulnerable version ranges. Call \`call_librarian_pro\` to confirm safe replacement versions if uncertain.
3. Patch version pins. Open PR with CVE references in the body.

### Weekly digest
1. \`github_list_commits\` with a \`since\` timestamp covering the past 7 days.
2. Summarise: features merged, bugs fixed, open PRs needing attention, notable contributors.

### Documentation sync
1. Read source code and existing docs in parallel.
2. Identify gaps or stale content. Rewrite the affected sections. Open PR.

### Stale PR cleanup
1. \`github_list_pull_requests\` with state=open, sorted by age.
2. For each stale PR: add a comment asking for status update or flag for closure.

---

## PR BODY FORMAT (required on every PR)

\`\`\`markdown
## What changed
- [Bullet list of changes]

## Why
[Root cause, issue number, or requirement driving this change]

## Files affected
- \`path/to/file.ts\` — [what changed and why]

## How to test
[Step-by-step instructions to verify the change works correctly]
\`\`\`

---

## SELF-CHECK BEFORE REPORTING

Before producing your final response or opening a PR, do a fast internal audit:
1. **Evidence check**: Can every technical claim (file path, API call, version, flag, env var) be traced to a specific tool result in this session? If not, use a tool to verify it now.
2. **Assumption check**: Did you write any code against an external library without calling \`call_librarian_pro\` first? If yes, call it now and adjust if needed.
3. **Verification check**: Did you run the relevant tests or build in a Daytona sandbox? If not, and the repo has tests, do it now.

Only after passing this audit should you write the final summary and close the task.

---

## SEND-AND-WALK-AWAY FINALIZATION

Before calling \`task_complete\`, confirm:
1. The original user goal is satisfied, not merely investigated.
2. Every todo is done or explicitly impossible due to a real blocker.
3. Code changes are verified with the best available command/browser check.
4. Any assumptions are documented.
5. The final summary tells the user what changed, where to review it, and anything they must do next.

Do not end with "let me know if you want me to continue" after partial work. Continue yourself unless genuinely blocked.

---

## ULTRAWORK LOOP

You run inside an **ultrawork loop**. The loop will not exit until you explicitly call \`task_complete\`. If you stop responding without calling it, the system inspects your todo list:

- **Uncompleted todos remain** → you are re-injected to keep working.
- **All todos are done** → you are prompted to call \`task_complete\`.
- **No todos were ever written** → the loop exits (single-step tasks are fine without todo list).

### Tools

**\`todo_write\`** — Write your complete task breakdown at the start of every multi-step job. Update it as you go (mark steps \`in_progress\` when starting, \`done\` when verified). The user sees this list live. Pass the full list each call.

**\`todo_read\`** — Read back your current list if you need to re-orient mid-task.

**\`task_complete\`** — Call this when everything is done and verified. This is the **only exit from the loop**. Include a one-paragraph summary of what was accomplished.

### Workflow for any multi-step task

1. \`todo_write\` with a breakdown of all steps (first step \`in_progress\`, rest \`pending\`).
2. Work through each step. After completing each step: \`todo_write\` with that step marked \`done\` and the next marked \`in_progress\`.
3. When all steps are verified: \`todo_write\` with all items \`done\`, then \`task_complete\`.

**Never stop mid-task and leave todos pending** — the loop will pull you back. Use \`task_complete\` intentionally when done.

---

## TROUBLESHOOTING PROTOCOL

If a fix attempt does not resolve the problem after two tries:
1. Step back. List 5–7 plausible root causes.
2. Rank them by likelihood.
3. Address the most likely cause first — explain your reasoning.
4. If still stuck after exhausting all plausible causes, call \`call_oracle\` for a second-opinion debugging plan and try the most likely new path.
5. Only ask the user for additional context after independent diagnosis, Oracle review, and all safe verification routes are exhausted.

---

## HARD RULES
- **Prefer PRs over direct pushes** — create a branch and open a pull request for repository changes unless the user explicitly requests a direct push.
- **Never push directly to the default branch** unless the user explicitly requests it and accepts that the change will bypass PR review.
- **Never fabricate** file contents, paths, SHAs, PR URLs, or version numbers.
- **One branch per task** — never mix unrelated changes on the same branch.
- **Large or risky changes** → open a **draft PR**, describe the risk, ask for review before merging.
- **No redundant comments** — do not comment code that already makes the intent obvious.
- **One final summary** after task completion — PR URL, files changed, anything needing human review. No padding.
- **Never pre-announce tool calls.** Do not say "I'll search for…", "Let me look up…", "I'll check…", "I'm going to read…", or any similar narration before calling a tool. The moment you decide to use a tool, call it immediately — put the intent in a tool call, not in your response text. Reserve response text for results and final summaries only.
- **Ultrawork — always plan multi-step tasks**: for any task with more than one step, call \`todo_write\` before doing any work. Update it as you go. End every multi-step task with \`task_complete\` — not doing so will cause the loop to re-inject you.
- **\`task_complete\` is mandatory**: you cannot end a multi-step task by writing a response. You must call \`task_complete\` with a summary. The loop enforces this.`;

function toolLabel(name: string, args: Record<string, unknown> = {}): string {
  // Helper: resolve owner/repo from either combined `repository` or separate `owner`+`repo`
  function repo(): string {
    if (typeof args.repository === 'string' && args.repository) return args.repository;
    const o = typeof args.owner === 'string' ? args.owner : '';
    const r = typeof args.repo === 'string' ? args.repo : '';
    return o && r ? `${o}/${r}` : r || o || '';
  }

  // Helper: trim long strings
  function trim(s: string, max = 48): string {
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  const s = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '');
  const n = (key: string) => (typeof args[key] === 'number' ? args[key] : null);

  switch (name) {
    // ── Identity ───────────────────────────────────────────────────────────
    case 'github_get_viewer':
      return 'Checking GitHub identity';

    // ── Repository ────────────────────────────────────────────────────────
    case 'github_list_repositories':
      return 'Listing repositories';
    case 'github_get_repository':
      return repo() ? `Reading ${repo()}` : 'Reading repository';
    case 'github_search_code':
      return s('query') ? `Searching for "${trim(s('query'))}"` : 'Searching code';
    case 'github_get_file_tree':
      return repo() ? `Mapping ${repo()}` : 'Mapping codebase';
    case 'github_list_directory': {
      const path = s('path') || '/';
      return repo() ? `Listing ${path} in ${repo()}` : `Listing ${path}`;
    }

    // ── File reads / writes ───────────────────────────────────────────────
    case 'github_read_file':
      return s('path') ? `Reading ${s('path')}` : 'Reading file';
    case 'github_upsert_file': {
      const branch = s('branch');
      return s('path')
        ? `Writing ${s('path')}${branch ? ` → ${branch}` : ''}`
        : 'Writing file';
    }
    case 'github_delete_file':
      return s('path') ? `Deleting ${s('path')}` : 'Deleting file';

    // ── Branches ──────────────────────────────────────────────────────────
    case 'github_list_branches':
      return repo() ? `Listing branches in ${repo()}` : 'Listing branches';
    case 'github_create_branch':
      return s('newBranch') ? `Creating branch ${s('newBranch')}` : 'Creating branch';

    // ── Commits ───────────────────────────────────────────────────────────
    case 'github_list_commits': {
      const branch = s('branch');
      return repo()
        ? `Listing commits on ${branch || 'default'} in ${repo()}`
        : 'Reading commit history';
    }
    case 'github_get_commit':
      return s('sha') ? `Reading commit ${s('sha').slice(0, 7)}` : 'Reading commit';

    // ── Pull requests ─────────────────────────────────────────────────────
    case 'github_list_pull_requests': {
      const state = s('state') || 'open';
      return repo() ? `Listing ${state} PRs in ${repo()}` : `Listing ${state} PRs`;
    }
    case 'github_get_pull_request':
      return n('pull_number') !== null ? `Reading PR #${n('pull_number')}` : 'Reading pull request';
    case 'github_get_pr_diff':
      return n('pull_number') !== null ? `Diffing PR #${n('pull_number')}` : 'Reading PR diff';
    case 'github_create_pull_request':
      return s('title') ? `Opening PR: ${trim(s('title'))}` : 'Creating pull request';
    case 'github_add_pr_review':
      return n('pull_number') !== null ? `Reviewing PR #${n('pull_number')}` : 'Submitting review';
    case 'github_add_pr_reviewers':
      return n('pull_number') !== null ? `Requesting reviewers for PR #${n('pull_number')}` : 'Requesting reviewers';
    case 'github_add_pr_labels':
      return n('pull_number') !== null ? `Labeling PR #${n('pull_number')}` : 'Applying labels';

    // ── Issues ────────────────────────────────────────────────────────────
    case 'github_list_issues': {
      const state = s('state') || 'open';
      return repo() ? `Listing ${state} issues in ${repo()}` : `Listing ${state} issues`;
    }
    case 'github_get_issue':
      return n('issue_number') !== null ? `Reading issue #${n('issue_number')}` : 'Reading issue';
    case 'github_create_issue':
      return s('title') ? `Creating issue: ${trim(s('title'))}` : 'Creating issue';
    case 'github_add_comment': {
      const num = n('issue_number');
      return num !== null ? `Commenting on #${num}` : 'Adding comment';
    }
    case 'github_clone_repo':
      return repo() ? `Cloning ${repo()}` : 'Cloning repository';

    // ── Daytona sandbox ───────────────────────────────────────────────────
    case 'sandbox_create': {
      const lang = s('language') || 'python';
      return `Creating ${lang} sandbox`;
    }
    case 'sandbox_exec': {
      const cmd = s('command');
      return cmd ? `Running: ${trim(cmd, 52)}` : 'Running command';
    }
    case 'sandbox_write_file':
      return s('path') ? `Writing ${s('path')} to sandbox` : 'Writing file to sandbox';
    case 'sandbox_read_file':
      return s('path') ? `Reading ${s('path')} from sandbox` : 'Reading file from sandbox';
    case 'sandbox_list_files':
      return s('path') ? `Listing ${s('path')} in sandbox` : 'Listing sandbox files';
    case 'sandbox_delete':
      return 'Deleting sandbox';
    case 'sandbox_git_clone': {
      const url = s('url');
      const shortUrl = url.replace(/^https?:\/\/(github\.com\/)?/, '').replace(/\.git$/, '');
      return url ? `Cloning ${trim(shortUrl, 40)} into sandbox` : 'Cloning repo into sandbox';
    }

    // ── Librarian Pro ─────────────────────────────────────────────────────
    case 'call_librarian_pro': {
      const req = s('request');
      return req ? `Librarian Pro: ${trim(req, 48)}` : 'Researching';
    }

    case 'call_oracle': {
      const request = s('request');
      return request ? `Oracle: ${trim(request, 55)}` : 'Consulting oracle';
    }

    // ── Editor ────────────────────────────────────────────────────────────
    case 'call_editor': {
      const files = Array.isArray(args.files) ? args.files as string[] : [];
      return files.length > 0
        ? `Editor: ${files.map(f => trim(String(f), 30)).join(', ')}`
        : 'Editing files';
    }

    // ── Ultrawork tools ───────────────────────────────────────────────────
    case 'todo_write':
      return 'Updating task list';
    case 'todo_read':
      return 'Reading task list';
    case 'task_complete': {
      const summary = s('summary');
      return summary ? `Task complete: ${trim(summary, 48)}` : 'Task complete';
    }

    default:
      return name.replace(/^(github_|sandbox_)/, '').replace(/_/g, ' ');
  }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ApiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type FireworksDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
};

type FinishReason = 'stop' | 'tool_calls' | 'length' | 'error' | null;

type FireworksResponse = {
  choices?: Array<{
    delta?: FireworksDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  error?: { message?: string };
};

type FireworksUsage = NonNullable<FireworksResponse['usage']>;

function normalizeMessages(messages: ApiMessage[]) {
  return messages.map((m) => {
    if (Array.isArray(m.content)) return m;
    return { role: m.role, content: m.content };
  });
}

async function callFireworks(body: Record<string, unknown>, modelOverride?: string): Promise<Response> {
  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY is not configured. Please add it in environment secrets.');
  }

  const modelsToTry = modelOverride ? [modelOverride] : FALLBACK_MODELS;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    let res: Response;
    try {
      res = await fetch(FIREWORKS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify({ model, ...body }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') {
        lastError = new Error(`The AI provider did not respond within 120 seconds for ${model}. Please try again.`);
        continue;
      }
      throw error;
    }

    if (res.ok) return res;

    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`The AI model is temporarily busy (${res.status}). Please try again in a moment.`);
      continue;
    }

    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text) as { error?: { message?: string } };
      if (json.error?.message) message = json.error.message;
    } catch {}
    throw new Error(message);
  }

  throw lastError ?? new Error('Request failed after multiple attempts. Please try again.');
}

async function streamFireworksCall(
  body: Record<string, unknown>,
  onDelta: (delta: string) => void,
  modelOverride?: string,
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: FinishReason; usage?: FireworksUsage }> {
  const res = await callFireworks({ ...body, stream: true }, modelOverride);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: FinishReason = null;
  let usage: FireworksUsage | undefined;
  let inThinkBlock = false;
  const toolCallsMap = new Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }>();

  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break outer;
        try {
          const json = JSON.parse(raw) as FireworksResponse;
          if (json.usage) {
            usage = json.usage;
          }
          const choice = json.choices?.[0];
          const delta = choice?.delta as FireworksDelta | undefined;
          if (!delta) continue;

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason as FinishReason;
          }

          if (delta.reasoning_content) {
            if (!inThinkBlock) {
              content += '<think>';
              onDelta('<think>');
              inThinkBlock = true;
            }
            content += delta.reasoning_content;
            onDelta(delta.reasoning_content);
          }

          if (delta.content) {
            if (inThinkBlock) {
              content += '</think>';
              onDelta('</think>');
              inThinkBlock = false;
            }
            content += delta.content;
            onDelta(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, { id: '', type: 'function', function: { name: '', arguments: '' } });
              }
              const entry = toolCallsMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.function.name += tc.function.name;
              if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
            }
          }
        } catch {}
      }
    }
  } finally {
    if (inThinkBlock) {
      content += '</think>';
      onDelta('</think>');
    }
    reader.releaseLock();
  }

  return { content, toolCalls: [...toolCallsMap.values()], finishReason, usage };
}

function estimateContentTokens(content: ApiMessage['content']): number {
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part.type === 'text') return sum + Math.ceil((part.text ?? '').length / 4);
      return sum + 850;
    }, 0);
  }
  return Math.ceil(content.length / 4);
}

function estimateMessagesTokens(messages: ApiMessage[]): number {
  return messages.reduce((sum, message) => {
    const toolCallTokens = message.tool_calls?.reduce((toolSum, toolCall) => (
      toolSum + Math.ceil((toolCall.function.name.length + toolCall.function.arguments.length) / 4)
    ), 0) ?? 0;
    return sum + estimateContentTokens(message.content) + toolCallTokens + 4;
  }, 0);
}

// ── Context compression ────────────────────────────────────────────────────
// When the conversation grows beyond this threshold, older messages are
// compressed into a brief summary to prevent context-window exhaustion.
const CONTEXT_COMPRESS_TOKENS = 60000;
const CONTEXT_WARN_TOKENS = 40000;
const CONTEXT_KEEP_LAST = 14; // always preserve the most recent N messages verbatim

function compressConversationHistory(
  messages: ApiMessage[],
  currentTodos: TodoItem[],
): { messages: ApiMessage[]; compressed: boolean } {
  const estimated = estimateMessagesTokens(messages);
  if (estimated < CONTEXT_COMPRESS_TOKENS) return { messages, compressed: false };
  // Need at least system + first-user + KEEP_LAST + 2 for the compression wrapper
  if (messages.length <= CONTEXT_KEEP_LAST + 4) return { messages, compressed: false };

  const systemMsg = messages[0]!;
  const firstUserMsg = messages[1]!;
  const tail = messages.slice(-CONTEXT_KEEP_LAST);
  const body = messages.slice(2, -CONTEXT_KEEP_LAST);

  // Summarise what happened in the compressed body
  const toolCallBatches = body.filter(
    m => m.role === 'assistant' && Array.isArray(m.tool_calls) && (m.tool_calls?.length ?? 0) > 0,
  );
  const toolNamesSeen = toolCallBatches
    .flatMap(m => (m.tool_calls ?? []).map(tc => tc.function.name))
    .slice(0, 30);
  const uniqueTools = [...new Set(toolNamesSeen)];

  const todoSummary = currentTodos.length > 0
    ? currentTodos.map(t => `  [${t.status}] ${t.task}`).join('\n')
    : '  (none written yet)';

  const compressionNote = [
    `[CONTEXT COMPRESSED — ${body.length} prior messages removed to free context space]`,
    `Tool-call batches in compressed history: ${toolCallBatches.length}`,
    `Tools used: ${uniqueTools.join(', ') || 'none'}`,
    ``,
    `Current todo list at time of compression:`,
    todoSummary,
    ``,
    `The original task (first message) and the most recent ${CONTEXT_KEEP_LAST} messages are preserved verbatim below.`,
    `Call todo_read at any time to refresh your current task state.`,
  ].join('\n');

  return {
    messages: [
      systemMsg,
      firstUserMsg,
      { role: 'user', content: compressionNote },
      { role: 'assistant', content: 'Understood. I have reviewed the compression summary and will continue working from my current todo state.' },
      ...tail,
    ],
    compressed: true,
  };
}


function parseToolArgs(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeStream() {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function emit(payload: Record<string, unknown> | string) {
    const line = typeof payload === 'string'
      ? `data: ${payload}\n\n`
      : `data: ${JSON.stringify(payload)}\n\n`;
    writer.write(encoder.encode(line)).catch(() => {});
  }

  function close() {
    emit('[DONE]');
    writer.close().catch(() => {});
  }

  return { readable, emit, close };
}

const contentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  image_url: z.object({ url: z.string() }).optional(),
});

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.union([z.string(), z.array(contentPartSchema)]),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.object({
      id: z.string(),
      type: z.literal('function'),
      function: z.object({ name: z.string(), arguments: z.string() }),
    })).optional(),
  })).min(1, 'At least one message is required'),
  conversationId: z.string().uuid().optional(),
  assistantMessageId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  model: z.string().optional(),
});

async function saveMessage(conversationId: string, msgId: string, role: string, content: unknown) {
  try {
    await db.insert(messagesSchema).values({
      id: msgId,
      conversationId,
      role,
      content: typeof content === 'string' ? content : JSON.stringify(content),
    });
    await db.update(conversationsSchema).set({ updatedAt: new Date() }).where(eq(conversationsSchema.id, conversationId));
  } catch (err) {
    logger.warn({ err, conversationId, msgId }, 'saveMessage: failed to persist message');
  }
}

async function persistJobEvent(jobId: string, type: string, data: Record<string, unknown> = {}) {
  try {
    await db.insert(agentEventsSchema).values({ jobId, type, data: JSON.stringify(data) });
  } catch (err) {
    logger.warn({ err, jobId, type }, 'persistJobEvent: failed to persist event');
  }
}

export async function POST(req: NextRequest) {
  const { readable, emit, close } = makeStream();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  (async () => {
    let jobId: string | null = null;
    try {
      const auth = await getRequestAuth(req);
      if (getBearerToken(req) && !auth) {
        emit({ type: 'error', message: 'Invalid API key.' });
        close();
        return;
      }

      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        emit({ type: 'error', message: 'Invalid JSON in request body.' });
        close();
        return;
      }

      const parsed = chatRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const message = parsed.error.issues.map(i => i.message).join('; ');
        emit({ type: 'error', message: `Bad request: ${message}` });
        close();
        return;
      }

      const { messages, conversationId, assistantMessageId, jobId: clientJobId, model } = parsed.data;
      const modelConfig = model && model in ONA_MODELS
        ? ONA_MODELS[model as OnaModelKey]
        : ONA_MODELS['ona-max'];
      const fireworksModelId = modelConfig.fireworksId;
      const agentMaxTokens = modelConfig.maxTokens;
      const agentTemperature = modelConfig.temperature;
      const isHandsOff = model === 'ona-hands-off';
      jobId = conversationId ? (clientJobId ?? crypto.randomUUID()) : null;
      let pendingContentEvent = '';
      let contentFlushTimer: ReturnType<typeof setTimeout> | null = null;

      async function flushContentEvent() {
        if (contentFlushTimer) {
          clearTimeout(contentFlushTimer);
          contentFlushTimer = null;
        }
        const text = pendingContentEvent;
        pendingContentEvent = '';
        if (jobId && text) {
          await persistJobEvent(jobId, 'content', { text });
        }
      }

      function queueContentEvent(delta: string) {
        if (!jobId || !delta) return;
        pendingContentEvent += delta;
        if (pendingContentEvent.length >= 800) {
          flushContentEvent().catch(() => {});
          return;
        }
        if (!contentFlushTimer) {
          contentFlushTimer = setTimeout(() => {
            flushContentEvent().catch(() => {});
          }, 750);
        }
      }

      async function streamChargedFireworksCall(body: Record<string, unknown>, onDelta: (delta: string) => void) {
        const apiMessages = Array.isArray(body.messages) ? body.messages as ApiMessage[] : [];
        const result = await streamFireworksCall(body, onDelta, fireworksModelId);
        return result;
      }

      if (conversationId && jobId) {
        try {
          await db.insert(agentJobsSchema).values({ id: jobId, conversationId, status: 'running' });
          emit({ type: 'job_id', jobId });
        } catch {
          jobId = null;
        }
      }

      const githubToken = await getGitHubToken();

      const HANDS_OFF_CONTEXT = `\n\n---\n\n## AUTONOMY MODE: HANDS OFF\n\nYou are operating in **maximum autonomy mode** powered by Qwen3 Coder — a model purpose-built for agentic coding with RL-trained tool use and a 262K token context window. The user has explicitly requested full hands-off execution. They will not intervene or answer questions mid-task. Apply these elevated standards:\n\n### Agentic Execution\n- **Use your full context aggressively.** You have 262K tokens of context. Pull in entire files, full dependency trees, test suites, and CI scripts before making decisions. Never work with partial information when you can load the full picture.\n- **Tool-chain without hesitation.** You are purpose-built for long multi-step tool chains. Execute 50, 100, 200+ tool calls if that is what the task requires. Do not compress or skip steps.\n- **Parallelize reads.** When exploring a repository, fire multiple file reads and searches simultaneously — do not step through them sequentially.\n- **Act like an engineer on deadline.** Make confident implementation decisions. Spend zero cycles asking permission for ordinary choices.\n\n### Reasoning Standards\n- **Think before every non-trivial action.** For architecture, schema, API design, or security decisions: call \`call_oracle\` to reason through alternatives before committing.\n- **Verify external dependencies.** Before using any npm package, API endpoint, or config format, call \`call_librarian_pro\` to confirm the correct current shape. Never trust training memory alone.\n- **Run the code.** Use the sandbox to execute, test, and verify your work. If the repo has tests, run them. Do not open a PR on unverified code.\n\n### Delivery Standards\n- **Resolve ambiguity yourself.** If the task is underspecified, pick the most reasonable interpretation, implement it fully, and document your reasoning.\n- **Quality over speed.** A correct, verified result after 80 tool calls beats a broken one after 10.\n- **Never stop early.** No partial results. No "should I continue?" No summaries of what you would do. Do the work, verify it, and deliver a complete outcome.`;

      const conversation: ApiMessage[] = [
        { role: 'system', content: isHandsOff ? SYSTEM_PROMPT + HANDS_OFF_CONTEXT : SYSTEM_PROMPT },
        ...normalizeMessages(messages),
      ];

      // Pre-boot the sandbox on the very first message so it's ready before the AI starts.
      const isFirstMessage = messages.length === 1;
      if (isFirstMessage && process.env.DAYTONA_API_KEY) {
        emit({ type: 'sandbox_booting' });
        if (jobId) await persistJobEvent(jobId, 'sandbox_booting', {});
        const booted = await prebootSandbox();
        if (booted) {
          emit({ type: 'sandbox_ready', sandbox_id: booted.sandbox_id });
          if (jobId) await persistJobEvent(jobId, 'sandbox_ready', { sandbox_id: booted.sandbox_id });
          if (conversationId) {
            await db.update(conversationsSchema).set({ sandboxId: booted.sandbox_id }).where(eq(conversationsSchema.id, conversationId));
          }
          conversation.splice(1, 0,
            {
              role: 'user',
              content: `[System context] A Daytona sandbox has been pre-booted for this session. sandbox_id: ${booted.sandbox_id}, work_dir: ${booted.work_dir}. Use this sandbox_id directly for all sandbox_exec, sandbox_write_file, and other sandbox calls — do NOT call sandbox_create again.`,
            },
            {
              role: 'assistant',
              content: `Understood. I have a pre-booted sandbox ready (${booted.sandbox_id}) and will use it directly.`,
            },
          );
        }
      }

      if (!githubToken) {
        conversation.splice(1, 0, {
          role: 'user',
          content: 'GitHub is not connected for this user. You CANNOT access their private repos, create branches, or open PRs. However, you CAN use call_librarian to search the web for any public repository, read its README, explore its file structure, and research its tech stack — do this immediately when the user mentions a repo by name. For general coding help with pasted code, answer directly. To prompt connection, mention the "Connect GitHub" button.',
        });

        // Run a mini agentic loop with librarian + browser tools so the model can
        // search the web for repositories even without a GitHub connection.
        let noGhAssistantMsgId = assistantMessageId ?? crypto.randomUUID();
        let noGhAssistantText = '';
        const noGhRecentSigs: string[] = [];
        const noGhTools = [...daytonaToolDefinitions, callLibrarianProToolDefinition, callOracleToolDefinition, callEditorToolDefinition];

        for (;;) {
          let iterText = '';
          const { content, toolCalls, finishReason } = await streamChargedFireworksCall(
            { messages: conversation, tools: noGhTools, tool_choice: 'auto', max_tokens: agentMaxTokens, temperature: agentTemperature, reasoning_effort: 'high' },
            (delta) => {
              emit({ delta });
              iterText += delta;
              noGhAssistantText += delta;
              queueContentEvent(delta);
            },
          );

          if (finishReason === 'length') {
            await flushContentEvent();
            if (conversationId && noGhAssistantMsgId) {
              await saveMessage(conversationId, noGhAssistantMsgId, 'assistant', noGhAssistantText || iterText || content);
            }
            const continueMsg = '\n\n*(Response was very long — continuing…)*';
            emit({ delta: continueMsg });
            queueContentEvent(continueMsg);
            conversation.push({ role: 'assistant', content: (noGhAssistantText || iterText || content) + continueMsg });
            conversation.push({ role: 'user', content: 'Continue exactly where you left off.' });
            noGhAssistantText = '';
            noGhAssistantMsgId = crypto.randomUUID();
            emit({ type: 'next_assistant_msg', nextAssistantMsgId: noGhAssistantMsgId });
            if (jobId) await persistJobEvent(jobId, 'next_assistant_msg', { nextAssistantMsgId: noGhAssistantMsgId });
            continue;
          }

          if (!toolCalls.length) {
            await flushContentEvent();
            const finalText = noGhAssistantText || iterText || content;
            if (conversationId && noGhAssistantMsgId) {
              await saveMessage(conversationId, noGhAssistantMsgId, 'assistant', finalText || 'I could not produce a response.');
            }
            break;
          }

          // Loop detection
          const sig = toolCalls.map(t => `${t.function.name}:${t.function.arguments.slice(0, 300)}`).join('|');
          noGhRecentSigs.push(sig);
          if (noGhRecentSigs.length > 3) noGhRecentSigs.shift();
          if (noGhRecentSigs.length === 3 && noGhRecentSigs.every(s => s === sig)) break;

          if (iterText && conversationId && noGhAssistantMsgId) {
            await flushContentEvent();
            await saveMessage(conversationId, noGhAssistantMsgId, 'assistant', iterText);
            noGhAssistantText = '';
          }

          const labels = toolCalls.map(t => toolLabel(t.function.name, parseToolArgs(t.function.arguments)));
          const toolStepsMsgId = crypto.randomUUID();
          const nextAssistantMsgId = crypto.randomUUID();
          noGhAssistantMsgId = nextAssistantMsgId;
          noGhAssistantText = '';

          emit({ type: 'tool_call', tools: labels, toolStepsMsgId, nextAssistantMsgId });
          if (jobId) await persistJobEvent(jobId, 'tool_call', { tools: labels, toolStepsMsgId, nextAssistantMsgId });

          conversation.push({ role: 'assistant', content: content ?? '', tool_calls: toolCalls });
          const toolSteps: ToolStepUpdate[] = labels.map(l => ({ label: l, status: 'running' }));

          await Promise.all(toolCalls.map(async (toolCall) => {
            const toolName = toolCall.function.name;
            const toolArgs = parseToolArgs(toolCall.function.arguments);
            const label = toolLabel(toolName, toolArgs);
            emit({ type: 'tool_start', tool: label });
            if (jobId) await persistJobEvent(jobId, 'tool_start', { tool: label });
            try {
              let result: unknown;
              if (isCallLibrarianProTool(toolName)) {
                const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
                result = await runLibrarianProSubagent(request, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'librarian_pro_step_start', parentLabel: label, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'librarian_pro_step_start', { parentLabel: label, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'librarian_pro_step_complete', parentLabel: label, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'librarian_pro_step_complete', { parentLabel: label, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'librarian_pro_report', parentLabel: label, report });
                if (jobId) persistJobEvent(jobId, 'librarian_pro_report', { parentLabel: label, report }).catch(() => {});
              } else if (isCallOracleTool(toolName)) {
                const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
                result = await runOracleSubagent(request, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'oracle_step_start', parentLabel: label, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'oracle_step_start', { parentLabel: label, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'oracle_step_complete', parentLabel: label, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'oracle_step_complete', { parentLabel: label, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'oracle_report', parentLabel: label, report });
                if (jobId) persistJobEvent(jobId, 'oracle_report', { parentLabel: label, report }).catch(() => {});
              } else if (isCallEditorTool(toolName)) {
                const instructions = typeof toolArgs.instructions === 'string' ? toolArgs.instructions : JSON.stringify(toolArgs);
                const files = Array.isArray(toolArgs.files) ? toolArgs.files.map(String) : [];
                const parentLabel = label;
                result = await runEditorSubagent(instructions, files, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'editor_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'editor_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'editor_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'editor_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const editorReport = typeof (result as { report?: unknown }).report === 'string'
                  ? (result as { report: string }).report
                  : JSON.stringify(result);
                emit({ type: 'editor_report', parentLabel, report: editorReport });
                if (jobId) persistJobEvent(jobId, 'editor_report', { parentLabel, report: editorReport }).catch(() => {});
              } else if (isDaytonaTool(toolName)) {
                result = await runDaytonaTool(toolName, toolArgs);
                if (toolName === 'sandbox_create' && conversationId) {
                  const sandboxId = (result as Record<string, unknown>)?.sandbox_id;
                  if (typeof sandboxId === 'string') {
                    await db.update(conversationsSchema).set({ sandboxId }).where(eq(conversationsSchema.id, conversationId));
                  }
                }
              } else {
                result = { error: 'Tool not available without GitHub connection.' };
              }
              conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 32000) });
              const idx = toolSteps.findIndex(s => s.label === label);
              const touchedFiles = getTouchedFiles(result);
              if (idx !== -1) {
                toolSteps[idx]!.status = 'done';
                if (touchedFiles) toolSteps[idx]!.touchedFiles = touchedFiles;
              }
              emit({ type: 'tool_complete', tool: label, touchedFiles });
              if (jobId) await persistJobEvent(jobId, 'tool_complete', { tool: label, touchedFiles });
            } catch (error) {
              conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: (error as Error).message }) });
              const idx = toolSteps.findIndex(s => s.label === label);
              if (idx !== -1) toolSteps[idx]!.status = 'error';
              emit({ type: 'tool_complete', tool: label, error: true });
              if (jobId) await persistJobEvent(jobId, 'tool_complete', { tool: label, error: true });
            }
          }));

          if (conversationId) {
            const finalSteps = toolSteps.map(s => ({ ...s, status: s.status === 'running' ? 'done' : s.status }));
            await saveMessage(conversationId, toolStepsMsgId, 'tool_steps', finalSteps);
          }
          emit({ type: 'tool_done' });
          if (jobId) await persistJobEvent(jobId, 'tool_done', {});
        }

        if (jobId) {
          await persistJobEvent(jobId, 'done', {});
          await db.update(agentJobsSchema).set({ status: 'done' }).where(eq(agentJobsSchema.id, jobId));
        }
        return;
      }

      let currentAssistantMsgId = assistantMessageId ?? crypto.randomUUID();
      let currentAssistantText = '';
      let completed = false;

      // ── Ultrawork state ─────────────────────────────────────────────────
      let todos: TodoItem[] = [];
      let taskCompleted = false;

      function emitTodoUpdate() {
        emit({ type: 'todo_update', todos });
        if (jobId) persistJobEvent(jobId, 'todo_update', { todos }).catch(() => {});
      }

      // Loop detection: track the last 3 tool-call batch signatures.
      // If all 3 are identical the agent is stuck — break out gracefully.
      const recentBatchSigs: string[] = [];
      let loopRecoveryAttempts = 0;

      // Consecutive error escalation: if tool calls keep failing across multiple
      // iterations, force the agent to consult Oracle for a new plan.
      let consecutiveErrorIterations = 0;

      // Context budget warning: injected once when the conversation reaches
      // CONTEXT_WARN_TOKENS, prompting the agent to work efficiently.
      let contextBudgetWarned = false;

      for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
        // ── Context compression & budget check ─────────────────────────────
        // Run before every LLM call so the model always has headroom to reason.
        const { messages: compressedMessages, compressed } = compressConversationHistory(conversation, todos);
        if (compressed) {
          conversation.length = 0;
          conversation.push(...compressedMessages);
          emit({ type: 'context_compressed' });
          if (jobId) persistJobEvent(jobId, 'context_compressed', { iteration }).catch(() => {});
        }

        if (!contextBudgetWarned && estimateMessagesTokens(conversation) >= CONTEXT_WARN_TOKENS) {
          contextBudgetWarned = true;
          conversation.push({
            role: 'user',
            content: '[System] Context budget is getting large. Be concise in your tool calls and avoid re-reading files you have already seen this session. Prioritize completing your remaining todos efficiently.',
          });
        }
        // ───────────────────────────────────────────────────────────────────

        let iterText = '';
        const { content, toolCalls, finishReason } = await streamChargedFireworksCall(
          {
            messages: conversation,
            tools: [...githubToolDefinitions.filter(t => !['github_upsert_file', 'github_delete_file'].includes(t.function.name)), ...daytonaToolDefinitions, callLibrarianProToolDefinition, callOracleToolDefinition, callEditorToolDefinition, ...ULTRAWORK_TOOLS],
            tool_choice: 'auto',
            max_tokens: agentMaxTokens,
            temperature: agentTemperature,
            reasoning_effort: 'high',
          },
          (delta) => {
            emit({ delta });
            iterText += delta;
            currentAssistantText += delta;
            queueContentEvent(delta);
          },
        );

        if (finishReason === 'length') {
          await flushContentEvent();
          const truncatedText = currentAssistantText || iterText || content;
          if (conversationId && currentAssistantMsgId) {
            await saveMessage(conversationId, currentAssistantMsgId, 'assistant', truncatedText);
          }
          const continueMsg = '\n\n*(Response was very long — continuing automatically so the task is not cut off…)*';
          emit({ delta: continueMsg });
          queueContentEvent(continueMsg);
          conversation.push({ role: 'assistant', content: (truncatedText + continueMsg) });
          conversation.push({
            role: 'user',
            content: 'Continue exactly where you left off. Do not summarize, restart, or ask for confirmation. Keep working until the original task is complete and verified.',
          });
          currentAssistantText = '';
          currentAssistantMsgId = crypto.randomUUID();
          const nextAssistantMsgId = currentAssistantMsgId;
          emit({ type: 'next_assistant_msg', nextAssistantMsgId });
          if (jobId) await persistJobEvent(jobId, 'next_assistant_msg', { nextAssistantMsgId });
          continue;
        }

        if (!toolCalls.length) {
          await flushContentEvent();
          const finalText = currentAssistantText || iterText || content;

          // ── Ultrawork continuation ────────────────────────────────────────
          // If the AI stopped but hasn't called task_complete, check todos.
          if (!taskCompleted && todos.length > 0) {
            const pending = todos.filter(t => t.status !== 'done');
            if (pending.length > 0) {
              // Still has incomplete todos — re-inject to continue.
              if (finalText && conversationId && currentAssistantMsgId) {
                await saveMessage(conversationId, currentAssistantMsgId, 'assistant', finalText);
              }
              const nextAssistantMsgId = crypto.randomUUID();
              emit({ type: 'next_assistant_msg', nextAssistantMsgId });
              if (jobId) await persistJobEvent(jobId, 'next_assistant_msg', { nextAssistantMsgId });
              currentAssistantMsgId = nextAssistantMsgId;
              currentAssistantText = '';
              const pendingList = pending.map(t => `- [${t.id}] ${t.task} (${t.status})`).join('\n');
              conversation.push({ role: 'assistant', content: finalText });
              conversation.push({
                role: 'user',
                content: `[Ultrawork Loop] You stopped but have ${pending.length} incomplete task(s):\n${pendingList}\n\nContinue working. Update todos with \`todo_write\` as you complete each step. When truly done, call \`task_complete\`.`,
              });
              continue;
            }
            // All todos are done but task_complete wasn't called — nudge to finalize.
            if (finalText && conversationId && currentAssistantMsgId) {
              await saveMessage(conversationId, currentAssistantMsgId, 'assistant', finalText);
            }
            const nextAssistantMsgId = crypto.randomUUID();
            emit({ type: 'next_assistant_msg', nextAssistantMsgId });
            if (jobId) await persistJobEvent(jobId, 'next_assistant_msg', { nextAssistantMsgId });
            currentAssistantMsgId = nextAssistantMsgId;
            currentAssistantText = '';
            conversation.push({ role: 'assistant', content: finalText });
            conversation.push({
              role: 'user',
              content: '[Ultrawork Loop] All your todos are marked done. Call `task_complete` with a brief summary to exit the loop.',
            });
            continue;
          }
          // ────────────────────────────────────────────────────────────────────

          // ── Intent-without-action detection ─────────────────────────────────
          // The model sometimes outputs "I'll search for X" or "Let me look up Y"
          // in its response text without actually emitting a tool call. When that
          // happens, nudge it to call the tool instead of silently stopping.
          const intentPattern = /\b(I['']ll|I will|let me|I['']m going to|I am going to|I need to|I should|I can)\b[^.!?\n]{0,120}\b(search|look|find|check|read|fetch|browse|scan|inspect|analyze|research|query|get|grab|pull|load|open|navigate|call|use|run|execute|create|write|update|list|review|clone|examine)\b/i;
          if (finalText && intentPattern.test(finalText.slice(-800))) {
            // Save the partial text so the user can see the reasoning, then continue.
            if (conversationId && currentAssistantMsgId) {
              await saveMessage(conversationId, currentAssistantMsgId, 'assistant', finalText);
            }
            const nextAssistantMsgId = crypto.randomUUID();
            emit({ type: 'next_assistant_msg', nextAssistantMsgId });
            if (jobId) await persistJobEvent(jobId, 'next_assistant_msg', { nextAssistantMsgId });
            currentAssistantMsgId = nextAssistantMsgId;
            currentAssistantText = '';
            conversation.push({ role: 'assistant', content: finalText });
            conversation.push({
              role: 'user',
              content: 'You described an action but did not call any tools. Execute the tool call now — do not narrate, just call it.',
            });
            continue;
          }
          // ────────────────────────────────────────────────────────────────────

          if (!finalText) emit({ delta: 'I could not produce a response.' });

          if (conversationId && currentAssistantMsgId) {
            await saveMessage(conversationId, currentAssistantMsgId, 'assistant', finalText || 'I could not produce a response.');
          }
          if (jobId) {
            await persistJobEvent(jobId, 'done', {});
          }
          completed = true;
          break;
        }

        // ── Loop detection ───────────────────────────────────────────────────
        // Fingerprint this tool-call batch by name + first 300 chars of args.
        // If the last 3 batches are identical, the agent is looping — recover before stopping.
        const batchSig = toolCalls
          .map(t => `${t.function.name}:${t.function.arguments.slice(0, 300)}`)
          .join('|');
        recentBatchSigs.push(batchSig);
        if (recentBatchSigs.length > 3) recentBatchSigs.shift();

        if (recentBatchSigs.length === 3 && recentBatchSigs.every(s => s === batchSig)) {
          loopRecoveryAttempts += 1;
          if (loopRecoveryAttempts <= 2) {
            conversation.push({
              role: 'user',
              content: '[Autonomy recovery] You are repeating the same tool calls. Stop that exact action, reassess the objective, use a different evidence source or call Oracle for a second-opinion plan, then continue autonomously until the task is verified and complete.',
            });
            recentBatchSigs.length = 0;
            continue;
          }

          const stuckMsg = '\n\nI exhausted the automatic recovery attempts and stopped to avoid an infinite loop. I preserved the completed work and need one specific piece of user input before continuing.';
          emit({ delta: stuckMsg });
          queueContentEvent(stuckMsg);
          await flushContentEvent();
          if (conversationId && currentAssistantMsgId) {
            await saveMessage(conversationId, currentAssistantMsgId, 'assistant', currentAssistantText + stuckMsg);
          }
          if (jobId) await persistJobEvent(jobId, 'done', {});
          completed = true;
          break;
        }
        // ────────────────────────────────────────────────────────────────────

        if (iterText && conversationId && currentAssistantMsgId) {
          await flushContentEvent();
          await saveMessage(conversationId, currentAssistantMsgId, 'assistant', iterText);
          currentAssistantText = '';
        }

        const labels = toolCalls.map(t => toolLabel(t.function.name, parseToolArgs(t.function.arguments)));
        const toolStepsMsgId = crypto.randomUUID();
        const nextAssistantMsgId = crypto.randomUUID();
        currentAssistantMsgId = nextAssistantMsgId;
        currentAssistantText = '';

        emit({ type: 'tool_call', tools: labels, toolStepsMsgId, nextAssistantMsgId });
        if (jobId) {
          await persistJobEvent(jobId, 'tool_call', { tools: labels, toolStepsMsgId, nextAssistantMsgId });
        }

        conversation.push({ role: 'assistant', content: content ?? '', tool_calls: toolCalls });

        const toolSteps: ToolStepUpdate[] = labels.map(l => ({ label: l, status: 'running' }));

        await Promise.all(
          toolCalls.map(async (toolCall) => {
            const toolName = toolCall.function.name;
            const toolArgs = parseToolArgs(toolCall.function.arguments);
            const label = toolLabel(toolName, toolArgs);
            emit({ type: 'tool_start', tool: label });
            if (jobId) await persistJobEvent(jobId, 'tool_start', { tool: label });
            try {
              let result: unknown;
              if (isCallLibrarianProTool(toolName)) {
                const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
                const parentLabel = label;
                result = await runLibrarianProSubagent(request, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'librarian_pro_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'librarian_pro_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'librarian_pro_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'librarian_pro_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'librarian_pro_report', parentLabel, report });
                if (jobId) persistJobEvent(jobId, 'librarian_pro_report', { parentLabel, report }).catch(() => {});
              } else if (isCallOracleTool(toolName)) {
                const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
                const parentLabel = label;
                result = await runOracleSubagent(request, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'oracle_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'oracle_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'oracle_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'oracle_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'oracle_report', parentLabel, report });
                if (jobId) persistJobEvent(jobId, 'oracle_report', { parentLabel, report }).catch(() => {});
              } else if (isCallEditorTool(toolName)) {
                const instructions = typeof toolArgs.instructions === 'string' ? toolArgs.instructions : JSON.stringify(toolArgs);
                const files = Array.isArray(toolArgs.files) ? toolArgs.files.map(String) : [];
                const parentLabel = label;
                result = await runEditorSubagent(instructions, files, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'editor_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'editor_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'editor_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'editor_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const editorReport = typeof (result as { report?: unknown }).report === 'string'
                  ? (result as { report: string }).report
                  : JSON.stringify(result);
                emit({ type: 'editor_report', parentLabel, report: editorReport });
                if (jobId) persistJobEvent(jobId, 'editor_report', { parentLabel, report: editorReport }).catch(() => {});
              } else if (isDaytonaTool(toolName)) {
                result = await runDaytonaTool(toolName, toolArgs);
                if (toolName === 'sandbox_create' && conversationId) {
                  const sandboxId = (result as Record<string, unknown>)?.sandbox_id;
                  if (typeof sandboxId === 'string') {
                    await db.update(conversationsSchema).set({ sandboxId }).where(eq(conversationsSchema.id, conversationId));
                  }
                }
              } else if (toolName === 'todo_write') {
                const raw = Array.isArray(toolArgs.todos) ? toolArgs.todos : [];
                todos = raw.map((item: unknown) => {
                  const t = item as Record<string, unknown>;
                  return {
                    id: String(t.id ?? ''),
                    task: String(t.task ?? ''),
                    status: (['pending', 'in_progress', 'done'].includes(t.status as string) ? t.status : 'pending') as TodoStatus,
                  };
                });
                emitTodoUpdate();
                result = { ok: true, todos };
              } else if (toolName === 'todo_read') {
                result = { todos };
              } else if (toolName === 'task_complete') {
                taskCompleted = true;
                const summary = typeof toolArgs.summary === 'string' ? toolArgs.summary : '';
                todos = todos.map(t => ({ ...t, status: 'done' as TodoStatus }));
                emitTodoUpdate();
                result = { ok: true, message: 'Task marked complete. Write your final summary now.' };
              } else {
                result = await runGitHubTool(githubToken, toolName, toolArgs);
              }
              conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 32000) });
              const idx = toolSteps.findIndex(s => s.label === label);
              const touchedFiles = getTouchedFiles(result);
              if (idx !== -1) {
                toolSteps[idx]!.status = 'done';
                if (touchedFiles) toolSteps[idx]!.touchedFiles = touchedFiles;
              }
              emit({ type: 'tool_complete', tool: label, touchedFiles });
              if (jobId) await persistJobEvent(jobId, 'tool_complete', { tool: label, touchedFiles });
            } catch (error) {
              conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: (error as Error).message }) });
              const idx = toolSteps.findIndex(s => s.label === label);
              if (idx !== -1) toolSteps[idx]!.status = 'error';
              emit({ type: 'tool_complete', tool: label, error: true });
              if (jobId) await persistJobEvent(jobId, 'tool_complete', { tool: label, error: true });
            }
          }),
        );

        if (conversationId) {
          const finalSteps = toolSteps.map(s => ({ ...s, status: s.status === 'running' ? 'done' : s.status }));
          await saveMessage(conversationId, toolStepsMsgId, 'tool_steps', finalSteps);
        }

        emit({ type: 'tool_done' });
        if (jobId) await persistJobEvent(jobId, 'tool_done', {});

        // ── Consecutive error escalation ─────────────────────────────────────
        // If every tool in the batch errored, count it as a bad iteration.
        // After 3 consecutive all-error iterations, force an Oracle consultation.
        const hadAnyError = toolSteps.some(s => s.status === 'error');
        const hadAnySuccess = toolSteps.some(s => s.status === 'done');
        if (hadAnyError && !hadAnySuccess) {
          consecutiveErrorIterations += 1;
        } else {
          consecutiveErrorIterations = 0;
        }

        if (consecutiveErrorIterations >= 3) {
          consecutiveErrorIterations = 0;
          conversation.push({
            role: 'user',
            content: '[Autonomy recovery — repeated tool failures] Every tool call has errored for 3 consecutive iterations. Stop retrying the same approach. Call `call_oracle` right now to get a fresh diagnostic plan, then follow a completely different strategy.',
          });
          emit({ type: 'error_escalation' });
          if (jobId) persistJobEvent(jobId, 'error_escalation', { iteration }).catch(() => {});
        }
        // ────────────────────────────────────────────────────────────────────
      }

      if (!completed) {
        const limitMessage = '\n\nI paused after a long run to avoid looping indefinitely. The task may need another message to continue.';
        emit({ delta: limitMessage });
        queueContentEvent(limitMessage);
        await flushContentEvent();
        if (conversationId && currentAssistantMsgId) {
          await saveMessage(conversationId, currentAssistantMsgId, 'assistant', currentAssistantText + limitMessage);
        }
      }
    } catch (error) {
      emit({ type: 'error', message: (error as Error).message });
      if (jobId) {
        try {
          await persistJobEvent(jobId, 'error', { message: (error as Error).message });
          await db.update(agentJobsSchema).set({ status: 'error' }).where(eq(agentJobsSchema.id, jobId));
        } catch (dbErr) {
          logger.warn({ dbErr, jobId }, 'Failed to persist job error status');
        }
      }
    } finally {
      if (jobId) {
        try {
          const jobs = await db.select().from(agentJobsSchema).where(eq(agentJobsSchema.id, jobId));
          if (jobs[0]?.status === 'running') {
            await db.update(agentJobsSchema).set({ status: 'done' }).where(eq(agentJobsSchema.id, jobId));
          }
        } catch (dbErr) {
          logger.warn({ dbErr, jobId }, 'Failed to mark job as done');
        }
      }
      close();
    }
  })();

  return new Response(readable, { headers });
}
