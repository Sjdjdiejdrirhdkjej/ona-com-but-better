import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

type IIndexProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: IIndexProps) {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Index' });
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
const CREAM = '#f2ede3';
const CREAM_BORDER = 'rgba(0,0,0,0.09)';

const featureCards = [
  {
    tag: 'Background agents',
    title: 'Task in, pull request out.',
    body: 'ONA executes end-to-end in the background. Keep momentum from any device.',
    cta: 'See how agents work',
  },
  {
    tag: 'Automations',
    title: 'Agent fleets at scale.',
    body: 'Trigger repeatable workflows from pull requests, schedules, webhooks, or backlog systems, then review the PRs when they are ready.',
    cta: 'Explore automations',
  },
  {
    tag: 'Connected environments',
    title: 'More than a sandbox.',
    body: 'Each agent gets a full cloud environment with your tools, network access, and permissions.',
    cta: 'Explore environments',
  },
  {
    tag: 'Governance with guarantees',
    title: 'Runs in your VPC.',
    body: 'Complete network control with audit trails, scoped credentials, command policies, and explicit least-privilege access.',
    cta: 'Learn about governance',
  },
];

const automationSteps = [
  {
    step: '01',
    title: 'Trigger',
    body: 'Start agents from PRs, schedules, webhooks, Slack-style prompts, or plain-language filters over your issue tracker.',
  },
  {
    step: '02',
    title: 'Execute',
    body: 'Each task gets an isolated cloud VM with the repo, dependencies, tests, tools, network access, and scoped secrets.',
  },
  {
    step: '03',
    title: 'Report',
    body: 'Agents return linked PRs, test results, failures, cost signals, and a durable audit trail for review.',
  },
];

const integrationCards = [
  {
    title: 'Backlog and planning',
    body: 'Pull well-scoped work from Linear, Notion, Jira, and Atlassian-style systems, then turn tickets into branches and PRs.',
    items: ['Linear', 'Notion', 'Atlassian'],
  },
  {
    title: 'Code and delivery',
    body: 'Clone, branch, build, test, commit, push, and open reviewable pull requests across GitHub or GitLab repositories.',
    items: ['GitHub', 'GitLab', 'CI'],
  },
  {
    title: 'Incidents and security',
    body: 'Triage production bugs and dependency risk from issue streams, scanners, and internal tools before engineers start their day.',
    items: ['Sentry', 'CVE scanners', 'MCP'],
  },
];

const platformCapabilities = [
  'Human takeover: open the same environment, redirect the work, or finish the task yourself.',
  'Reusable skills and AGENTS.md conventions keep agents aligned with team standards.',
  'Model routing balances accuracy, speed, and cost as frontier models change.',
  'Team-level cost controls and usage visibility prevent surprise agent sprawl.',
];

const useCases = [
  {
    title: 'Code migration & modernization',
    body: 'Migrate hundreds of repos in parallel — COBOL, Java & framework upgrades, CI pipelines. ONA does the work. You review the PRs.',
    cta: 'Learn more about code migration',
  },
  {
    title: 'AI code review',
    body: "ONA doesn't just scan patterns — it compiles, runs tests, and reviews in a real environment.",
    cta: 'Learn more about code review',
  },
  {
    title: 'Automated CVE remediation',
    body: 'Remediates what your scanner finds — across hundreds of repos, in isolated environments. Tested, with PRs ready for review.',
    cta: 'Learn more about CVE remediation',
  },
  {
    title: 'Backlog and bug triage',
    body: 'Pick up well-scoped backlog tickets, triage Sentry-style issues, reproduce failures, ship fixes, and leave a linked report.',
    cta: 'Learn more about backlog automation',
  },
  {
    title: 'Docs drift and dead-code cleanup',
    body: 'Run deterministic scripts with AI judgment to update docs, remove unused code, and keep repositories ready for other agents.',
    cta: 'Learn more about maintenance agents',
  },
];

const blogPosts = [
  {
    tag: 'Security',
    date: 'March 3, 2026',
    author: 'Leonardo Di Donato',
    title: 'How AI agents escape their own denylist and sandbox',
    body: "The adversary can reason now, and our security tools weren't built for that.",
  },
  {
    tag: 'AI',
    date: 'February 19, 2026',
    author: 'Johannes Landgraf',
    title: 'ONA Automations: proactive background agents',
    body: 'Background agents that write, test, and ship code on a schedule.',
  },
  {
    tag: 'AI',
    date: 'February 13, 2026',
    author: 'Johannes Landgraf',
    title: 'The last year of localhost',
    body: "The companies winning with background agents didn't start with better models.",
  },
];

function MonoLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 sm:mb-5 sm:text-[11px] sm:tracking-[0.28em]" style={{ fontFamily: MONO }}>
      {children}
    </p>
  );
}

function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-60" style={{ fontFamily: MONO }}>
      {children}
      <span>→</span>
    </Link>
  );
}

export default async function Index(props: IIndexProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ backgroundColor: CREAM, color: '#1a1a18' }}>

      {/* ── Hero ── */}
      <section className="relative flex min-h-[92svh] flex-col border-b" style={{ borderColor: CREAM_BORDER }}>
        {/* Left vertical accent bar */}
        <div className="absolute bottom-0 left-0 top-0 hidden w-[5px] md:block" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.06) 30%, rgba(0,0,0,0.06) 70%, transparent 100%)' }} />

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col border-x px-6 pb-16 pt-24 sm:px-8 sm:pt-28 md:flex-row md:items-center md:gap-16 md:pt-20" style={{ borderColor: CREAM_BORDER }}>
          {/* Left column: headline */}
          <div className="flex-1">
            <h1
              className="text-[clamp(3rem,12vw,8.5rem)] leading-[0.88] tracking-[-0.06em] text-neutral-950"
              style={{ fontFamily: SERIF, fontWeight: 400 }}
            >
              <span className="block italic tracking-[-0.075em]">Engineered</span>
              <span className="block">For The Agents</span>
            </h1>

            <div className="mt-10 max-w-lg space-y-2">
              <p className="text-lg leading-snug tracking-[-0.02em] text-neutral-700 sm:text-xl">
                ONA is the open-source platform for background AI software agents.
              </p>
              <p className="text-sm text-neutral-500">
                Free to start. No setup required.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-sm bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
              >
                Get Started for Free
                <span>→</span>
              </Link>
              <Link
                href="/about/"
                className="inline-flex items-center gap-2 rounded-sm border px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
                style={{ borderColor: CREAM_BORDER }}
              >
                Request a demo
              </Link>
            </div>
          </div>

          {/* Right column: terminal mockup */}
          <div className="mt-14 w-full max-w-xl shrink-0 md:mt-0 md:w-[46%]">
            <div
              className="relative overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
              style={{ backgroundColor: '#1a1c1a', borderRadius: 2 }}
            >
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-3">
                <span className="size-3 rounded-full bg-red-500/70" />
                <span className="size-3 rounded-full bg-yellow-400/70" />
                <span className="size-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-[11px] text-white/30" style={{ fontFamily: MONO }}>ona — background agent</span>
              </div>

              {/* Terminal content */}
              <div className="p-5 sm:p-7">
                {/* ASCII art */}
                <pre className="mb-6 select-none text-center text-[9px] leading-[1.1] text-emerald-500/60 sm:text-[10px]" style={{ fontFamily: MONO }}>
                  {`      ..............      
   ..::::::::::::::..   
  .::::----++----::::.  
 .:::--+++****+++--:::. 
 .:::--+++****+++--:::. 
  .::::----++----::::.  
   ..::::::::::::::..   
      ..............      `}
                </pre>

                {/* Chat lines */}
                <div className="space-y-3 text-xs" style={{ fontFamily: MONO }}>
                  <p className="text-white/35">Welcome to ONA but OPEN SOURCE</p>
                  <div className="border-l-2 border-emerald-500/50 pl-3">
                    <p className="text-emerald-400">user</p>
                    <p className="mt-0.5 text-[#d8d6b8]/80">Find all open PRs blocking the v2 release and summarize blockers.</p>
                  </div>
                  <div className="border-l-2 border-white/20 pl-3">
                    <p className="text-white/40">agent</p>
                    <p className="mt-0.5 text-[#d8d6b8]/70">Scanning GitHub... found 4 open PRs. Analyzing CI failures and merge conflicts.</p>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400/80">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    <span>Working in background...</span>
                  </div>
                </div>

                {/* Bottom status */}
                <div className="mt-6 flex items-center justify-between border-t border-white/8 pt-4 text-[10px] text-white/30" style={{ fontFamily: MONO }}>
                  <span className="text-emerald-400/60">▸ ona-hands-off</span>
                  <span>27% of 168k tokens</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Available in your browser (like ampcode's "Install" section) ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 border-x md:grid-cols-2" style={{ borderColor: CREAM_BORDER }}>
          {/* Left */}
          <div className="border-b px-6 py-10 md:border-b-0 md:border-r md:px-8 md:py-14" style={{ borderColor: CREAM_BORDER }}>
            <MonoLabel>Open source · Self-hostable</MonoLabel>
            <h2 className="max-w-xs text-4xl leading-[0.92] tracking-[-0.06em] text-neutral-950 sm:text-5xl sm:leading-[0.9]" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              Available in your browser
            </h2>
          </div>

          {/* Right: start command */}
          <div className="flex flex-col justify-center px-6 py-10 md:px-8 md:py-14">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-neutral-400" style={{ fontFamily: MONO }}>
              Open the app
            </p>
            <div className="flex items-center gap-2 rounded-sm border bg-white/60 px-4 py-3" style={{ borderColor: CREAM_BORDER }}>
              <code className="flex-1 truncate text-sm text-neutral-700" style={{ fontFamily: MONO }}>
                /dashboard → start your first task
              </code>
              <Link
                href="/dashboard"
                className="shrink-0 rounded-sm bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
              >
                Open →
              </Link>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Or clone and self-host — Apache 2.0 licensed.
            </p>
          </div>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <div className="grid border md:grid-cols-2" style={{ borderColor: CREAM_BORDER }}>
            {featureCards.map((item, i) => (
              <div
                key={item.tag}
                className="min-h-60 border-b p-6 last:border-b-0 sm:min-h-72 sm:p-8 md:border-r md:border-b md:even:border-r-0"
                style={{ borderColor: CREAM_BORDER, backgroundColor: i % 2 === 1 ? 'rgba(255,255,255,0.25)' : 'transparent' }}
              >
                <p className="mb-8 text-[10px] uppercase tracking-[0.22em] text-neutral-500 sm:mb-12 sm:text-[11px]" style={{ fontFamily: MONO }}>
                  {item.tag}
                </p>
                <h3 className="max-w-sm text-3xl leading-[0.92] tracking-[-0.055em] text-neutral-950 sm:text-4xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {item.title}
                </h3>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-neutral-600">{item.body}</p>
                <div className="mt-8">
                  <ArrowLink href="/about/">{item.cta}</ArrowLink>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How automations run (3-step) ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <MonoLabel>How automations run</MonoLabel>
              <h2 className="max-w-sm text-4xl leading-[0.92] tracking-[-0.06em] text-neutral-950 sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                Closed-loop work, not chat-only assistance.
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-600">
                Trigger, execute, and report — proactive background agents that combine prompts with deterministic commands.
              </p>
            </div>
            <div className="lg:col-span-8">
              <div className="grid border md:grid-cols-3" style={{ borderColor: CREAM_BORDER }}>
                {automationSteps.map(item => (
                  <div
                    key={item.step}
                    className="min-h-56 border-b p-6 last:border-b-0 sm:p-8 md:min-h-80 md:border-b-0 md:border-r md:last:border-r-0"
                    style={{ borderColor: CREAM_BORDER }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-400" style={{ fontFamily: MONO }}>{item.step}</p>
                    <h3 className="mt-8 text-3xl leading-[0.92] tracking-[-0.055em] text-neutral-950 sm:mt-14 sm:text-4xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                      {item.title}
                    </h3>
                    <p className="mt-5 text-sm leading-relaxed text-neutral-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <MonoLabel>Native context</MonoLabel>
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <h2 className="text-4xl leading-[0.92] tracking-[-0.06em] text-neutral-950 sm:text-5xl lg:col-span-5" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              Connect agents to the systems engineers already use.
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-neutral-600 lg:col-span-7">
              Native integrations for planning, code, incidents, and internal tools. Agents get context where they need it and deliver work where it belongs.
            </p>
          </div>
          <div className="mt-10 grid border md:grid-cols-3" style={{ borderColor: CREAM_BORDER }}>
            {integrationCards.map(card => (
              <div key={card.title} className="border-b p-6 last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:last:border-r-0" style={{ borderColor: CREAM_BORDER }}>
                <h3 className="text-2xl leading-[0.94] tracking-[-0.045em] text-neutral-950 sm:text-3xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {card.title}
                </h3>
                <p className="mt-5 text-sm leading-relaxed text-neutral-600">{card.body}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {card.items.map(item => (
                    <span key={item} className="border px-3 py-1.5 text-xs text-neutral-500" style={{ borderColor: CREAM_BORDER, fontFamily: MONO }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <MonoLabel>Use cases</MonoLabel>
          <div className="divide-y" style={{ borderColor: CREAM_BORDER }}>
            {useCases.map(item => (
              <div key={item.title} className="grid gap-5 py-8 md:grid-cols-12 md:items-start">
                <h3 className="text-2xl leading-[0.94] tracking-[-0.045em] text-neutral-950 sm:text-3xl md:col-span-4" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {item.title}
                </h3>
                <p className="max-w-2xl text-base leading-relaxed text-neutral-600 md:col-span-5">{item.body}</p>
                <div className="md:col-span-3 md:text-right">
                  <ArrowLink href="/about/">{item.cta}</ArrowLink>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonial / stats (dark section like ampcode's dark block) ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-12" style={{ backgroundColor: '#1a1c1a', color: '#f0efd9' }}>
            <div className="lg:col-span-7">
              <p className="mb-8 text-[11px] uppercase tracking-[0.28em] text-[#d8d6b8]/50" style={{ fontFamily: MONO }}>
                Top 100 global company
              </p>
              <blockquote className="text-3xl leading-[0.98] tracking-[-0.055em] sm:text-5xl sm:leading-[0.95]" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                "90–95% of migration work is done by ONA Automations. We just have to do the final push commands."
              </blockquote>
              <div className="mt-8">
                <Link href="/about/" className="text-sm font-medium text-[#f0efd9] transition-opacity hover:opacity-60" style={{ fontFamily: MONO }}>
                  Read more customer stories →
                </Link>
              </div>
            </div>
            <div className="grid gap-5 lg:col-span-5 lg:border-l lg:pl-8" style={{ borderColor: '#d8d6b8/20' }}>
              {[
                { stat: '4x', label: 'productivity increase' },
                { stat: '83%', label: 'of PRs co-authored by ONA' },
                { stat: '400+', label: 'Python repos modernized in 6 months' },
              ].map(item => (
                <div key={item.stat} className="border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: 'rgba(216,214,184,0.2)' }}>
                  <p className="text-5xl leading-none tracking-[-0.08em] sm:text-6xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                    {item.stat}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'rgba(216,214,184,0.65)' }}>{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Governance ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <div className="grid gap-8 border p-6 sm:p-8 md:grid-cols-12 md:items-center" style={{ borderColor: CREAM_BORDER }}>
            <div className="md:col-span-7">
              <h2 className="text-4xl leading-[0.92] tracking-[-0.06em] text-neutral-950 sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                Governed from the runtime up.
              </h2>
              <p className="mt-4 text-base text-neutral-600">
                Audit every human and AI action, scope every credential, and keep background agents inside approved environments.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-5 md:justify-end">
              {['SOC 2', 'RBAC', 'Audit trails', 'Cost caps'].map(badge => (
                <div key={badge} className="border px-4 py-2 text-sm font-medium text-neutral-700" style={{ borderColor: CREAM_BORDER, fontFamily: MONO }}>
                  {badge}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform capabilities (dark section) ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <div className="grid gap-8 bg-neutral-950 p-6 text-neutral-50 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="mb-8 text-[11px] uppercase tracking-[0.28em] text-neutral-500" style={{ fontFamily: MONO }}>
                Operating model
              </p>
              <h2 className="text-4xl leading-[0.92] tracking-[-0.06em] sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                Autonomous when you want it. Takeover when you need it.
              </h2>
            </div>
            <div className="grid gap-4 lg:col-span-7">
              {platformCapabilities.map(item => (
                <div key={item} className="border-t border-white/10 pt-4 text-sm leading-relaxed text-neutral-400 first:border-t-0 first:pt-0">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Blog / recent highlights ── */}
      <section className="border-b" style={{ borderColor: CREAM_BORDER }}>
        <div className="mx-auto max-w-7xl border-x px-6 py-10 sm:px-8 sm:py-14" style={{ borderColor: CREAM_BORDER }}>
          <MonoLabel>Chronicle</MonoLabel>
          <h2 className="mb-8 max-w-2xl text-4xl leading-[0.92] tracking-[-0.06em] text-neutral-950 sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
            Recent highlights
          </h2>
          <div className="grid border md:grid-cols-3" style={{ borderColor: CREAM_BORDER }}>
            {blogPosts.map(post => (
              <Link
                key={post.title}
                href="/about/"
                className="flex min-h-80 flex-col justify-between border-b p-6 transition-colors last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:last:border-r-0"
                style={{ borderColor: CREAM_BORDER }}
              >
                <div>
                  <div className="mb-10 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400" style={{ fontFamily: MONO }}>
                    <span>{post.tag}</span>
                    <span>{post.date}</span>
                  </div>
                  <h3 className="text-3xl leading-[0.92] tracking-[-0.05em] text-neutral-950" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                    {post.title}
                  </h3>
                  <p className="mt-5 text-sm leading-relaxed text-neutral-600">{post.body}</p>
                </div>
                <p className="mt-8 text-xs text-neutral-400" style={{ fontFamily: MONO }}>{post.author}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section>
        <div className="mx-auto max-w-7xl border-x px-6 py-20 text-center sm:px-8 sm:py-28" style={{ borderColor: CREAM_BORDER }}>
          <h2
            className="mx-auto max-w-4xl text-[clamp(2.5rem,11vw,7.5rem)] leading-[0.9] tracking-[-0.075em] text-neutral-950"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            <span className="block italic">Start shipping</span>
            <span className="block">with ONA</span>
          </h2>
          <p className="mx-auto mt-8 max-w-sm text-lg text-neutral-600">No commitment. No setup. Just start.</p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
            >
              Get Started for Free
              <span>→</span>
            </Link>
            <Link
              href="/about/"
              className="inline-flex justify-center rounded-sm border px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
              style={{ borderColor: CREAM_BORDER }}
            >
              Request a demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
