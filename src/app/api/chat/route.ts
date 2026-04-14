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
- Use github_list_commits with a `since` date to summarize what changed in a repo over the past week.
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
  }>;
};

function normalizeMessages(messages: ApiMessage[]) {
  return messages.map((m) => {
    if (Array.isArray(m.content)) {
      return m;
    }
    return { role: m.role, content: m.content };
  });
}

async function callFireworks(body: Record<string, unknown>) {
  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY is not configured. Please add it to your environment secrets.');
  }

  const res = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error);
  }

  return res;
}

function streamText(text: string) {
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,80}/g) ?? [''];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function streamFireworks(messages: ApiMessage[]) {
  const fireworksRes = await callFireworks({
    messages,
    stream: true,
    max_tokens: 1600,
    temperature: 0.45,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = fireworksRes.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              break;
            }
            try {
              const json = JSON.parse(data) as FireworksResponse;
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {}
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function parseToolArgs(value: string) {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
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
        content: 'GitHub is not connected for this user. If they ask for any repository action (listing repos, reading files, creating branches, making commits, opening PRs, reviewing code), tell them to connect their GitHub account using the "Connect GitHub" button first. You can still help with general coding questions and planning.',
      });
      return streamFireworks(conversation);
    }

    const MAX_TOOL_ITERATIONS = 10;
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
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
        return streamText(message?.content ?? 'I could not produce a response.');
      }

      conversation.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      });

      await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          try {
            const result = await runGitHubTool(githubToken, toolCall.function.name, parseToolArgs(toolCall.function.arguments));
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
    }

    conversation.push({
      role: 'user',
      content: 'Summarize all GitHub work completed so far. List any PR URLs opened, files changed, and what still requires human review or a follow-up task.',
    });

    return streamFireworks(conversation);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
