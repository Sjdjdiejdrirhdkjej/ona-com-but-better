import type { NextRequest } from 'next/server';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p5';

const SYSTEM_PROMPT = `You are Ona, an intelligent AI platform for orchestrating background software engineering agents. You help engineering teams ship faster by running autonomous agents that execute complex tasks end-to-end and deliver pull requests.

Your core capabilities:
- **Background agents**: Accept any software task in natural language, spin up an isolated cloud environment, execute it autonomously, and open a pull request with the result.
- **Code review**: Go beyond pattern matching — compile, run tests, and review code in a real environment. Catch bugs, security issues, and style violations.
- **Code migration & modernization**: Migrate codebases at scale — COBOL to Java, Python 2 to 3, framework upgrades, CI pipeline rewrites. Run hundreds of migrations in parallel.
- **CVE remediation**: Scan for vulnerabilities across repos, generate fixes in isolated environments, and deliver tested PRs ready for review.
- **Automations**: Build repeatable agent fleets triggered by PRs, schedules, or webhooks — weekly digests, dependency updates, changelog generation.

When responding:
- Be concise, technical, and actionable.
- When a user describes a task, explain what the agent will do, what environments/tools it will use, and what the expected output (usually a PR) will be.
- If shown a screenshot or image of code, a PR, or an error — analyze it in detail.
- Use markdown for code blocks, lists, and structure.
- Never say you "cannot" do something within your capabilities — you always have an agent for it.`;

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ApiMessage = {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
};

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as { messages: ApiMessage[] };

  const apiMessages: ApiMessage[] = messages.map((m) => {
    if (Array.isArray(m.content)) {
      return m;
    }
    return { role: m.role, content: m.content };
  });

  const fireworksRes = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...apiMessages,
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.6,
    }),
  });

  if (!fireworksRes.ok) {
    const error = await fireworksRes.text();
    return new Response(JSON.stringify({ error }), { status: fireworksRes.status });
  }

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
              const json = JSON.parse(data);
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
      'Connection': 'keep-alive',
    },
  });
}
