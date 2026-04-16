/**
 * Browser Use Expert subagent — invoked exclusively by the main ONA but OPEN SOURCE AI via `call_browser_use`.
 *
 * Architecture (Hermes-inspired):
 *   Main AI ──call_browser_use──▶ runBrowserUseSubagent()
 *                                    └── creates Firecrawl CDP session (/v2/browser)
 *                                    └── connects Playwright over CDP
 *                                    └── own Fireworks agentic loop (up to 20 rounds)
 *                                    └── granular tools: navigate / snapshot / click / type / scroll / press / select / screenshot / search
 *                                    └── accessibility tree representation (no vision needed)
 *                                    └── closes CDP session when done
 *                                    └── returns synthesised report ──▶ Main AI
 *
 * Key difference from naive scrape approach:
 *   - PERSISTENT SESSION: one cloud browser session shared across all tool calls
 *     → enables login, multi-step forms, SPA navigation, cookie persistence
 *   - ACCESSIBILITY TREE: page represented as structured text with @eN ref IDs
 *     → works with any text model (no vision/computer-use model required)
 *   - GRANULAR TOOLS: separate navigate/snapshot/click/type tools like Hermes
 *     → precise iterative interaction instead of bundled single-shot scrape
 */

import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const BROWSER_USE_MODEL =
  process.env.FIREWORKS_BROWSER_MODEL ?? 'accounts/fireworks/models/kimi-k2-instruct-0905';
const BROWSER_USE_MAX_ITERATIONS = Infinity;
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev';
const FIRECRAWL_SESSION_TTL = Number(process.env.FIRECRAWL_BROWSER_TTL ?? '300');

// ── Accessibility tree snapshot ───────────────────────────────────────────────

interface AccessNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  children?: AccessNode[];
}

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option',
  'checkbox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'spinbutton', 'slider', 'switch', 'treeitem', 'gridcell',
]);

interface RefEntry {
  role: string;
  name: string;
}

function buildSnapshot(node: AccessNode, refMap: Map<string, RefEntry>, counter: { n: number }, depth = 0): string[] {
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

// ── Firecrawl CDP session lifecycle ──────────────────────────────────────────

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
  } catch {
    // best-effort cleanup
  }
}

// ── Browser session state ─────────────────────────────────────────────────────

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

    // Use accessibility.snapshot() — stable across Playwright versions
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
        `Available refs: ${[...this.refMap.keys()].map(k => `@${k}`).join(', ') || 'none'}`
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
        `Available refs: ${[...this.refMap.keys()].map(k => `@${k}`).join(', ') || 'none'}`
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

// ── Internal tool definitions ─────────────────────────────────────────────────

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
      name: 'browser_navigate',
      description:
        'Navigate to a URL in the cloud browser. Creates the browser session if not started. ' +
        'Returns a compact accessibility tree snapshot of the loaded page with interactive element ref IDs (like @e1, @e2). ' +
        'Use this first before any other browser tool. ' +
        'For simple content reading, prefer this over browser_snapshot — navigation already returns a snapshot.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Fully-qualified URL (https://...) to navigate to.' },
          wait_for: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'Navigation wait condition. Use "networkidle" for SPAs that fetch data after load (default: "load").',
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
        'Get the current page\'s accessibility tree as structured text with interactive element ref IDs (@e1, @e2, etc.). ' +
        'Call this after interactions (click, type, press) to see updated page state. ' +
        'full=false (default): compact view showing only interactive elements. ' +
        'full=true: complete content tree including text nodes. ' +
        'Ref IDs reset on each snapshot call — always use refs from the most recent snapshot.',
      parameters: {
        type: 'object',
        properties: {
          full: {
            type: 'boolean',
            description: 'If true, returns all page content. If false (default), returns interactive elements only.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description:
        'Click an interactive element using its ref ID from the most recent snapshot (e.g. "@e3"). ' +
        'Always call browser_snapshot first to get current refs. ' +
        'After clicking, call browser_snapshot again to see the updated page state.',
      parameters: {
        type: 'object',
        required: ['ref'],
        properties: {
          ref: { type: 'string', description: 'Element ref from snapshot, e.g. "@e5" or "@e12".' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description:
        'Type text into an input field or textarea using its ref ID from the most recent snapshot. ' +
        'Clears the field first by default. Use browser_press("Enter") after typing to submit forms.',
      parameters: {
        type: 'object',
        required: ['ref', 'text'],
        properties: {
          ref: { type: 'string', description: 'Input field ref from snapshot, e.g. "@e2".' },
          text: { type: 'string', description: 'Text to type into the field.' },
          clear: {
            type: 'boolean',
            description: 'Whether to clear the field before typing (default: true).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_press',
      description:
        'Press a keyboard key on the current page (e.g. "Enter", "Escape", "Tab", "ArrowDown"). ' +
        'Use "Enter" to submit forms after typing, "Escape" to dismiss dialogs.',
      parameters: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Key name: "Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Space", etc.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the page up or down. Use to reveal content below the fold, load lazy content, or reach elements not yet visible.',
      parameters: {
        type: 'object',
        required: ['direction'],
        properties: {
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction.' },
          amount: { type: 'number', description: 'Pixels to scroll (default: 500).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_select',
      description: 'Select an option from a <select> dropdown element using its ref ID.',
      parameters: {
        type: 'object',
        required: ['ref', 'value'],
        properties: {
          ref: { type: 'string', description: 'Dropdown element ref from snapshot.' },
          value: { type: 'string', description: 'The option value or label to select.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description:
        'Take a screenshot of the current browser viewport. Returns a base64-encoded PNG data URL. ' +
        'Use to visually confirm page state, debug unexpected layouts, or capture CAPTCHAs.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web via DuckDuckGo and return a ranked list of page titles, URLs, and snippets. ' +
        'Use this when you don\'t know the correct URL to navigate to. ' +
        'Follow up with browser_navigate on the best result.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query.' },
          max_results: { type: 'number', description: 'Number of results to return (default: 8, max: 20).' },
        },
        additionalProperties: false,
      },
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

const CURRENT_DATE = new Date().toISOString().slice(0, 10);

const BROWSER_USE_SYSTEM_PROMPT = `You are the **BROWSER USE EXPERT**, a specialist browser automation agent inside the ONA but OPEN SOURCE engineering system.

Your job: complete tasks requiring real web browser interaction using a persistent cloud-hosted browser session.

Today is ${CURRENT_DATE}.

---

## HOW THE BROWSER WORKS

You control a persistent cloud browser via Playwright over CDP. Pages are represented as **accessibility trees** — structured text with interactive element ref IDs like \`@e1\`, \`@e2\`. You do not see images or screenshots unless you explicitly call \`browser_screenshot\`.

**Ref IDs are regenerated on every \`browser_snapshot\` call.** Always use refs from the most recent snapshot.

---

## CORE WORKFLOW

### Step 1 — Navigate
Call \`browser_navigate(url)\` first. It returns a compact accessibility tree of the loaded page.

### Step 2 — Orient
Read the snapshot carefully:
- Interactive elements have \`[@eN]\` refs: \`[@e3] button "Sign in"\`, \`[@e1] textbox "Email"\`
- Use these refs for clicks and typing

### Step 3 — Interact iteratively
- \`browser_type(@eN, "text")\` to fill a field
- \`browser_press("Enter")\` to submit a form
- \`browser_click(@eN)\` to click a button or link
- After each interaction: call \`browser_snapshot\` to see the updated page

### Step 4 — Extract and report
Synthesise everything observed into a structured Markdown report.

---

## TOOL SELECTION GUIDE

| Situation | Tool |
|-----------|------|
| Don't know the URL | \`search_web\` first, then \`browser_navigate\` the best result |
| Load a page | \`browser_navigate(url)\` |
| See what's on the page | \`browser_snapshot\` |
| Click a button or link | \`browser_click(@eN)\` |
| Fill a text field | \`browser_type(@eN, "text")\` |
| Submit a form | \`browser_press("Enter")\` |
| Open a dropdown | \`browser_click(@eN)\` then \`browser_snapshot\` |
| Select dropdown option | \`browser_select(@eN, "value")\` |
| Content below the fold | \`browser_scroll("down")\` then \`browser_snapshot\` |
| Lazy-loaded SPA content | \`browser_navigate(url, "networkidle")\` |
| Dismiss a dialog | \`browser_press("Escape")\` |
| Confirm visual state | \`browser_screenshot\` |

---

## RULES

- **Never fabricate page content.** Only report what tool outputs actually showed.
- **Always take a snapshot after clicking or typing** to confirm the result.
- **Use search_web when unsure of a URL** — never guess URLs that might return 404.
- **If a ref is missing**: take a fresh \`browser_snapshot\` to get current refs.
- **Login required**: fill credentials if provided; otherwise report what credentials are needed and stop.
- **CAPTCHA blocked**: call \`browser_screenshot\` to document it; report clearly and stop.
- **Paywall**: stop immediately; note the paywall; do not attempt to bypass.

---

## OUTPUT FORMAT

Return a structured Markdown report with all applicable sections:

- **Summary**: Direct answer — what was accomplished or found (2–4 sentences).
- **Steps performed**: Ordered list of actions taken.
- **Extracted data**: Tables, lists, or structured content from the page.
- **Screenshots**: Include base64 data URLs if screenshots were taken.
- **Errors / blockers**: Any failures, CAPTCHAs, paywalls, or unexpected states.
- **Recommendations**: Suggested next steps if the task is incomplete.`;

// ── HTML utils ────────────────────────────────────────────────────────────────

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

// ── DuckDuckGo search ─────────────────────────────────────────────────────────

async function searchWeb(query: string, maxResults = 8): Promise<unknown> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ONA-but-OPEN-SOURCE-BrowserUse/1.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
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

// ── Internal tool executor ────────────────────────────────────────────────────

async function runInternalTool(
  name: string,
  args: Record<string, unknown>,
  session: BrowserSession,
): Promise<unknown> {
  switch (name) {
    case 'browser_navigate': {
      const url = String(args.url ?? '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('url must start with http:// or https://');
      }
      const waitFor = (['load', 'domcontentloaded', 'networkidle'] as const).includes(
        args.wait_for as 'load',
      )
        ? (args.wait_for as 'load' | 'domcontentloaded' | 'networkidle')
        : 'load';
      return await session.navigate(url, waitFor);
    }

    case 'browser_snapshot': {
      const full = Boolean(args.full);
      return await session.getSnapshot(full);
    }

    case 'browser_click': {
      const ref = String(args.ref ?? '');
      if (!ref) throw new Error('ref is required');
      return await session.clickRef(ref);
    }

    case 'browser_type': {
      const ref = String(args.ref ?? '');
      const text = String(args.text ?? '');
      if (!ref) throw new Error('ref is required');
      const clear = args.clear !== false;
      return await session.typeRef(ref, text, clear);
    }

    case 'browser_press': {
      const key = String(args.key ?? '');
      if (!key) throw new Error('key is required');
      return await session.press(key);
    }

    case 'browser_scroll': {
      const direction = args.direction === 'up' ? 'up' : 'down';
      const amount = typeof args.amount === 'number' ? args.amount : 500;
      return await session.scroll(direction, amount);
    }

    case 'browser_select': {
      const ref = String(args.ref ?? '');
      const value = String(args.value ?? '');
      if (!ref || !value) throw new Error('ref and value are required');
      return await session.select(ref, value);
    }

    case 'browser_screenshot': {
      const dataUrl = await session.screenshot();
      return { screenshot: dataUrl, note: 'Screenshot captured as base64 PNG data URL.' };
    }

    case 'search_web': {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('query is required');
      const maxResults = Math.min(Number(args.max_results ?? 8), 20);
      return await searchWeb(query, maxResults);
    }

    default:
      throw new Error(`Unknown browser use internal tool: ${name}`);
  }
}

// ── Internal message types ────────────────────────────────────────────────────

type BrowserUseToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type BrowserUseMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: BrowserUseToolCall[] }
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

// ── Fireworks call ────────────────────────────────────────────────────────────

async function browserUseCall(
  messages: BrowserUseMessage[],
): Promise<{ content: string; toolCalls: BrowserUseToolCall[] }> {
  if (!process.env.FIREWORKS_API_KEY) throw new Error('FIREWORKS_API_KEY is not configured.');

  const res = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: BROWSER_USE_MODEL,
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
    throw new Error(`Browser Use AI error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as FireworksNonStreamResponse;
  if (json.error?.message) throw new Error(`Browser Use AI error: ${json.error.message}`);

  const msg = json.choices?.[0]?.message;
  const content = msg?.content ?? '';
  const toolCalls: BrowserUseToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id ?? crypto.randomUUID(),
    type: 'function',
    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
  }));

  return { content, toolCalls };
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Step label ────────────────────────────────────────────────────────────────

function internalStepLabel(name: string, args: Record<string, unknown>): string {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '');
  const trim = (v: string, max = 50) => (v.length > max ? `${v.slice(0, max)}…` : v);

  switch (name) {
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
    case 'search_web':
      return s('query') ? `Searching "${trim(s('query'), 40)}"` : 'Searching web';
    default:
      return name.replace(/_/g, ' ');
  }
}

// ── Step callback ─────────────────────────────────────────────────────────────

export type BrowserUseStepCallback = (
  event: 'start' | 'complete',
  stepLabel: string,
  error?: boolean,
) => void;

// ── Main subagent loop ────────────────────────────────────────────────────────

/**
 * Run the full browser use subagent loop for a browser automation task.
 * Called by the main AI via the `call_browser_use` tool.
 *
 * Uses a persistent Firecrawl CDP session + Playwright for stateful browser automation.
 * Accessibility trees (not screenshots) drive all page understanding — no vision model needed.
 */
export async function runBrowserUseSubagent(
  task: string,
  onStep?: BrowserUseStepCallback,
): Promise<string> {
  const session = new BrowserSession();
  let sessionOpened = false;

  const messages: BrowserUseMessage[] = [
    { role: 'system', content: BROWSER_USE_SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];

  // Loop detection: fingerprint each tool-call batch.
  // If the last 3 batches are identical, the agent is stuck — stop and return.
  const recentBatchSigs: string[] = [];

  try {
    for (let i = 0; i < BROWSER_USE_MAX_ITERATIONS; i++) {
      const { content, toolCalls } = await browserUseCall(messages);

      if (!toolCalls.length) {
        return content || 'The browser use expert completed the task with no further output.';
      }

      const batchSig = toolCalls
        .map(tc => `${tc.function.name}:${tc.function.arguments.slice(0, 300)}`)
        .join('|');
      recentBatchSigs.push(batchSig);
      if (recentBatchSigs.length > 3) recentBatchSigs.shift();

      if (recentBatchSigs.length === 3 && recentBatchSigs.every(s => s === batchSig)) {
        const last = messages.findLast(m => m.role === 'assistant');
        const partial = last && 'content' in last ? (last as { content: string }).content : '';
        return partial || 'Browser automation stopped: repeated identical actions detected without progress. Please check the task description or provide updated instructions.';
      }

      // Add assistant message with tool calls
      messages.push({ role: 'assistant', content, tool_calls: toolCalls });

      // Execute all tool calls (usually sequential; AI rarely batches browser calls)
      for (const tc of toolCalls) {
        const args = parseArgs(tc.function.arguments);
        const label = internalStepLabel(tc.function.name, args);

        onStep?.('start', label);

        // Open the CDP session on first browser tool call
        if (!sessionOpened && tc.function.name.startsWith('browser_')) {
          try {
            await session.open();
            sessionOpened = true;
          } catch (err) {
            const errMsg = `Failed to create Firecrawl browser session: ${(err as Error).message}. ` +
              'Is FIRECRAWL_API_KEY configured?';
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

    return 'Browser Use Expert reached the maximum iteration limit without completing the task.';
  } finally {
    await session.close();
  }
}

// ── Exports for main route.ts ─────────────────────────────────────────────────

export const callBrowserUseToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'call_browser_use',
    description:
      'Delegate a browser automation task to the Browser Use Expert subagent. ' +
      'The expert operates a real cloud-hosted browser via a persistent CDP session, ' +
      'reads pages as accessibility trees (no vision needed), and can navigate, click, ' +
      'fill forms, scroll, extract data, and take screenshots. ' +
      'Returns a structured Markdown report of what was accomplished. ' +
      'Use for: checking live sites, filling web forms, extracting JS-rendered content, ' +
      'verifying deployed features, multi-step web workflows. ' +
      'Do NOT use for static documentation research — use call_librarian instead.',
    parameters: {
      type: 'object',
      required: ['task'],
      properties: {
        task: {
          type: 'string',
          description:
            'Detailed description of the browser task to complete. Include: ' +
            'the starting URL (or keywords to search for it), what actions to perform, ' +
            'what data to extract, and what the expected outcome is.',
        },
      },
      additionalProperties: false,
    },
  },
};

export function isCallBrowserUseTool(name: string): boolean {
  return name === 'call_browser_use';
}
