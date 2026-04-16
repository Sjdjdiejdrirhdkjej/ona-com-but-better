import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { agentEventsSchema, agentJobsSchema, conversationsSchema, messagesSchema } from '@/models/Schema';
import { getGitHubToken, githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';
import { daytonaToolDefinitions, isDaytonaTool, runDaytonaTool } from '@/libs/Daytona';
import { callLibrarianToolDefinition, isCallLibrarianTool, runLibrarianSubagent } from '@/libs/Librarian';
import { callBrowserUseToolDefinition, isCallBrowserUseTool, runBrowserUseSubagent } from '@/libs/BrowserUse';

export const runtime = 'nodejs';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

export const ONA_MODELS = {
  'ona-max': {
    label: 'ONA Max',
    description: 'GLM 5.1 — most capable',
    fireworksId: 'accounts/fireworks/models/glm-5p1',
  },
  'ona-max-fast': {
    label: 'ONA Max Fast',
    description: 'Kimi K2.5 Turbo — fast & smart',
    fireworksId: 'accounts/fireworks/routers/kimi-k2p5-turbo',
  },
  'ona-mini': {
    label: 'ONA Mini',
    description: 'Llama 4 Scout — lightweight',
    fireworksId: 'accounts/fireworks/models/llama4-scout-instruct-basic',
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

const SYSTEM_PROMPT = `You are **ONA**, a fully autonomous background software engineering agent. Your mission is singular: **task in → pull request out**. You work to completion without asking for permission or confirmation unless a decision is genuinely impossible to make without information you cannot obtain yourself.

---

## CORE OPERATING PRINCIPLES

### 1. Autonomy — work to completion
Never stop mid-task to ask for confirmation. If uncertainty can be resolved by reading the code, read it. Only block on user input when a decision is impossible to make without information you genuinely cannot obtain from the available tools.

### 2. Efficiency — every tool call has cost
- **Batch parallel reads**: fire multiple \`github_read_file\` calls simultaneously, not sequentially.
- **Map once**: use \`github_get_file_tree\` once to understand repo structure — do not call \`github_list_directory\` repeatedly.
- **Search before reading**: use \`github_search_code\` to locate symbols/patterns across the whole repo before opening files.
- **One PR per task**: write all file changes to one branch, then open one PR — never open multiple.
- **Reuse context**: if you already read a file this session, do not read it again.

### 3. Research before implementing
Before writing code that uses any library, API, or framework you have not explicitly seen working in this conversation: call \`call_librarian\` first. A single librarian call is far cheaper than implementing against the wrong API and fixing it afterward.

### 4. Verify before reporting
Before opening a PR or claiming a task is complete:
- If the repo has a test suite or build command, run it in a Daytona sandbox on your branch.
- Fix any failures in the same branch before opening the PR.
- Only report "done" when the work is verified.

### 5. Never hallucinate
Every file path, branch name, commit SHA, PR URL, function signature, package version, and code snippet you state must come from a tool result you received in this session. If you have not read it, do not state it.

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
- \`github_upsert_file\` → write all changes; batch independent file writes when possible
- \`github_create_pull_request\` → one PR per task with a complete body (see PR format below)
- \`github_add_pr_review\` → submit code review with inline comments and an overall verdict
- \`github_add_comment\` → comment on issues or PRs when needed

**When GitHub is NOT connected:**
Tell the user: "Connect your GitHub account using the button above to let me access your repositories." You can still assist with architecture, code review of pasted code, and planning.

---

### \`call_librarian\` — documentation & deep research

**Use for:** library APIs and usage, package versions, changelogs, migration guides, framework patterns, reference implementations from popular repos, any unfamiliar external dependency.

**Use BEFORE writing code**, not after hitting an error.

**Do NOT use for:** information you can determine by reading the repository itself. Use GitHub search/read for that.

**Example:** \`call_librarian({ request: "What is the correct API for drizzle-orm programmatic migrations in a Next.js 15 server component?" })\`

---

### \`call_browser_use\` — live browser automation

**Use for:** verifying a deployed site works end-to-end, filling web forms, extracting data from JS-rendered SPAs, taking screenshots of live UIs, automating multi-step web workflows.

**Do NOT use for:** documentation research (use librarian), anything accessible via the GitHub API.

**How it works:** The expert runs a persistent cloud browser via Playwright over CDP (no vision model needed — pages are read as accessibility trees with interactive element ref IDs like @e1, @e2). It can navigate, click, type, scroll, press keys, select dropdowns, and take screenshots all within the same stateful session — enabling login flows, multi-step forms, and SPA navigation.

**Example:** \`call_browser_use({ task: "Go to https://example.com/login, fill the email field with test@test.com and the password field with pass123, submit the form, then return what page appears and take a screenshot." })\`

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
3. Call \`call_librarian\` for any uncertain library/API usage.
4. \`github_create_branch\` → \`github_upsert_file\` (all changes) → sandbox verify → \`github_create_pull_request\` referencing the issue.

### Bug fix
1. \`github_search_code\` to locate the bug. \`github_read_file\` the relevant file(s) in parallel.
2. Understand root cause. Fix it. Sandbox-verify. Open PR explaining root cause in the body.

### Code review
1. \`github_get_pr_diff\` → analyse thoroughly.
2. \`github_add_pr_review\` with: inline comments on specific lines, and one of APPROVE / REQUEST_CHANGES / COMMENT as the overall verdict.
3. Flag: bugs, security issues, missing error handling, missing tests, breaking changes, performance problems.

### CVE & dependency remediation
1. \`github_read_file\` all dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml) in parallel.
2. Identify vulnerable version ranges. Call \`call_librarian\` to confirm safe replacement versions if uncertain.
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

## TROUBLESHOOTING PROTOCOL

If a fix attempt does not resolve the problem after two tries:
1. Step back. List 5–7 plausible root causes.
2. Rank them by likelihood.
3. Address the most likely cause first — explain your reasoning.
4. If still stuck after exhausting all plausible causes, report what you found and ask the user for additional context.

---

## HARD RULES
- **Never push directly to \`main\`** without explicit user approval for risky changes — open a draft PR instead.
- **Never fabricate** file contents, paths, SHAs, PR URLs, or version numbers.
- **One branch per task** — never mix unrelated changes on the same branch.
- **Large or risky changes** → open a **draft PR**, describe the risk, ask for review before merging.
- **No redundant comments** — do not comment code that already makes the intent obvious.
- **One final summary** after task completion — PR URL, files changed, anything needing human review. No padding.`;

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

    // ── Librarian ─────────────────────────────────────────────────────────
    case 'call_librarian': {
      const req = s('request');
      return req ? `Librarian: ${trim(req, 55)}` : 'Consulting librarian';
    }

    // ── Browser Use Expert ────────────────────────────────────────────────
    case 'call_browser_use': {
      const task = s('task');
      return task ? `Browser: ${trim(task, 52)}` : 'Using browser';
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
  error?: { message?: string };
};

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
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: FinishReason }> {
  const res = await callFireworks({ ...body, stream: true }, modelOverride);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: FinishReason = null;
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
          const choice = json.choices?.[0];
          const delta = choice?.delta as FireworksDelta | undefined;
          if (!delta) continue;

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason as FinishReason;
          }

          if (delta.content) {
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
    reader.releaseLock();
  }

  return { content, toolCalls: [...toolCallsMap.values()], finishReason };
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

async function saveMessage(conversationId: string, msgId: string, role: string, content: unknown) {
  try {
    await db.insert(messagesSchema).values({
      id: msgId,
      conversationId,
      role,
      content: typeof content === 'string' ? content : JSON.stringify(content),
    });
    await db.update(conversationsSchema).set({ updatedAt: new Date() }).where(eq(conversationsSchema.id, conversationId));
  } catch {}
}

async function persistJobEvent(jobId: string, type: string, data: Record<string, unknown> = {}) {
  try {
    await db.insert(agentEventsSchema).values({ jobId, type, data: JSON.stringify(data) });
  } catch {}
}

export async function POST(req: NextRequest) {
  const { readable, emit, close } = makeStream();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };

  (async () => {
    let jobId: string | null = null;
    try {
      const body = await req.json() as {
        messages: ApiMessage[];
        conversationId?: string;
        assistantMessageId?: string;
        model?: string;
      };

      const { messages, conversationId, assistantMessageId, model } = body;
      const fireworksModelId = model && model in ONA_MODELS
        ? ONA_MODELS[model as OnaModelKey].fireworksId
        : undefined;

      jobId = crypto.randomUUID();

      if (conversationId) {
        await db.insert(agentJobsSchema).values({ id: jobId, conversationId, status: 'running' });
      }

      emit({ type: 'job_id', jobId });

      const githubToken = await getGitHubToken();

      const conversation: ApiMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...normalizeMessages(messages),
      ];

      if (!githubToken) {
        conversation.splice(1, 0, {
          role: 'user',
          content: 'GitHub is not connected for this user. If they ask for any repository action, tell them to connect their GitHub account using the "Connect GitHub" button first. You can still help with general coding questions and planning.',
        });

        let text = '';
        await streamFireworksCall(
          { messages: conversation, max_tokens: 8192, temperature: 0.45 },
          (delta) => {
            emit({ delta });
            text += delta;
          },
          fireworksModelId,
        );

        if (conversationId && assistantMessageId) {
          await saveMessage(conversationId, assistantMessageId, 'assistant', text);
        }
        if (jobId) {
          await persistJobEvent(jobId, 'done', {});
          await db.update(agentJobsSchema).set({ status: 'done' }).where(eq(agentJobsSchema.id, jobId));
        }
        return;
      }

      let currentAssistantMsgId = assistantMessageId ?? crypto.randomUUID();
      let currentAssistantText = '';

      while (true) {
        let iterText = '';
        const { content, toolCalls, finishReason } = await streamFireworksCall(
          {
            messages: conversation,
            tools: [...githubToolDefinitions, ...daytonaToolDefinitions, callLibrarianToolDefinition, callBrowserUseToolDefinition],
            tool_choice: 'auto',
            max_tokens: 16384,
            temperature: 0.15,
          },
          (delta) => {
            emit({ delta });
            iterText += delta;
            currentAssistantText += delta;
          },
          fireworksModelId,
        );

        if (finishReason === 'length') {
          const truncatedText = currentAssistantText || iterText || content;
          if (conversationId && currentAssistantMsgId) {
            await saveMessage(conversationId, currentAssistantMsgId, 'assistant', truncatedText);
          }
          const continueMsg = '\n\n*(Response was very long — continuing…)*';
          emit({ delta: continueMsg });
          conversation.push({ role: 'assistant', content: (truncatedText + continueMsg) });
          currentAssistantText = '';
          currentAssistantMsgId = crypto.randomUUID();
          const nextAssistantMsgId = currentAssistantMsgId;
          emit({ type: 'next_assistant_msg', nextAssistantMsgId });
          continue;
        }

        if (!toolCalls.length) {
          const finalText = currentAssistantText || iterText || content;
          if (!finalText) emit({ delta: 'I could not produce a response.' });

          if (conversationId && currentAssistantMsgId) {
            await saveMessage(conversationId, currentAssistantMsgId, 'assistant', finalText || 'I could not produce a response.');
          }
          if (jobId) {
            await persistJobEvent(jobId, 'done', {});
          }
          break;
        }

        if (iterText && conversationId && currentAssistantMsgId) {
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

        const toolSteps: Array<{ label: string; status: string }> = labels.map(l => ({ label: l, status: 'running' }));

        await Promise.all(
          toolCalls.map(async (toolCall) => {
            const toolName = toolCall.function.name;
            const toolArgs = parseToolArgs(toolCall.function.arguments);
            const label = toolLabel(toolName, toolArgs);
            emit({ type: 'tool_start', tool: label });
            if (jobId) await persistJobEvent(jobId, 'tool_start', { tool: label });
            try {
              let result: unknown;
              if (isCallLibrarianTool(toolName)) {
                const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
                const parentLabel = label;
                result = await runLibrarianSubagent(request, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'librarian_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'librarian_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'librarian_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'librarian_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'librarian_report', parentLabel, report });
                if (jobId) persistJobEvent(jobId, 'librarian_report', { parentLabel, report }).catch(() => {});
              } else if (isCallBrowserUseTool(toolName)) {
                const task = typeof toolArgs.task === 'string' ? toolArgs.task : JSON.stringify(toolArgs);
                const parentLabel = label;
                result = await runBrowserUseSubagent(task, (event, stepLabel, error) => {
                  if (event === 'start') {
                    emit({ type: 'browser_use_step_start', parentLabel, step: stepLabel });
                    if (jobId) persistJobEvent(jobId, 'browser_use_step_start', { parentLabel, step: stepLabel }).catch(() => {});
                  } else {
                    emit({ type: 'browser_use_step_complete', parentLabel, step: stepLabel, error: error ?? false });
                    if (jobId) persistJobEvent(jobId, 'browser_use_step_complete', { parentLabel, step: stepLabel, error: error ?? false }).catch(() => {});
                  }
                });
                const report = typeof result === 'string' ? result : JSON.stringify(result);
                emit({ type: 'browser_use_report', parentLabel, report });
                if (jobId) persistJobEvent(jobId, 'browser_use_report', { parentLabel, report }).catch(() => {});
              } else if (isDaytonaTool(toolName)) {
                result = await runDaytonaTool(toolName, toolArgs);
                if (toolName === 'sandbox_create' && conversationId) {
                  const sandboxId = (result as Record<string, unknown>)?.sandbox_id;
                  if (typeof sandboxId === 'string') {
                    await db.update(conversationsSchema).set({ sandboxId }).where(eq(conversationsSchema.id, conversationId));
                  }
                }
              } else {
                result = await runGitHubTool(githubToken, toolName, toolArgs);
              }
              conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 24000) });
              const idx = toolSteps.findIndex(s => s.label === label);
              if (idx !== -1) toolSteps[idx]!.status = 'done';
              emit({ type: 'tool_complete', tool: label });
              if (jobId) await persistJobEvent(jobId, 'tool_complete', { tool: label });
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
      }
    } catch (error) {
      emit({ type: 'error', message: (error as Error).message });
      if (jobId) {
        try {
          await persistJobEvent(jobId, 'error', { message: (error as Error).message });
          await db.update(agentJobsSchema).set({ status: 'error' }).where(eq(agentJobsSchema.id, jobId));
        } catch {}
      }
    } finally {
      if (jobId) {
        try {
          const jobs = await db.select().from(agentJobsSchema).where(eq(agentJobsSchema.id, jobId));
          if (jobs[0]?.status === 'running') {
            await db.update(agentJobsSchema).set({ status: 'done' }).where(eq(agentJobsSchema.id, jobId));
          }
        } catch {}
      }
      close();
    }
  })();

  return new Response(readable, { headers });
}
