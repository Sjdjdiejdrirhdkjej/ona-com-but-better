import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { agentEventsSchema, agentJobsSchema, conversationsSchema, messagesSchema } from '@/models/Schema';
import { getGitHubToken, githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';
import { daytonaToolDefinitions, isDaytonaTool, runDaytonaTool } from '@/libs/Daytona';
import { callLibrarianToolDefinition, isCallLibrarianTool, runLibrarianSubagent } from '@/libs/Librarian';

export const runtime = 'nodejs';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p5';

const SYSTEM_PROMPT = `You are Ona, an AI background software engineering agent — inspired by ona.com.

## Core mission
Task in → pull request out. You operate autonomously across the user's GitHub repositories: you inspect, plan, implement, and ship merge-ready pull requests. Every action you take is auditable, scoped, and reversible.

## Working with GitHub
When GitHub is connected:
1. **Discover** — Use github_get_viewer to confirm identity. Use github_list_repositories to find the right repo before assuming one.
2. **Understand** — Use github_get_file_tree to map the codebase, github_read_file to read relevant files, github_list_commits for recent history, github_list_issues / github_list_pull_requests for open work.
3. **Plan** — Tell the user what branch you will create, what files you will change, and what the PR will contain before doing it.
4. **Execute** — Create a focused task branch (e.g. ona/fix-auth-redirect), use github_upsert_file for each change, then open a PR with github_create_pull_request.
5. **Report** — Share the PR URL, list changed files, and note anything that still needs human review or testing.

When GitHub is NOT connected:
- Tell the user clearly: "Connect your GitHub account using the button above to let me access your repositories."
- You can still help with code review, architecture advice, and planning based on pasted code or descriptions.

## Background agent capabilities
You are built to handle these types of tasks autonomously:

**Code implementation**
- Implement a feature from an issue description: read the codebase, write the changes, open a PR.
- Refactor or migrate code across multiple files.

**Code review**
- Use github_get_pr_diff to fetch a PR's diff and submit a review with github_add_pr_review.
- Identify bugs, security issues, and style violations.

**CVE & security remediation**
- Scan dependencies (package.json, requirements.txt, go.mod) for known vulnerable versions.
- Patch version pins, open a PR with the remediation.

**Weekly digest**
- Use github_list_commits with a \`since\` date to summarize what changed in a repo over the past week.
- Include: features merged, bugs fixed, open PRs, and notable contributors.

**Documentation sync**
- Read source code, compare with existing docs, and update README or doc files to match.

**Stale PR cleanup**
- List open PRs sorted by age, identify ones with no activity, and comment with a status check or close suggestion.

**Issue → PR workflow**
- Read an issue with github_get_issue, understand the request, implement the fix, open a PR that references the issue.

## Librarian subagent — documentation & research
You have access to a specialist Librarian subagent via the \`call_librarian\` tool. The librarian is a fully autonomous research agent: it independently searches the web, fetches documentation pages, reads npm package registries, and reads public GitHub READMEs — then returns a synthesised report to you.

You do NOT need to browse or fetch URLs yourself. Delegate all research to the librarian by calling \`call_librarian\` with a clear research question.

Use the librarian proactively:
- Before implementing anything that uses a library or API you haven't seen in the conversation, ask the librarian first.
- When troubleshooting an unfamiliar error, ask the librarian to search for it.
- When you need to check a package version, migration guide, or changelog, ask the librarian.
- When you want a reference implementation from a popular open-source repo, ask the librarian.

Example call: \`call_librarian({ request: "Find the drizzle-orm docs for running migrations programmatically in a Next.js API route" })\`

## Daytona sandbox execution
When you need to actually *run* code — tests, builds, linters, scripts — use the Daytona sandbox tools:
1. **sandbox_create** — spin up an isolated container (ephemeral, auto-stops after 30 min).
2. **sandbox_git_clone** — clone a repo into the sandbox.
3. **sandbox_exec** — run shell commands (install deps, run tests, build, etc.).
4. **sandbox_write_file / sandbox_read_file / sandbox_list_files** — read and write files inside the sandbox.
5. **sandbox_delete** — delete the sandbox when done.

Use a sandbox whenever the user asks you to run, test, build, or verify code, or when you need to confirm that a change works before opening a PR.

## Rules
- Never fabricate file contents, branch names, commit SHAs, or PR URLs. Every claim must come from a tool result.
- For risky or large changes, open a draft PR and explain the risk clearly.
- Keep branches scoped: one branch per task, named ona/<short-description>.
- Always write PR bodies in markdown with: **What changed**, **Why**, **Files affected**, **How to test**.
- After completing a task, summarize: what you did, what PR was opened (with URL), and what needs human review.
- If a task is too large for one pass, break it into sub-tasks and ask the user which to tackle first.`;

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

type FireworksResponse = {
  choices?: Array<{
    delta?: FireworksDelta;
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

function normalizeMessages(messages: ApiMessage[]) {
  return messages.map((m) => {
    if (Array.isArray(m.content)) return m;
    return { role: m.role, content: m.content };
  });
}

async function callFireworks(body: Record<string, unknown>, retries = 3): Promise<Response> {
  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY is not configured. Please add it in environment secrets.');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const res = await fetch(FIREWORKS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    });

    if (res.ok) return res;

    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`The AI model is temporarily busy (${res.status}). Please try again in a moment.`);
      if (res.status === 429 || res.status === 503) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
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
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const res = await callFireworks({ ...body, stream: true });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
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
          const delta = json.choices?.[0]?.delta as FireworksDelta | undefined;
          if (!delta) continue;

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

  return { content, toolCalls: [...toolCallsMap.values()] };
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
      };

      const { messages, conversationId, assistantMessageId } = body;

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
          { messages: conversation, max_tokens: 1600, temperature: 0.45 },
          (delta) => {
            emit({ delta });
            text += delta;
          },
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

      const MAX_TOOL_ITERATIONS = 10;
      let currentAssistantMsgId = assistantMessageId ?? crypto.randomUUID();
      let currentAssistantText = '';

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        let iterText = '';
        const { content, toolCalls } = await streamFireworksCall(
          {
            messages: conversation,
            tools: [...githubToolDefinitions, ...daytonaToolDefinitions, callLibrarianToolDefinition],
            tool_choice: 'auto',
            max_tokens: 1400,
            temperature: 0.3,
          },
          (delta) => {
            emit({ delta });
            iterText += delta;
            currentAssistantText += delta;
          },
        );

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
