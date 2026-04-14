import type { NextRequest } from 'next/server';
import { getGitHubToken, githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';

export const runtime = 'nodejs';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p5';

const SYSTEM_PROMPT = `You are Ona, an AI software engineering agent platform inspired by ona.com.

Your product promise is: task in, pull request out. You act like a background software engineering agent operating across repositories with clear plans, scoped execution, logs, and merge-ready pull requests.

Core behavior:
- Treat GitHub as the source of truth when it is connected. Use tools to inspect repositories, branches, files, and existing code before proposing or making changes.
- Prefer concrete repository actions: list relevant repos, read files, create a task branch, commit focused file changes, and open a pull request with a clear summary and verification notes.
- Be explicit about what you changed, what branch you used, what PR you opened, and what still needs human review.
- If GitHub is not connected, ask the user to connect GitHub in the app before claiming you can access private repos or create PRs.
- Never fabricate repository contents, branch names, commits, or PR URLs.
- For large tasks, behave like a background agent: clarify the target repo if needed, inspect context, execute in small safe steps, and report progress.
- For risky changes, prefer a draft PR and explain the risk.

Ona-style capabilities to emphasize:
- isolated repository workspaces for clone/inspect workflows
- automated code review and CVE remediation
- code migration and modernization
- documentation sync and stale PR cleanup
- auditable task logs, branch diffs, and review-ready pull requests

When responding:
- Be concise, technical, and actionable.
- Use markdown for short plans, summaries, changed files, and PR links.
- If shown an image of code, a PR, or an error, analyze it and connect it to repo work where possible.`;

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
    throw new Error('FIREWORKS_API_KEY is not configured.');
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
    max_tokens: 1400,
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
        content: 'GitHub is not connected for this user. If the user asks for repository access, cloning, commits, or pull requests, instruct them to connect GitHub in the app first.',
      });
      return streamFireworks(conversation);
    }

    for (let i = 0; i < 5; i += 1) {
      const res = await callFireworks({
        messages: conversation,
        tools: githubToolDefinitions,
        tool_choice: 'auto',
        stream: false,
        max_tokens: 1200,
        temperature: 0.35,
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

      for (const toolCall of message.tool_calls) {
        try {
          const result = await runGitHubTool(githubToken, toolCall.function.name, parseToolArgs(toolCall.function.arguments));
          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result).slice(0, 20000),
          });
        } catch (error) {
          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: (error as Error).message }),
          });
        }
      }
    }

    conversation.push({
      role: 'user',
      content: 'Summarize the GitHub work completed so far and ask for the smallest missing decision if more work is needed.',
    });

    return streamFireworks(conversation);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
