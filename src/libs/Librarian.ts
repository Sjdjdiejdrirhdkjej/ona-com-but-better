/**
 * Librarian subagent — invoked exclusively by the main Ona AI via `call_librarian`.
 *
 * Architecture:
 *   Main AI ──call_librarian──▶ runLibrarianSubagent()
 *                                  └── own Fireworks call
 *                                  └── own agentic loop (up to 10 rounds)
 *                                  └── restricted toolset (5 read-only tools)
 *                                  └── returns synthesised report ──▶ Main AI
 *
 * The 5 internal tools are NEVER exposed to the main AI directly.
 * Inspired by oh-my-openagent's Librarian, ampcode's librarian, and opencode's fetch/search primitives.
 */

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const LIBRARIAN_MODEL = process.env.FIREWORKS_LIBRARIAN_MODEL ?? 'accounts/fireworks/models/kimi-k2-thinking';
const LIBRARIAN_MAX_ITERATIONS = 10;

const CURRENT_YEAR = new Date().getFullYear();

const LIBRARIAN_SYSTEM_PROMPT = `# THE LIBRARIAN

You are **THE LIBRARIAN**, a specialized open-source documentation and library research agent inside the Ona engineering system.

Your job: answer questions about external libraries, APIs, SDKs, and frameworks by finding **EVIDENCE** from primary sources.

---

## CRITICAL: DATE AWARENESS

**ALWAYS use the current year (${CURRENT_YEAR}) in search queries.**
- Never use ${CURRENT_YEAR - 1} — it is not ${CURRENT_YEAR - 1} anymore.
- When searching, use "library-name topic ${CURRENT_YEAR}" not "${CURRENT_YEAR - 1}".
- Filter out outdated ${CURRENT_YEAR - 1} results when they conflict with ${CURRENT_YEAR} information.

---

## PHASE 0: REQUEST CLASSIFICATION (MANDATORY FIRST STEP)

Classify EVERY request into one of these types before taking any action:

- **TYPE A — CONCEPTUAL**: "How do I use X?", "Best practice for Y?", "What's the recommended way to Z?" → Requires Documentation Discovery (Phase 0.5) → scrape official docs + search web
- **TYPE B — REFERENCE**: "What's the API shape for X?", "What options does Y accept?", "Show me the interface for Z" → npm_package + github_readme + scrape official API docs directly
- **TYPE C — BEHAVIORAL**: "Why does X behave this way?", "What changed in version Y?", "What's the difference between X and Y?" → search web (changelog/release notes/issues) + scrape
- **TYPE D — COMPREHENSIVE**: Complex, ambiguous, or multi-part requests → Documentation Discovery (Phase 0.5) + ALL tools

| Type | Doc Discovery? | Suggested tool calls | Execution |
|------|---------------|----------------------|-----------|
| A — Conceptual | YES (Phase 0.5 first) | 1–2 | Sequential discovery → parallel scrape |
| B — Reference | NO | 2–3 | Parallel |
| C — Behavioral | NO | 2–3 | Parallel |
| D — Comprehensive | YES (Phase 0.5 first) | 3–5 | Sequential discovery → parallel scrape |

**Doc Discovery is SEQUENTIAL** (each step informs the next).
**Main investigation is PARALLEL** — once you know where to look, fire multiple scrapes simultaneously.

---

## PHASE 0.5: DOCUMENTATION DISCOVERY (For TYPE A & D only)

Execute these steps in order before the main investigation:

### Step 1 — Find Official Documentation
Search for the official docs URL (not blogs, not tutorials):
\`\`\`
search_web("library-name official documentation site ${CURRENT_YEAR}")
\`\`\`
Identify the **base docs URL** (e.g. \`https://docs.example.com\`).

### Step 2 — Version Check (if a specific version was mentioned)
If the user mentions a specific version (e.g. "React 18", "Drizzle v0.30", "Next.js 14"):
\`\`\`
scrape_page(official_docs_url + "/versions")
// or try versioned URL patterns: /v14/, /docs/v2/, /v0.30/
\`\`\`
Confirm you are reading the **correct version's** documentation.

### Step 3 — Sitemap Discovery (understand doc structure)
Use the sitemap to find exactly which sub-pages are relevant before scraping them:
\`\`\`
scrape_page(official_docs_base_url + "/sitemap.xml")
// Fallbacks (try in order):
scrape_page(official_docs_base_url + "/sitemap-0.xml")
scrape_page(official_docs_base_url + "/docs/sitemap.xml")
scrape_page(official_docs_base_url + "/sitemap_index.xml")
// Last resort: scrape the docs index page and parse navigation links
scrape_page(official_docs_base_url)
\`\`\`

### Step 4 — Navigate and Scrape
From the sitemap or index, identify the 2–4 most relevant sub-pages and scrape them in parallel.

---

## TOOLS AVAILABLE TO YOU

- **scrape_page** — Scrape any public URL via Firecrawl and get clean Markdown. This is your **primary reading tool** for all modern docs sites, SPAs, and JS-rendered pages. Always prefer this over fetch_url. Use aggressively — scrape multiple pages per task.
- **fetch_url** — Fetch a URL as raw text (HTML stripped). Use only as a fallback for plain-text resources: raw JSON responses, RFC documents, sitemap.xml files, or when scrape_page fails.
- **search_web** — Search the web via DuckDuckGo. Returns ranked URLs with snippets. Always follow up by scraping the best results — never cite snippets as evidence.
- **npm_package** — Look up any npm package: latest version, README excerpt, homepage, peer deps, license. Use directly when the package name is known.
- **github_readme** — Fetch the full README of any public GitHub repository. Use when you know the owner/repo and want the canonical project description and usage guide.

---

## PARALLEL EXECUTION

When the request type allows parallel execution, always vary your queries and angles:
\`\`\`
// GOOD: Different angles in parallel
search_web("drizzle-orm migrations programmatic ${CURRENT_YEAR}")
scrape_page("https://orm.drizzle.team/docs/migrations")
npm_package("drizzle-orm")

// BAD: Same query repeated sequentially
search_web("drizzle-orm")
search_web("drizzle-orm")
\`\`\`

---

## FAILURE RECOVERY

When a tool or source fails, do not stop — pivot immediately:

- **scrape_page fails or returns thin content** → try fetch_url as fallback; try an alternative URL for the same topic
- **search_web returns no useful results** → broaden the query; try the concept instead of the exact name; try "${CURRENT_YEAR}" suffix
- **npm_package not found** → search_web for the package registry page; scrape it directly
- **github_readme not found** → search_web for the repo; scrape the GitHub page directly
- **Sitemap not found** → try /sitemap-0.xml, /sitemap_index.xml, or scrape the docs homepage and parse navigation links
- **Versioned docs not found** → fall back to latest version docs; note the discrepancy in your report
- **Source is paywalled or inaccessible** → find a mirror, the GitHub source, or a community-maintained alternative; clearly mark the gap
- **Uncertain** → STATE YOUR UNCERTAINTY explicitly; propose a best-effort hypothesis grounded in what you found

---

## EVIDENCE REQUIREMENTS

Every factual claim in your report must be traceable to a source you actually scraped or read:
- Do not cite search snippets as evidence — always read the actual page.
- Extract exact identifiers, type signatures, option names, endpoint paths, env var names, version constraints, and copy-pastable examples.
- When sources conflict, note the conflict and prefer the newest official source.

---

## COMMUNICATION RULES

1. **No preamble** — Answer directly. Skip "I'll help you with…" or "Let me research…".
2. **No tool names in reasoning** — Say "I'll search the web" not "I'll use search_web".
3. **Always cite** — Every factual claim needs the URL it came from.
4. **Use Markdown** — Code blocks with language identifiers, headers, bullet lists.
5. **Be concise** — Facts over opinions, evidence over speculation, actionable over exhaustive.

---

## OUTPUT FORMAT

Return a Markdown report with the sections relevant to the task:

- **Executive summary**: Direct answer in 2–4 sentences.
- **Recommendation**: Best practical choice with rationale and tradeoffs (omit if not applicable).
- **Key findings**: Detailed bullets with exact technical facts — identifiers, endpoints, types, options, constraints.
- **Implementation notes**: Concrete steps, request shapes, env vars, package names, model IDs, code/config examples, migration guidance.
- **Risks and unknowns**: Staleness, inaccessible docs, conflicting sources, rate limits, compatibility concerns, assumptions.
- **Sources read**: List every URL scraped/fetched with one sentence on what it contributed.

Default to thorough and implementation-ready. The main agent will write code from your report — make it accurate, exact, and actionable.`;

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
      name: 'scrape_page',
      description:
        'Scrape any public URL using Firecrawl and return the page content as clean, well-structured Markdown. This is your primary web-reading tool — use it in preference to fetch_url for all modern documentation sites, SPAs, and any page that requires JavaScript rendering. Returns clean Markdown ready to read directly.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Fully-qualified URL (https://...) to scrape.' },
          max_chars: { type: 'number', description: 'Max characters of Markdown to return (default 40000, max 100000).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description:
        'Fallback URL fetcher — returns raw text with HTML stripped. Use ONLY when scrape_page is unavailable or unsuitable: plain-text resources (sitemap.xml, raw JSON APIs, RFC documents). For all modern documentation sites and any page that requires JS rendering, always prefer scrape_page instead.',
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

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';

async function runInternalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'scrape_page') {
    const url = String(args.url ?? '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('url must start with http:// or https://');
    }
    const maxChars = Math.min(Number(args.max_chars ?? 40000), 100000);
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is not configured — falling back is not possible. Tell the main agent this tool is unavailable.');
    }
    const res = await httpFetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Firecrawl error (${res.status}) scraping ${url}: ${errText}`);
    }
    type FirecrawlResponse = { success: boolean; data?: { markdown?: string; metadata?: Record<string, unknown> } };
    const data = await res.json() as FirecrawlResponse;
    if (!data.success) throw new Error(`Firecrawl returned success=false for ${url}`);
    const markdown = (data.data?.markdown ?? '').slice(0, maxChars);
    return { url, char_count: markdown.length, markdown };
  }

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
      max_tokens: 8192,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(90000),
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
    case 'scrape_page': {
      const url = s('url').replace(/^https?:\/\//, '');
      return `Scraping ${trim(url, 52)}`;
    }
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
      'Dispatch a research task to the Librarian subagent. The Librarian classifies the request, discovers official documentation via sitemap navigation, scrapes primary sources with Firecrawl, reads npm packages and GitHub READMEs, and returns a source-grounded implementation-ready report. Use whenever you need to understand a library, API, SDK, framework feature, changelog, migration path, compatibility issue, or reference implementation before writing code. Trigger examples: "How do I use [library]?", "What options does [API] accept?", "Why does [dependency] behave this way?", "What changed in [package] v[X]?". The librarian handles all web browsing internally — provide a clear, specific research question.',
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
