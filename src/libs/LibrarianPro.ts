/**
 * Librarian Pro subagent — merges the Librarian (static research) and Browser Use (live browser) capabilities
 * into a single unified research agent, invoked by the main AI via `call_librarian_pro`.
 *
 * Architecture:
 *   Main AI ──call_librarian_pro──▶ runLibrarianProSubagent()
 *                                      └── own Fireworks call
 *                                      └── own agentic loop (up to 25 rounds)
 *                                      └── 13 internal tools:
 *                                            Static: scrape_page, fetch_url, search_web, npm_package, github_readme
 *                                            Browser: browser_navigate, browser_snapshot, browser_click,
 *                                                     browser_type, browser_press, browser_scroll,
 *                                                     browser_select, browser_screenshot
 *                                      └── browser CDP session opened lazily on first browser_* call
 *                                      └── returns synthesised report ──▶ Main AI
 *
 * Replaces both call_librarian and call_browser_use.
 * The subagent decides which mode (static vs browser) based on what the task requires.
 */

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const LIBRARIAN_PRO_MODEL =
  process.env.FIREWORKS_LIBRARIAN_PRO_MODEL ?? 'accounts/fireworks/models/kimi-k2p5';
const LIBRARIAN_PRO_MAX_ITERATIONS = 25;

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev';
const FIRECRAWL_SESSION_TTL = Number(process.env.FIRECRAWL_BROWSER_TTL ?? '300');

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_DATE = new Date().toISOString().slice(0, 10);

// ── Accessibility tree (from BrowserUse) ─────────────────────────────────────

interface AccessNode {
  role: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  children?: AccessNode[];
}

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option',
  'checkbox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'spinbutton', 'slider', 'switch', 'treeitem', 'gridcell',
]);

interface RefEntry { role: string; name: string }

function buildSnapshot(
  node: AccessNode,
  refMap: Map<string, RefEntry>,
  counter: { n: number },
  depth = 0,
): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  const isInteractive = INTERACTIVE_ROLES.has(node.role);

  if (isInteractive && node.name) {
    const ref = `e${++counter.n}`;
    refMap.set(ref, { role: node.role, name: node.name });
    const val = node.value ? ` = "${node.value}"` : '';
    const dis = node.disabled ? ' (disabled)' : '';
    lines.push(`${indent}[@${ref}] ${node.role} "${node.name}"${val}${dis}`);
  } else if (node.name && !['none', 'generic', 'group', 'presentation', 'ignored'].includes(node.role)) {
    lines.push(`${indent}${node.role} "${node.name}"`);
  }

  const nextDepth = node.role !== 'none' && node.role !== 'generic' ? depth + 1 : depth;
  for (const child of node.children ?? []) {
    lines.push(...buildSnapshot(child, refMap, counter, nextDepth));
  }
  return lines;
}

// ── Browser session ────────────────────────────────────────────────────────────

async function firecrawlCreateSession(): Promise<{ sessionId: string; cdpUrl: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not configured.');

  const res = await fetch(`${FIRECRAWL_BASE_URL}/v2/browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ttl: FIRECRAWL_SESSION_TTL }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Firecrawl /v2/browser failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { id: string; cdpUrl: string };
  return { sessionId: data.id, cdpUrl: data.cdpUrl };
}

async function firecrawlCloseSession(sessionId: string): Promise<void> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return;
  try {
    await fetch(`${FIRECRAWL_BASE_URL}/v2/browser/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* best-effort */ }
}

class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private sessionId: string | null = null;
  private refMap: Map<string, RefEntry> = new Map();

  async open(): Promise<void> {
    const { sessionId, cdpUrl } = await firecrawlCreateSession();
    this.sessionId = sessionId;
    this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 30000 });
    const contexts = this.browser.contexts();
    const context = contexts[0] ?? await this.browser.newContext();
    const pages = context.pages();
    this.page = pages[0] ?? await context.newPage();
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser session not open. Call browser_navigate first.');
    return this.page;
  }

  async getSnapshot(full = false): Promise<string> {
    const page = this.getPage();
    this.refMap.clear();
    const counter = { n: 0 };
    const tree = await page.accessibility.snapshot({ interestingOnly: !full }) as AccessNode | null;
    if (!tree) return 'No accessible content found on this page.';

    const lines = buildSnapshot(tree, this.refMap, counter, 0);
    const header = `Page: ${page.url()}\n\n`;

    if (lines.length === 0) {
      return header + '(No accessible elements found — try with full=true or take a screenshot)';
    }

    const body = lines.join('\n');
    const note = counter.n > 0
      ? `\n\n${counter.n} interactive element(s) with [@ref] IDs above. Use browser_click(@eN) or browser_type(@eN, text) to interact.`
      : '';

    return header + body + note;
  }

  async clickRef(ref: string): Promise<string> {
    const page = this.getPage();
    const key = ref.replace('@', '');
    const entry = this.refMap.get(key);
    if (!entry) {
      throw new Error(
        `Ref ${ref} not found. Call browser_snapshot first to refresh element refs. ` +
        `Available refs: ${[...this.refMap.keys()].map(k => `@${k}`).join(', ') || 'none'}`,
      );
    }
    await page.getByRole(entry.role as Parameters<Page['getByRole']>[0], { name: entry.name }).first().click({ timeout: 10000 });
    return `Clicked ${entry.role} "${entry.name}"`;
  }

  async typeRef(ref: string, text: string, clear = true): Promise<string> {
    const page = this.getPage();
    const key = ref.replace('@', '');
    const entry = this.refMap.get(key);
    if (!entry) {
      throw new Error(
        `Ref ${ref} not found. Call browser_snapshot first. ` +
        `Available refs: ${[...this.refMap.keys()].map(k => `@${k}`).join(', ') || 'none'}`,
      );
    }
    const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], { name: entry.name }).first();
    if (clear) await locator.clear({ timeout: 5000 });
    await locator.type(text, { delay: 20 });
    return `Typed "${text}" into ${entry.role} "${entry.name}"`;
  }

  async navigate(url: string, waitFor: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<string> {
    const page = this.getPage();
    await page.goto(url, { waitUntil: waitFor, timeout: 30000 });
    const snapshot = await this.getSnapshot(false);
    return `Navigated to ${url}\n\n${snapshot}`;
  }

  async scroll(direction: 'up' | 'down', amount = 500): Promise<string> {
    const page = this.getPage();
    await page.evaluate(
      ([dir, px]) => window.scrollBy(0, dir === 'down' ? Number(px) : -Number(px)),
      [direction, amount],
    );
    return `Scrolled ${direction} by ${amount}px`;
  }

  async press(key: string): Promise<string> {
    const page = this.getPage();
    await page.keyboard.press(key);
    return `Pressed key: ${key}`;
  }

  async select(ref: string, value: string): Promise<string> {
    const page = this.getPage();
    const key = ref.replace('@', '');
    const entry = this.refMap.get(key);
    if (!entry) throw new Error(`Ref ${ref} not found. Call browser_snapshot first.`);
    const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], { name: entry.name }).first();
    await locator.selectOption(value, { timeout: 5000 });
    return `Selected "${value}" in ${entry.role} "${entry.name}"`;
  }

  async screenshot(): Promise<string> {
    const page = this.getPage();
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  async close(): Promise<void> {
    try { await this.browser?.close(); } catch { /* ignore */ }
    if (this.sessionId) await firecrawlCloseSession(this.sessionId);
    this.browser = null;
    this.page = null;
    this.sessionId = null;
    this.refMap.clear();
  }
}

// ── HTML utilities ────────────────────────────────────────────────────────────

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
  return fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
}

// ── DuckDuckGo search ─────────────────────────────────────────────────────────

async function searchWeb(query: string, maxResults = 8): Promise<unknown> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const res = await httpFetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LibrarianPro/1.0)', Accept: 'text/html' },
  });
  const html = await res.text();
  const capped = Math.min(maxResults, 20);

  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = snippetRe.exec(html)) !== null) snippets.push(stripHtml(m[1] ?? ''));
  let idx = 0;
  while ((m = linkRe.exec(html)) !== null && results.length < capped) {
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

// ── Internal tool runner ──────────────────────────────────────────────────────

async function runInternalTool(
  name: string,
  args: Record<string, unknown>,
  session: BrowserSession,
): Promise<unknown> {
  // ── Static research tools ──────────────────────────────────────────────────

  if (name === 'scrape_page') {
    const url = String(args.url ?? '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('url must start with http:// or https://');
    }
    const maxChars = Math.min(Number(args.max_chars ?? 40000), 100000);
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not configured.');

    const res = await httpFetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Firecrawl error (${res.status}) scraping ${url}: ${errText}`);
    }
    type FirecrawlResponse = { success: boolean; data?: { markdown?: string } };
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
        'User-Agent': 'LibrarianPro/1.0 (documentation scout)',
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
    return searchWeb(query, Math.min(Number(args.max_results ?? 8), 20));
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
        'User-Agent': 'LibrarianPro/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 404) throw new Error(`No README found for ${owner}/${repo}`);
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo} README`);
    const raw = await res.text();
    const content = raw.slice(0, 40000);
    return { repository: `${owner}/${repo}`, ref: ref ?? 'default branch', char_count: content.length, content };
  }

  // ── Interactive browser tools ──────────────────────────────────────────────

  if (name === 'browser_navigate') {
    const url = String(args.url ?? '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('url must start with http:// or https://');
    }
    const waitFor = (['load', 'domcontentloaded', 'networkidle'] as const).includes(args.wait_for as 'load')
      ? (args.wait_for as 'load' | 'domcontentloaded' | 'networkidle')
      : 'load';
    return session.navigate(url, waitFor);
  }

  if (name === 'browser_snapshot') {
    return session.getSnapshot(Boolean(args.full));
  }

  if (name === 'browser_click') {
    const ref = String(args.ref ?? '');
    if (!ref) throw new Error('ref is required');
    return session.clickRef(ref);
  }

  if (name === 'browser_type') {
    const ref = String(args.ref ?? '');
    const text = String(args.text ?? '');
    if (!ref) throw new Error('ref is required');
    return session.typeRef(ref, text, args.clear !== false);
  }

  if (name === 'browser_press') {
    const key = String(args.key ?? '');
    if (!key) throw new Error('key is required');
    return session.press(key);
  }

  if (name === 'browser_scroll') {
    const direction = args.direction === 'up' ? 'up' : 'down';
    const amount = typeof args.amount === 'number' ? args.amount : 500;
    return session.scroll(direction, amount);
  }

  if (name === 'browser_select') {
    const ref = String(args.ref ?? '');
    const value = String(args.value ?? '');
    if (!ref || !value) throw new Error('ref and value are required');
    return session.select(ref, value);
  }

  if (name === 'browser_screenshot') {
    const dataUrl = await session.screenshot();
    return { screenshot: dataUrl, note: 'Screenshot captured as base64 PNG data URL.' };
  }

  throw new Error(`Unknown LibrarianPro internal tool: ${name}`);
}

// ── Internal tool definitions ──────────────────────────────────────────────────

type ToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const INTERNAL_TOOLS: ToolDefinition[] = [
  // ── Static research ──────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'scrape_page',
      description:
        'Scrape any public URL using Firecrawl and return the page content as clean Markdown. ' +
        'Primary tool for reading documentation sites, SPAs, and JS-rendered pages. ' +
        'Prefer over fetch_url and browser_navigate for docs and content-heavy pages.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Fully-qualified URL (https://...) to scrape.' },
          max_chars: { type: 'number', description: 'Max characters to return (default 40000, max 100000).' },
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
        'Fetch a URL as raw text (HTML stripped). Fallback for plain-text resources: sitemap.xml, raw JSON APIs, RFC documents. ' +
        'For modern docs and SPAs, always prefer scrape_page.',
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
        'Search the web via DuckDuckGo and return ranked URLs with snippets. ' +
        'Use when you need to discover URLs before scraping. ' +
        'Always follow up with scrape_page or browser_navigate on the best results.',
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
        'Look up an npm package. Returns latest version, README excerpt, homepage, peer deps, license.',
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
        'Fetch the README of any public GitHub repository. Good for usage examples and reference implementations.',
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
  // ── Interactive browser ───────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description:
        'Navigate to a URL in the cloud browser. Opens the browser session if not started yet. ' +
        'Returns a compact accessibility tree with interactive element ref IDs like @e1, @e2. ' +
        'Use for login-required pages, SPAs with dynamic content, or any page where static scraping fails. ' +
        'For static docs, prefer scrape_page — it is faster and does not require a browser session.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Fully-qualified URL (https://...) to navigate to.' },
          wait_for: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'Wait condition. Use "networkidle" for SPAs that fetch data after load (default: "load").',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_snapshot',
      description:
        'Get the current browser page accessibility tree as structured text with interactive element ref IDs. ' +
        'Call after interactions (click, type, press) to see updated page state. ' +
        'full=true returns all page content including text nodes.',
      parameters: {
        type: 'object',
        properties: {
          full: { type: 'boolean', description: 'If true, returns all content. Default: false (interactive elements only).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an interactive element by its ref ID from the most recent browser_snapshot.',
      parameters: {
        type: 'object',
        required: ['ref'],
        properties: {
          ref: { type: 'string', description: 'Element ref from snapshot, e.g. "@e5".' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field by its ref ID. Clears the field first by default.',
      parameters: {
        type: 'object',
        required: ['ref', 'text'],
        properties: {
          ref: { type: 'string', description: 'Input field ref, e.g. "@e2".' },
          text: { type: 'string', description: 'Text to type.' },
          clear: { type: 'boolean', description: 'Clear field before typing (default: true).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_press',
      description: 'Press a keyboard key on the current page. Use "Enter" to submit forms.',
      parameters: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: '"Enter", "Escape", "Tab", "ArrowDown", etc.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the page up or down.',
      parameters: {
        type: 'object',
        required: ['direction'],
        properties: {
          direction: { type: 'string', enum: ['up', 'down'] },
          amount: { type: 'number', description: 'Pixels to scroll (default 500).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_select',
      description: 'Select an option from a <select> dropdown using its ref ID.',
      parameters: {
        type: 'object',
        required: ['ref', 'value'],
        properties: {
          ref: { type: 'string' },
          value: { type: 'string', description: 'Option value or label to select.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current browser viewport. Returns a base64-encoded PNG data URL.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

// ── System prompt ──────────────────────────────────────────────────────────────

const LIBRARIAN_PRO_SYSTEM_PROMPT = `# LIBRARIAN PRO

You are **LIBRARIAN PRO**, a unified research and browser automation agent inside the ONA but OPEN SOURCE engineering system.

Today is ${CURRENT_DATE}. Always use the current year (${CURRENT_YEAR}) in search queries.

---

## YOUR CAPABILITIES

You have two operating modes. You choose the right one based on what each task requires:

### Mode A — Static Research (faster, no browser session)
Use for: library APIs, package versions, changelogs, framework docs, npm packages, GitHub READMEs, public documentation sites, open-source reference implementations.
Tools: **scrape_page**, **fetch_url**, **search_web**, **npm_package**, **github_readme**

### Mode B — Live Browser Automation (slower, requires browser session)
Use for: login-required pages, JS-rendered SPAs that scrape_page cannot read, filling web forms, multi-step web workflows, verifying deployed sites, taking screenshots of live UIs.
Tools: **browser_navigate**, **browser_snapshot**, **browser_click**, **browser_type**, **browser_press**, **browser_scroll**, **browser_select**, **browser_screenshot**

**Default to Mode A** — only use the browser tools when static scraping cannot get the job done.

---

## STATIC RESEARCH WORKFLOW (Mode A)

### Step 1 — Classify the request
- **TYPE A — Conceptual** ("How do I use X?") → Doc Discovery first, then scrape
- **TYPE B — Reference** ("What's the API shape?") → Parallel: npm_package + scrape official API docs
- **TYPE C — Behavioral** ("Why does X behave this way?") → search_web + scrape changelogs/issues
- **TYPE D — Comprehensive** → Doc Discovery + ALL static tools

### Step 2 — Doc Discovery (for Types A & D)
1. \`search_web("library-name official documentation site ${CURRENT_YEAR}")\`
2. \`scrape_page(sitemap_url)\` to find the right sub-pages
3. Scrape the 2–4 most relevant pages in parallel

### Step 3 — Parallel evidence gathering
Fire multiple scrape_page/search_web/npm_package calls simultaneously.

---

## LIVE BROWSER WORKFLOW (Mode B)

1. \`browser_navigate(url)\` — loads the page and returns an accessibility tree
2. Read the snapshot: interactive elements have \`[@eN]\` refs like \`[@e3] button "Sign in"\`
3. \`browser_type(@eN, "text")\` → \`browser_press("Enter")\` → \`browser_snapshot\` → repeat
4. \`browser_screenshot\` to visually confirm page state when needed
5. Synthesise everything observed into a structured Markdown report

---

## TOOL SELECTION QUICK REFERENCE

| Situation | Tool |
|-----------|------|
| Documentation site / library docs | scrape_page |
| Raw file (sitemap.xml, JSON API) | fetch_url |
| Discover URLs | search_web |
| npm package info | npm_package |
| GitHub README | github_readme |
| Login / auth required | browser_navigate |
| SPA with lazy-loaded content | browser_navigate (wait_for: networkidle) |
| Click a button | browser_click(@eN) |
| Fill a form field | browser_type(@eN, text) |
| Submit form | browser_press("Enter") |
| See current page state | browser_snapshot |
| Visual confirmation / CAPTCHA | browser_screenshot |

---

## EVIDENCE RULES (static research)

- Never cite search snippets as evidence — always read the actual page.
- Every factual claim must trace to a URL you actually scraped.
- Never extrapolate across versions. Flag conflicts between sources explicitly.
- Label unconfirmed facts: "UNVERIFIED — based on training data."

## BROWSER RULES (live automation)

- Never fabricate page content. Only report what tool outputs actually showed.
- Always take a snapshot after clicking or typing.
- If a ref is missing, take a fresh browser_snapshot.
- Stop and report clearly on CAPTCHAs or paywalls.

---

## FAILURE RECOVERY

- **scrape_page fails** → try fetch_url; try an alternative URL
- **search_web returns thin results** → broaden query; add "${CURRENT_YEAR}" suffix
- **npm_package not found** → search_web for the registry page and scrape it
- **browser ref missing** → take fresh browser_snapshot
- **Login required** → fill credentials if provided; otherwise stop and report what is needed

---

## OUTPUT FORMAT

Return a Markdown report with sections relevant to the task:

- **Summary**: Direct answer in 2–4 sentences.
- **Recommendation** (research): Best choice with rationale and tradeoffs.
- **Key findings**: Detailed technical facts — identifiers, endpoints, types, options, code examples.
- **Steps performed** (browser): Ordered list of actions taken.
- **Extracted data** (browser): Tables, lists, or structured content.
- **Screenshots** (browser): Base64 data URLs if screenshots were taken.
- **Sources read** (research): Every URL scraped with one sentence on its contribution.
- **Issues / blockers**: Failures, CAPTCHAs, paywalls, unverified claims.`;

// ── Message types ──────────────────────────────────────────────────────────────

type LibrarianProToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type LibrarianProMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: LibrarianProToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type FireworksNonStreamResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
};

// ── Fireworks call ─────────────────────────────────────────────────────────────

async function librarianProCall(
  messages: LibrarianProMessage[],
): Promise<{ content: string; toolCalls: LibrarianProToolCall[] }> {
  if (!process.env.FIREWORKS_API_KEY) throw new Error('FIREWORKS_API_KEY is not configured.');

  const res = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: LIBRARIAN_PRO_MODEL,
      messages,
      tools: INTERNAL_TOOLS,
      tool_choice: 'auto',
      max_tokens: 32768,
      temperature: 0.1,
      reasoning_effort: 'high',
    }),
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Librarian Pro AI error (${res.status}): ${text}`);
  }

  const json = await res.json() as FireworksNonStreamResponse;
  if (json.error?.message) throw new Error(`Librarian Pro AI error: ${json.error.message}`);

  const msg = json.choices?.[0]?.message;
  const rawContent = msg?.content ?? '';
  const reasoningContent = msg?.reasoning_content ?? '';
  const content = reasoningContent
    ? `<think>${reasoningContent}</think>${rawContent}`
    : rawContent;

  const toolCalls: LibrarianProToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id ?? crypto.randomUUID(),
    type: 'function',
    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
  }));

  return { content, toolCalls };
}

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}') as Record<string, unknown>; } catch { return {}; }
}

// ── Step label ─────────────────────────────────────────────────────────────────

function internalStepLabel(name: string, args: Record<string, unknown>): string {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '');
  const trim = (v: string, max = 50) => (v.length > max ? `${v.slice(0, max)}…` : v);

  switch (name) {
    case 'scrape_page':
      return `Scraping ${trim(s('url').replace(/^https?:\/\//, ''), 48)}`;
    case 'fetch_url':
      return `Fetching ${trim(s('url').replace(/^https?:\/\//, ''), 48)}`;
    case 'search_web':
      return s('query') ? `Searching "${trim(s('query'), 40)}"` : 'Searching web';
    case 'npm_package':
      return `Checking npm: ${trim(s('package_name'), 40)}`;
    case 'github_readme':
      return s('repo') ? `README: ${trim(`${s('owner')}/${s('repo')}`, 45)}` : 'Fetching README';
    case 'browser_navigate':
      return `Navigating to ${trim(s('url').replace(/^https?:\/\//, ''), 48)}`;
    case 'browser_snapshot':
      return args.full ? 'Snapshotting page (full)' : 'Snapshotting page';
    case 'browser_click':
      return `Clicking ${s('ref')}`;
    case 'browser_type':
      return `Typing into ${s('ref')}`;
    case 'browser_press':
      return `Pressing ${s('key')}`;
    case 'browser_scroll':
      return `Scrolling ${s('direction')}`;
    case 'browser_select':
      return `Selecting "${trim(s('value'), 30)}" in ${s('ref')}`;
    case 'browser_screenshot':
      return 'Taking screenshot';
    default:
      return name.replace(/_/g, ' ');
  }
}

// ── Step callback ──────────────────────────────────────────────────────────────

export type LibrarianProStepCallback = (
  event: 'start' | 'complete',
  stepLabel: string,
  error?: boolean,
) => void;

// ── Main subagent loop ─────────────────────────────────────────────────────────

export async function runLibrarianProSubagent(
  request: string,
  onStep?: LibrarianProStepCallback,
): Promise<string> {
  const session = new BrowserSession();
  let sessionOpened = false;

  const messages: LibrarianProMessage[] = [
    { role: 'system', content: LIBRARIAN_PRO_SYSTEM_PROMPT },
    { role: 'user', content: request },
  ];

  const recentBatchSigs: string[] = [];

  try {
    for (let i = 0; i < LIBRARIAN_PRO_MAX_ITERATIONS; i++) {
      const { content, toolCalls } = await librarianProCall(messages);

      if (!toolCalls.length) {
        return content || 'Librarian Pro completed the task with no further output.';
      }

      const batchSig = toolCalls
        .map(tc => `${tc.function.name}:${tc.function.arguments.slice(0, 300)}`)
        .join('|');
      recentBatchSigs.push(batchSig);
      if (recentBatchSigs.length > 3) recentBatchSigs.shift();

      if (recentBatchSigs.length === 3 && recentBatchSigs.every(s => s === batchSig)) {
        const last = messages.findLast(m => m.role === 'assistant');
        const partial = last && 'content' in last ? (last as { content: string }).content : '';
        return partial || 'Librarian Pro stopped: repeated identical actions detected without progress.';
      }

      messages.push({ role: 'assistant', content, tool_calls: toolCalls });

      for (const tc of toolCalls) {
        const args = parseArgs(tc.function.arguments);
        const label = internalStepLabel(tc.function.name, args);

        onStep?.('start', label);

        if (!sessionOpened && tc.function.name.startsWith('browser_')) {
          try {
            await session.open();
            sessionOpened = true;
          } catch (err) {
            const errMsg = `Failed to create browser session: ${(err as Error).message}. Is FIRECRAWL_API_KEY configured?`;
            onStep?.('complete', label, true);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: errMsg }) });
            continue;
          }
        }

        let toolResult: unknown;
        let hadError = false;

        try {
          toolResult = await runInternalTool(tc.function.name, args, session);
        } catch (err) {
          toolResult = { error: (err as Error).message };
          hadError = true;
        }

        onStep?.('complete', label, hadError);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
        });
      }
    }

    return 'Librarian Pro reached the maximum iteration limit without completing the task.';
  } finally {
    if (sessionOpened) await session.close();
  }
}

// ── Exports for route.ts ───────────────────────────────────────────────────────

export const callLibrarianProToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'call_librarian_pro',
    description:
      'Delegate research, documentation lookup, or live browser automation to Librarian Pro — ' +
      'a unified research and browser agent. ' +
      'For static research (library APIs, package versions, framework docs, changelogs, npm packages, GitHub READMEs), ' +
      'it scrapes documentation sites, searches the web, and synthesises evidence from primary sources. ' +
      'For live browser tasks (login-required pages, JS-rendered SPAs, web form automation, deployed site verification), ' +
      'it runs a persistent cloud browser via Playwright over CDP using accessibility trees. ' +
      'Replaces both call_librarian and call_browser_use — use this for ALL research and web interaction needs. ' +
      'Returns a structured Markdown report with evidence, steps, sources, and recommendations.',
    parameters: {
      type: 'object',
      required: ['request'],
      properties: {
        request: {
          type: 'string',
          description:
            'Full description of the research or browser task. For research: specify the library/framework, ' +
            'what you need to know, and any version constraints. ' +
            'For browser tasks: specify the starting URL (or keywords to search), the actions to perform, ' +
            'what data to extract, and the expected outcome.',
        },
      },
      additionalProperties: false,
    },
  },
};

export function isCallLibrarianProTool(name: string): boolean {
  return name === 'call_librarian_pro';
}
