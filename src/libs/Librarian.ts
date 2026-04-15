/**
 * Librarian subagent — invoked exclusively by the main Ona AI via `call_librarian`.
 *
 * Architecture:
 *   Main AI ──call_librarian──▶ runLibrarianSubagent()
 *                                  └── own Fireworks call
 *                                  └── own agentic loop (up to 6 rounds)
 *                                  └── restricted toolset (4 read-only tools)
 *                                  └── returns synthesised report ──▶ Main AI
 *
 * The 4 internal tools are NEVER exposed to the main AI directly.
 * Inspired by ampcode's librarian and opencode's fetch/search primitives.
 */

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const LIBRARIAN_MODEL = process.env.FIREWORKS_MODEL ?? 'accounts/fireworks/models/kimi-k2p5';
const LIBRARIAN_MAX_ITERATIONS = 6;

const LIBRARIAN_SYSTEM_PROMPT = `You are the Librarian, a specialist read-only research subagent inside the Ona engineering agent system.

## Mission
Answer the research request given to you by the main agent. Gather accurate, authoritative information from primary sources (official documentation, package registries, GitHub repos, spec pages) and return a clear, dense, well-structured report.

## Tools available to you
- **fetch_url** — Fetch and read any public URL (docs, MDN, blog posts, RFCs, changelogs). Use this to read full documentation pages after searching for them.
- **search_web** — Search the web for documentation, tutorials, or reference implementations. Returns a ranked list of URLs — always follow up with fetch_url on the best results.
- **npm_package** — Look up an npm package: latest version, README, homepage, peer deps, license.
- **github_readme** — Fetch the README of any public GitHub repository.

## How to work
1. Start with search_web or npm_package / github_readme if you know the target.
2. Follow up with fetch_url on the most relevant results to get the actual content.
3. Read enough to give a thorough answer — multiple pages if needed.
4. Synthesise everything into a clear, structured report for the main agent.

## Output format
Return a Markdown report with:
- **Summary**: 2–3 sentence overview of what you found.
- **Key findings**: Bullet points of the most important information.
- **Code examples** (if relevant): Paste real examples from the sources.
- **Sources**: List of URLs you actually read.

Be concise but complete. The main agent will use your report to write code — make it actionable.`;

// ── Internal tool definitions (only seen by the librarian subagent) ───────────

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const INTERNAL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description:
        'Fetch any public URL and return its readable text content. HTML is automatically stripped. Use this to read documentation pages, MDN, RFCs, changelogs, or any web resource. Always fetch the actual page after finding URLs via search_web.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Fully-qualified URL (https://...).' },
          max_chars: { type: 'number', description: 'Max characters to return (default 30000, max 80000).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web via DuckDuckGo and return a ranked list of page titles and URLs. Follow up with fetch_url to read the best results.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query.' },
          max_results: { type: 'number', description: 'Number of results (default 8, max 20).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'npm_package',
      description:
        'Look up an npm package by exact name. Returns the latest version, description, homepage, repository URL, license, and README excerpt.',
      parameters: {
        type: 'object',
        required: ['package_name'],
        properties: {
          package_name: { type: 'string', description: 'Exact npm package name (e.g. "drizzle-orm", "@t3-oss/env-nextjs").' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_readme',
      description:
        'Fetch the README of any public GitHub repository. Useful for finding usage examples and reference implementations.',
      parameters: {
        type: 'object',
        required: ['owner', 'repo'],
        properties: {
          owner: { type: 'string', description: 'GitHub username or org.' },
          repo: { type: 'string', description: 'Repository name.' },
          ref: { type: 'string', description: 'Branch, tag, or SHA. Defaults to default branch.' },
        },
        additionalProperties: false,
      },
    },
  },
];

// ── HTML → plain-text ────────────────────────────────────────────────────────

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function httpFetch(url: string, opts?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(15000),
  });
}

// ── Internal tool executor ───────────────────────────────────────────────────

async function runInternalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'fetch_url') {
    const url = String(args.url ?? '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('url must start with http:// or https://');
    }
    const maxChars = Math.min(Number(args.max_chars ?? 30000), 80000);
    const res = await httpFetch(url, {
      headers: {
        'User-Agent': 'Ona-Librarian/1.0 (documentation scout)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    const text = contentType.includes('html') ? stripHtml(raw) : raw;
    return { url, char_count: Math.min(text.length, maxChars), content: text.slice(0, maxChars) };
  }

  if (name === 'search_web') {
    const query = String(args.query ?? '').trim();
    if (!query) throw new Error('query is required');
    const maxResults = Math.min(Number(args.max_results ?? 8), 20);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;

    const res = await httpFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ona-Librarian/1.0)', Accept: 'text/html' },
    });
    const html = await res.text();

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippets: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) !== null) snippets.push(stripHtml(m[1] ?? ''));

    let idx = 0;
    while ((m = linkRe.exec(html)) !== null && results.length < maxResults) {
      let href = m[1] ?? '';
      const title = stripHtml(m[2] ?? '').trim();
      if (href.startsWith('//duckduckgo.com/l/?')) {
        const uddg = new URLSearchParams(href.split('?')[1] ?? '').get('uddg');
        if (uddg) href = decodeURIComponent(uddg);
      }
      if (!href.startsWith('http') || !title) { idx++; continue; }
      results.push({ title, url: href, snippet: snippets[idx] ?? '' });
      idx++;
    }
    return { query, result_count: results.length, results };
  }

  if (name === 'npm_package') {
    const pkg = String(args.package_name ?? '').trim();
    if (!pkg) throw new Error('package_name is required');
    const encoded = encodeURIComponent(pkg).replace(/%40/g, '@').replace(/%2F/g, '/');
    const res = await httpFetch(`https://registry.npmjs.org/${encoded}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`npm registry ${res.status} for "${pkg}"`);

    type NpmData = {
      name: string; description?: string; license?: string; homepage?: string;
      repository?: { url?: string } | string;
      'dist-tags'?: { latest?: string };
      versions?: Record<string, { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }>;
      readme?: string;
    };
    const data = await res.json() as NpmData;
    const latest = data['dist-tags']?.latest ?? '';
    const vd = latest ? (data.versions?.[latest] ?? {}) : {};
    const repoUrl = typeof data.repository === 'object' ? data.repository?.url : data.repository;
    return {
      name: data.name, latest_version: latest, description: data.description,
      license: data.license, homepage: data.homepage, repository: repoUrl,
      dependencies: vd.dependencies ?? {}, peer_dependencies: vd.peerDependencies ?? {},
      readme_excerpt: (data.readme ?? '').slice(0, 8000),
    };
  }

  if (name === 'github_readme') {
    const owner = String(args.owner ?? '').trim();
    const repo = String(args.repo ?? '').trim();
    const ref = typeof args.ref === 'string' && args.ref ? args.ref : undefined;
    if (!owner || !repo) throw new Error('owner and repo are required');
    const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${refParam}`;
    const res = await httpFetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'Ona-Librarian/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 404) throw new Error(`No README found for ${owner}/${repo}`);
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo} README`);
    const raw = await res.text();
    const content = raw.slice(0, 40000);
    return { repository: `${owner}/${repo}`, ref: ref ?? 'default branch', char_count: content.length, content };
  }

  throw new Error(`Unknown librarian internal tool: ${name}`);
}

// ── Internal message types ───────────────────────────────────────────────────

type LibrarianToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type LibrarianMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: LibrarianToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type FireworksNonStreamResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
};

// ── Librarian agentic loop ───────────────────────────────────────────────────

async function librarianCall(messages: LibrarianMessage[]): Promise<{ content: string; toolCalls: LibrarianToolCall[] }> {
  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY is not configured.');
  }

  const res = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: LIBRARIAN_MODEL,
      messages,
      tools: INTERNAL_TOOLS,
      tool_choice: 'auto',
      max_tokens: 2400,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Librarian AI error (${res.status}): ${text}`);
  }

  const json = await res.json() as FireworksNonStreamResponse;
  if (json.error?.message) throw new Error(`Librarian AI error: ${json.error.message}`);

  const msg = json.choices?.[0]?.message;
  const content = msg?.content ?? '';
  const toolCalls: LibrarianToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id ?? crypto.randomUUID(),
    type: 'function',
    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
  }));

  return { content, toolCalls };
}

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}') as Record<string, unknown>; } catch { return {}; }
}

// ── Internal step label (human-readable label for each tool call) ─────────────

function internalStepLabel(name: string, args: Record<string, unknown>): string {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '');
  const trim = (v: string, max = 50) => (v.length > max ? `${v.slice(0, max)}…` : v);

  switch (name) {
    case 'fetch_url': {
      const url = s('url').replace(/^https?:\/\//, '');
      return `Fetching ${trim(url, 52)}`;
    }
    case 'search_web':
      return s('query') ? `Searching "${trim(s('query'), 45)}"` : 'Searching web';
    case 'npm_package':
      return s('package_name') ? `Looking up ${s('package_name')} on npm` : 'Looking up npm package';
    case 'github_readme': {
      const owner = s('owner');
      const repo = s('repo');
      return owner && repo ? `Reading ${owner}/${repo} README` : 'Reading GitHub README';
    }
    default:
      return name.replace(/_/g, ' ');
  }
}

// ── Step callback type ────────────────────────────────────────────────────────

export type LibrarianStepCallback = (
  event: 'start' | 'complete',
  stepLabel: string,
  error?: boolean,
) => void;

/**
 * Run the full librarian subagent loop for a research request.
 * Called by the main AI via the `call_librarian` tool.
 * @param onStep Optional callback fired as each internal tool call starts and completes.
 */
export async function runLibrarianSubagent(request: string, onStep?: LibrarianStepCallback): Promise<string> {
  const messages: LibrarianMessage[] = [
    { role: 'system', content: LIBRARIAN_SYSTEM_PROMPT },
    { role: 'user', content: request },
  ];

  for (let i = 0; i < LIBRARIAN_MAX_ITERATIONS; i++) {
    const { content, toolCalls } = await librarianCall(messages);

    if (!toolCalls.length) {
      return content || 'The librarian found no relevant information.';
    }

    messages.push({ role: 'assistant', content, tool_calls: toolCalls });

    for (const toolCall of toolCalls) {
      const args = parseArgs(toolCall.function.arguments);
      const stepLabel = internalStepLabel(toolCall.function.name, args);
      onStep?.('start', stepLabel);
      let result: unknown;
      try {
        result = await runInternalTool(toolCall.function.name, args);
        onStep?.('complete', stepLabel);
      } catch (err) {
        result = { error: (err as Error).message };
        onStep?.('complete', stepLabel, true);
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result).slice(0, 20000),
      });
    }
  }

  const last = messages.at(-1);
  if (last?.role === 'assistant') return (last as { role: 'assistant'; content: string }).content;
  return 'Research complete — librarian reached its iteration limit.';
}

// ── Gateway tool exposed to the main AI ─────────────────────────────────────

/**
 * The single tool the main AI has access to.
 * Invoking it kicks off the full librarian subagent internally.
 */
export const callLibrarianToolDefinition = {
  type: 'function',
  function: {
    name: 'call_librarian',
    description:
      'Dispatch a research task to the Librarian subagent. The librarian independently searches the web, fetches documentation pages, reads npm package info, and reads public GitHub READMEs — then returns a synthesised report. Use this any time you need to understand a library, find API usage examples, check a changelog, or scout reference implementations before writing code. The librarian handles all the browsing internally; you only need to provide a clear research question.',
    parameters: {
      type: 'object',
      required: ['request'],
      properties: {
        request: {
          type: 'string',
          description:
            'A clear, specific research question or instruction (e.g. "Find the official drizzle-orm docs for running migrations programmatically in a Next.js API route" or "Get the README for vercel/next.js and summarise App Router data-fetching patterns").',
        },
      },
      additionalProperties: false,
    },
  },
};

export function isCallLibrarianTool(name: string): boolean {
  return name === 'call_librarian';
}
