import type { NextRequest } from 'next/server';
import { getGitHubToken, githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';

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

## Rules
- Never fabricate file contents, branch names, commit SHAs, or PR URLs. Every claim must come from a tool result.
- For risky or large changes, open a draft PR and explain the risk clearly.
- Keep branches scoped: one branch per task, named ona/<short-description>.
- Always write PR bodies in markdown with: **What changed**, **Why**, **Files affected**, **How to test**.
- After completing a task, summarize: what you did, what PR was opened (with URL), and what needs human review.
- If a task is too large for one pass, break it into sub-tasks and ask the user which to tackle first.`;

const TOOL_LABELS: Record<string, string> = {
  github_get_viewer: 'Checking GitHub identity',
  github_list_repositories: 'Listing repositories',
  github_get_repository: 'Reading repository',
  github_get_file_tree: 'Mapping codebase',
  github_read_file: 'Reading file',
  github_upsert_file: 'Writing file',
  github_delete_file: 'Deleting file',
  github_search_code: 'Searching code',
  github_list_branches: 'Listing branches',
  github_create_branch: 'Creating branch',
  github_list_commits: 'Reading commit history',
  github_get_commit: 'Reading commit',
  github_list_pull_requests: 'Listing pull requests',
  github_get_pull_request: 'Reading pull request',
  github_get_pr_diff: 'Reading PR diff',
  github_create_pull_request: 'Creating pull request',
  github_add_pr_review: 'Submitting PR review',
  github_list_issues: 'Listing issues',
  github_get_issue: 'Reading issue',
  github_create_issue: 'Creating issue',
  github_add_comment: 'Adding comment',
  github_clone_repo: 'Cloning repository',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace('github_', '').replace(/_/g, ' ');
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

type FireworksMessage = {
  role: 'assistant';
  content?: string | null;
  tool_calls?: ToolCall[];
};

type FireworksResponse = {
  choices?: Array<{
    message?: FireworksMessage;
    delta?: { content?: string };
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
      const text = await res.text();
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

export async function POST(req: NextRequest) {
  const { readable, emit, close } = makeStream();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };

  (async () => {
    try {
      const { messages } = await req.json() as { messages: ApiMessage[] };
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

        const fireworksRes = await callFireworks({
          messages: conversation,
          stream: true,
          max_tokens: 1600,
          temperature: 0.45,
        });

        const decoder = new TextDecoder();
        const reader = fireworksRes.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              try {
                const json = JSON.parse(data) as FireworksResponse;
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) emit({ delta });
              } catch {}
            }
          }
        } finally {
          reader.releaseLock();
        }
        return;
      }

      const MAX_TOOL_ITERATIONS = 10;

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const res = await callFireworks({
          messages: conversation,
          tools: githubToolDefinitions,
          tool_choice: 'auto',
          stream: false,
          max_tokens: 1400,
          temperature: 0.3,
        });

        const data = await res.json() as FireworksResponse;
        const message = data.choices?.[0]?.message;

        if (!message?.tool_calls?.length) {
          const text = message?.content ?? 'I could not produce a response.';
          const chunks = text.match(/[\s\S]{1,80}/g) ?? [''];
          for (const chunk of chunks) emit({ delta: chunk });
          break;
        }

        const labels = message.tool_calls.map(t => toolLabel(t.function.name));
        emit({ type: 'tool_call', tools: labels });

        conversation.push({
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        });

        await Promise.all(
          message.tool_calls.map(async (toolCall) => {
            try {
              const result = await runGitHubTool(
                githubToken,
                toolCall.function.name,
                parseToolArgs(toolCall.function.arguments),
              );
              conversation.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result).slice(0, 24000),
              });
            } catch (error) {
              conversation.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: (error as Error).message }),
              });
            }
          }),
        );

        emit({ type: 'tool_done' });
      }
    } catch (error) {
      emit({ type: 'error', message: (error as Error).message });
    } finally {
      close();
    }
  })();

  return new Response(readable, { headers });
}
