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

const featureCards = [
  {
    tag: 'Background agents',
    title: 'Task in, pull request out.',
    body: 'ONA but OPEN SOURCE executes end-to-end in the background. Keep momentum from any device.',
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
    body: 'Migrate hundreds of repos in parallel — COBOL, Java & framework upgrades, CI pipelines. ONA but OPEN SOURCE does the work. You review the PRs.',
    cta: 'Learn more about code migration',
  },
  {
    title: 'AI code review',
    body: "ONA but OPEN SOURCE doesn't just scan patterns — it compiles, runs tests, and reviews in a real environment.",
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
    title: 'How Claude Code escapes its own denylist and sandbox',
    body: "The adversary can reason now, and our security tools weren't built for that.",
  },
  {
    tag: 'AI',
    date: 'February 19, 2026',
    author: 'Johannes Landgraf',
    title: 'ONA but OPEN SOURCE Automations: proactive background agents',
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 text-[11px] uppercase tracking-[0.28em] text-neutral-800 dark:text-neutral-300" style={{ fontFamily: MONO }}>
      {children}
    </p>
  );
}

function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-70 dark:text-neutral-100">
      {children}
      <span>→</span>
    </Link>
  );
}

export default async function Index(props: IIndexProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div className="amp-grid min-h-screen text-neutral-950 dark:text-neutral-100">
      <section className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-7xl grid-cols-1 border-x border-black/8 px-6 pb-12 pt-16 dark:border-white/10 sm:px-8 md:grid-cols-12 md:items-center md:gap-8 md:pt-10">
        <div className="md:col-span-8 md:col-start-4">
          <h1
            className="max-w-5xl text-[clamp(3.8rem,9vw,9rem)] leading-[0.82] tracking-[-0.075em] text-neutral-950 dark:text-neutral-50"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            <span className="block italic tracking-[-0.085em]">The platform for</span>
            <span className="block">background agents</span>
          </h1>
          <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,26rem)_auto] md:items-start">
            <p className="max-w-xl text-xl leading-snug tracking-[-0.03em] text-neutral-900 dark:text-neutral-200 sm:text-2xl">
              Run a team of AI software engineers in the cloud.
              <br className="hidden sm:block" />
              {' '}
              Orchestrated, governed, secured at the kernel.
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row md:pt-1">
              <Link
                href="/app"
                className="inline-flex rounded-[4px] bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-950"
              >
                Start for free
              </Link>
              <Link
                href="/about/"
                className="inline-flex rounded-[4px] border border-black/20 px-5 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:border-black/60 dark:border-white/25 dark:text-neutral-100 dark:hover:border-white/70"
              >
                Request a demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-3">
          <SectionLabel>Background Agents virtual summit. RSVP now</SectionLabel>
          <h2 className="max-w-xs text-4xl leading-[0.9] tracking-[-0.06em] sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
            The AI engineering workforce.
          </h2>
        </div>
        <div className="mt-10 lg:col-span-6 lg:mt-0">
          <div className="relative min-h-[360px] overflow-hidden bg-[#20211f] p-5 text-[#d8d6b8] shadow-[0_20px_80px_rgba(0,0,0,0.18)] sm:min-h-[460px] sm:p-8">
            <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(18,180,95,0.8) 0 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
            <div className="relative grid min-h-[300px] place-items-center sm:min-h-[380px]">
              <pre className="select-none text-center text-[10px] leading-[1.05] text-emerald-500/80 sm:text-xs" style={{ fontFamily: MONO }}>
                {`           ..............           
       ....::::::::::::....       
    ...:::::----------:::::...    
  ..::::----++++++++----::::..  
 ..:::---+++++****+++++---:::.. 
 ..:::---+++++****+++++---:::.. 
  ..::::----++++++++----::::..  
    ...:::::----------:::::...    
       ....::::::::::::....       
           ..............           `}
              </pre>
              <div className="absolute right-6 top-8 space-y-8 text-xs sm:right-10 sm:top-16" style={{ fontFamily: MONO }}>
                <p><span className="text-emerald-400">Weekly digest</span></p>
                <p className="text-neutral-500">Implement prompts API</p>
                <p className="text-neutral-500">Add command palette</p>
              </div>
              <div className="absolute bottom-5 left-3 right-3 border border-[#d8d6b8]/70 bg-[#20211f]/95 p-3 sm:bottom-8 sm:left-5 sm:right-5 sm:p-4">
                <p className="text-xs text-emerald-400" style={{ fontFamily: MONO }}>Background agents</p>
                <p className="mt-1 text-sm text-[#f0efd9] sm:text-base" style={{ fontFamily: MONO }}>Task in, pull request out.</p>
                <p className="mt-5 text-right text-xs text-[#d8d6b8]/60" style={{ fontFamily: MONO }}>27% of 168k</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col justify-center lg:col-span-3 lg:mt-0">
          <SectionLabel>Start for free</SectionLabel>
          <p className="max-w-sm text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            Set the direction. ONA but OPEN SOURCE runs the execution. Continuously and autonomously.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {['Since 2025', 'Since 2024', 'Since 2026', 'Since 2024', 'Since 2023', 'Since 2024'].map((label, index) => (
              <span key={`${label}-${index}`} className="border border-black/12 px-3 py-1.5 text-xs text-neutral-600 dark:border-white/15 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <div className="grid border border-black/8 bg-black/8 dark:border-white/10 dark:bg-white/10 md:grid-cols-2">
          {featureCards.map(item => (
            <div key={item.tag} className="min-h-72 border-black/8 bg-[var(--bg)] p-6 dark:border-white/10 sm:p-8 md:border-r md:border-b md:even:border-r-0">
              <p className="mb-12 text-[11px] uppercase tracking-[0.28em] text-neutral-600 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                {item.tag}
              </p>
              <h3 className="max-w-sm text-4xl leading-[0.9] tracking-[-0.06em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                {item.title}
              </h3>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{item.body}</p>
              <div className="mt-8">
                <ArrowLink href="/about/">{item.cta}</ArrowLink>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>How automations run</SectionLabel>
            <h2 className="max-w-sm text-5xl leading-[0.9] tracking-[-0.07em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              Closed-loop work, not chat-only assistance.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              Ona.com emphasizes proactive background agents that combine prompts with deterministic commands. This app now surfaces that same workflow: trigger, execute, report.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div className="grid border border-black/8 dark:border-white/10 md:grid-cols-3">
              {automationSteps.map(item => (
                <div key={item.step} className="min-h-80 border-b border-black/8 p-6 last:border-b-0 dark:border-white/10 md:border-b-0 md:border-r md:last:border-r-0 sm:p-8">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>{item.step}</p>
                  <h3 className="mt-14 text-4xl leading-[0.9] tracking-[-0.06em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                    {item.title}
                  </h3>
                  <p className="mt-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <SectionLabel>Native context</SectionLabel>
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <h2 className="text-5xl leading-[0.9] tracking-[-0.07em] text-neutral-950 dark:text-neutral-50 lg:col-span-5" style={{ fontFamily: SERIF, fontWeight: 400 }}>
            Connect agents to the systems engineers already use.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 lg:col-span-7">
            Ona.com highlights native integrations for planning, code, incidents, and internal tools. The open-source version now makes those missing categories explicit so teams understand where agents get context and where they deliver work.
          </p>
        </div>
        <div className="mt-10 grid border border-black/8 dark:border-white/10 md:grid-cols-3">
          {integrationCards.map(card => (
            <div key={card.title} className="border-b border-black/8 p-6 last:border-b-0 dark:border-white/10 md:border-b-0 md:border-r md:last:border-r-0 sm:p-8">
              <h3 className="text-3xl leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                {card.title}
              </h3>
              <p className="mt-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{card.body}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {card.items.map(item => (
                  <span key={item} className="border border-black/12 px-3 py-1.5 text-xs text-neutral-600 dark:border-white/15 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <SectionLabel>Use cases</SectionLabel>
        <div className="divide-y divide-black/8 border-y border-black/8 dark:divide-white/10 dark:border-white/10">
          {useCases.map(item => (
            <div key={item.title} className="grid gap-5 py-8 md:grid-cols-12 md:items-start">
              <h3 className="text-3xl leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50 md:col-span-4" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                {item.title}
              </h3>
              <p className="max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:col-span-5">{item.body}</p>
              <div className="md:col-span-3 md:text-right">
                <ArrowLink href="/about/">{item.cta}</ArrowLink>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <div className="grid gap-8 bg-[#20211f] p-6 text-[#f0efd9] sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="mb-8 text-[11px] uppercase tracking-[0.28em] text-[#d8d6b8]/60" style={{ fontFamily: MONO }}>
              Top 100 global company
            </p>
            <blockquote className="text-4xl leading-[0.95] tracking-[-0.06em] sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              "90–95% of migration work is done by ONA but OPEN SOURCE Automations. We just have to do the final push commands."
            </blockquote>
            <div className="mt-8">
              <Link href="/about/" className="text-sm font-medium text-[#f0efd9] transition-opacity hover:opacity-70">
                Read more customer stories →
              </Link>
            </div>
          </div>
          <div className="grid gap-5 lg:col-span-5 lg:border-l lg:border-[#d8d6b8]/20 lg:pl-8">
            {[
              { stat: '4x', label: 'productivity increase' },
              { stat: '83%', label: 'of PRs co-authored by ONA but OPEN SOURCE' },
              { stat: '400+', label: 'Python repos modernized in 6 months' },
            ].map(item => (
              <div key={item.stat} className="border-t border-[#d8d6b8]/20 pt-5 first:border-t-0 first:pt-0">
                <p className="text-6xl leading-none tracking-[-0.08em]" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {item.stat}
                </p>
                <p className="mt-1 text-sm text-[#d8d6b8]/70">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <div className="grid gap-8 border border-black/8 p-6 dark:border-white/10 sm:p-8 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <h2 className="text-5xl leading-[0.9] tracking-[-0.07em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              Governed from the runtime up.
            </h2>
            <p className="mt-4 text-base text-neutral-700 dark:text-neutral-300">
              Audit every human and AI action, scope every credential, and keep background agents inside approved environments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-5 md:justify-end">
            {['SOC 2', 'RBAC', 'Audit trails', 'Cost caps'].map(badge => (
              <div key={badge} className="border border-black/12 px-4 py-2 text-sm font-medium text-neutral-800 dark:border-white/15 dark:text-neutral-300" style={{ fontFamily: MONO }}>
                {badge}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <div className="grid gap-8 bg-neutral-950 p-6 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-950 sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="mb-8 text-[11px] uppercase tracking-[0.28em] text-neutral-400 dark:text-neutral-500" style={{ fontFamily: MONO }}>
              Operating model
            </p>
            <h2 className="text-5xl leading-[0.9] tracking-[-0.07em]" style={{ fontFamily: SERIF, fontWeight: 400 }}>
              Autonomous when you want it. Takeover when you need it.
            </h2>
          </div>
          <div className="grid gap-4 lg:col-span-7">
            {platformCapabilities.map(item => (
              <div key={item} className="border-t border-white/15 pt-4 text-sm leading-relaxed text-neutral-300 first:border-t-0 first:pt-0 dark:border-black/15 dark:text-neutral-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-14 dark:border-white/10 sm:px-8">
        <h2 className="mb-8 max-w-2xl text-5xl leading-[0.9] tracking-[-0.07em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
          Recent highlights from our blog
        </h2>
        <div className="grid border border-black/8 dark:border-white/10 md:grid-cols-3">
          {blogPosts.map(post => (
            <Link key={post.title} href="/about/" className="flex min-h-80 flex-col justify-between border-b border-black/8 p-6 transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04] md:border-b-0 md:border-r md:last:border-r-0 sm:p-8">
              <div>
                <div className="mb-10 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                  <span>{post.tag}</span>
                  <span>{post.date}</span>
                </div>
                <h3 className="text-3xl leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {post.title}
                </h3>
                <p className="mt-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{post.body}</p>
              </div>
              <p className="mt-8 text-xs text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>{post.author}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-t border-black/8 px-6 py-20 text-center dark:border-white/10 sm:px-8">
        <h2 className="mx-auto max-w-4xl text-[clamp(3.6rem,10vw,8.5rem)] leading-[0.78] tracking-[-0.08em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
          Start shipping with ONA but OPEN SOURCE
        </h2>
        <p className="mx-auto mt-8 max-w-md text-lg text-neutral-700 dark:text-neutral-300">No commitment. No setup. Just start.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/app"
            className="inline-flex rounded-[4px] bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-950"
          >
            Start for free
          </Link>
          <Link
            href="/about/"
            className="inline-flex rounded-[4px] border border-black/20 px-5 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:border-black/60 dark:border-white/25 dark:text-neutral-100 dark:hover:border-white/70"
          >
            Request a demo
          </Link>
        </div>
      </section>
    </div>
  );
}
