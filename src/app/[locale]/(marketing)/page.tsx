import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

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

const BG = '#f7f6f2';
const SERIF = 'Georgia, "Times New Roman", serif';

export default async function Index(props: IIndexProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ backgroundColor: BG }}>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="flex flex-col items-center px-4 pb-0 pt-14 text-center sm:px-6 sm:pt-20">
        <h1
          className="max-w-3xl text-4xl leading-tight text-gray-950 sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ fontFamily: SERIF, fontWeight: 400 }}
        >
          The platform for
          <br />
          background agents
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-gray-500 sm:mt-6 sm:max-w-lg sm:text-lg">
          Run a team of AI software engineers in the cloud.
          <br className="hidden sm:block" />
          {' '}
          Orchestrated, governed, secured at the kernel.
        </p>
        <div className="mt-6 flex w-full flex-col items-center gap-3 sm:mt-8 sm:w-auto sm:flex-row">
          <Link
            href="/sign-up/"
            className="w-full rounded-md bg-gray-950 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-80 sm:w-auto sm:px-5 sm:py-2.5"
          >
            Start for free
          </Link>
          <Link
            href="/about/"
            className="w-full rounded-md border border-gray-300 px-6 py-3 text-sm font-medium text-gray-900 transition-colors hover:border-gray-500 sm:w-auto sm:px-5 sm:py-2.5"
          >
            Request a demo
          </Link>
        </div>
      </section>

      {/* ── GRADIENT VISUAL ──────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-6xl px-4 sm:mt-14 sm:px-6">
        <div
          className="relative w-full overflow-hidden rounded-xl sm:rounded-2xl"
          style={{ minHeight: '300px', height: 'clamp(300px, 50vw, 520px)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg,#c8d8f0 0%,#d4c8e8 30%,#e8d0c0 60%,#f0dcc8 100%)',
            }}
          />
          <div
            className="absolute"
            style={{
              top: '5%', left: '10%', width: '45%', height: '65%',
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(100,140,210,0.6) 0%,transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          <div
            className="absolute"
            style={{
              top: '15%', right: '5%', width: '40%', height: '55%',
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(200,145,110,0.5) 0%,transparent 70%)',
              filter: 'blur(35px)',
            }}
          />
          <div
            className="absolute"
            style={{
              bottom: '5%', left: '28%', width: '35%', height: '45%',
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(150,120,195,0.45) 0%,transparent 70%)',
              filter: 'blur(30px)',
            }}
          />

          <div className="absolute bottom-6 left-1/2 w-[min(18rem,calc(100%-2rem))] -translate-x-1/2 space-y-2 sm:bottom-10 sm:w-80">
            {[
              { color: '#4ade80', label: 'Weekly digest', sub: 'Identify files with most change...' },
              { color: '#fb923c', label: 'Implement prompts API', sub: 'Working...' },
              { color: '#fb923c', label: 'Add command palette', sub: 'Queued' },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)' }}
              >
                <span
                  className="mt-1.5 size-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="truncate text-xs text-gray-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ANNOUNCEMENT BANNER ───────────────────────────── */}
      <div className="flex justify-center px-4 pb-4 pt-6 sm:px-6 sm:pt-8">
        <div
          className="flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-xs text-white transition-opacity hover:opacity-90 sm:gap-3 sm:px-5 sm:py-3 sm:text-sm"
          style={{ backgroundColor: '#18182a' }}
        >
          <span
            className="size-4 flex-shrink-0 rounded-full sm:size-5"
            style={{ background: 'linear-gradient(135deg,#7b68ee,#9370db)' }}
          />
          <span>Background Agents virtual summit. RSVP now</span>
          <span className="font-medium">→</span>
        </div>
      </div>

      {/* ── CUSTOMER LOGOS ───────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {['Since 2025', 'Since 2024', 'Since 2026', 'Since 2024', 'Since 2023', 'Since 2024'].map(
            (label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="h-5 w-20 rounded sm:h-6 sm:w-24"
                  style={{ backgroundColor: '#d1cfc9' }}
                />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-10 max-w-2xl sm:mb-14">
          <h2
            className="text-3xl leading-tight text-gray-950 sm:text-4xl md:text-5xl"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            The AI engineering workforce.
          </h2>
          <p className="mt-3 text-base text-gray-500 sm:mt-4 sm:text-lg">
            Set the direction. Ona runs the execution. Continuously and autonomously.
          </p>
        </div>

        <div
          className="grid gap-px overflow-hidden rounded-xl border border-gray-200 sm:rounded-2xl md:grid-cols-2"
          style={{ backgroundColor: '#e5e4e0' }}
        >
          {[
            {
              tag: 'Background agents',
              title: 'Task in, pull request out.',
              body: 'Ona executes end-to-end in the background. Keep momentum from any device.',
              cta: 'See how agents work',
            },
            {
              tag: 'Automations',
              title: 'Agent fleets at scale.',
              body: 'Triggered across your codebase with repeatable workflows that run on PRs, schedules, or webhooks.',
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
              body: 'Complete network control. Audit trails, scoped credentials, and kernel-level policy enforcement.',
              cta: 'Learn about governance',
            },
          ].map(item => (
            <div
              key={item.tag}
              className="flex flex-col justify-between p-6 sm:p-8"
              style={{ backgroundColor: BG }}
            >
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400 sm:mb-3">
                  {item.tag}
                </p>
                <h3
                  className="mb-2 text-xl text-gray-950 sm:mb-3 sm:text-2xl"
                  style={{ fontFamily: SERIF, fontWeight: 400 }}
                >
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">{item.body}</p>
              </div>
              <Link
                href="/about/"
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:underline sm:mt-6"
              >
                {item.cta}
                {' '}
                →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── USE CASES ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div
          className="space-y-px overflow-hidden rounded-xl border border-gray-200 sm:rounded-2xl"
          style={{ backgroundColor: '#e5e4e0' }}
        >
          {[
            {
              title: 'Code migration & modernization',
              body: 'Migrate hundreds of repos in parallel — COBOL, Java & framework upgrades, CI pipelines. Ona does the work. You review the PRs.',
              cta: 'Learn more about code migration',
            },
            {
              title: 'AI code review',
              body: "Ona doesn't just scan patterns — it compiles, runs tests, and reviews in a real environment.",
              cta: 'Learn more about code review',
            },
            {
              title: 'Automated CVE remediation',
              body: 'Remediates what your scanner finds — across hundreds of repos, in isolated environments. Tested, with PRs ready for review.',
              cta: 'Learn more about CVE remediation',
            },
          ].map(item => (
            <div
              key={item.title}
              className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8"
              style={{ backgroundColor: BG }}
            >
              <div className="max-w-xl">
                <h3
                  className="mb-2 text-lg text-gray-950 sm:text-xl"
                  style={{ fontFamily: SERIF, fontWeight: 400 }}
                >
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">{item.body}</p>
              </div>
              <Link
                href="/about/"
                className="flex-shrink-0 text-sm font-medium text-gray-900 hover:underline sm:mt-1"
              >
                {item.cta}
                {' '}
                →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIAL ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div
          className="overflow-hidden rounded-xl p-6 sm:rounded-2xl sm:p-10"
          style={{ backgroundColor: '#eceae4' }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Top 100 global company
          </p>
          <blockquote
            className="mb-6 text-xl leading-relaxed text-gray-900 sm:mb-8 sm:text-2xl md:text-3xl"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            "90–95% of migration work is done by Ona Automations. We just have to do the final
            push commands."
          </blockquote>
          <Link href="/about/" className="text-sm font-medium text-gray-700 hover:underline">
            Read more customer stories →
          </Link>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-3 sm:gap-6">
            {[
              { stat: '4x', label: 'productivity increase' },
              { stat: '83%', label: 'of PRs co-authored by Ona' },
              { stat: '400+', label: 'Python repos modernized in 6 months' },
            ].map(item => (
              <div key={item.stat} className="border-t border-gray-300 pt-5 sm:border-t-0 sm:pt-0 first:border-t-0 first:pt-0">
                <p
                  className="text-4xl text-gray-950 sm:text-5xl"
                  style={{ fontFamily: SERIF, fontWeight: 400 }}
                >
                  {item.stat}
                </p>
                <p className="mt-1 text-sm text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div
          className="flex flex-col gap-5 rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:p-10"
          style={{ backgroundColor: '#eceae4' }}
        >
          <div>
            <h2
              className="text-2xl text-gray-950 md:text-3xl"
              style={{ fontFamily: SERIF, fontWeight: 400 }}
            >
              Enterprise-ready.
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Compliant, certified, and trusted by Fortune 500 companies.
            </p>
          </div>
          <div className="flex gap-3">
            {['SOC 2', 'Fortune 500'].map(badge => (
              <div
                key={badge}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                style={{ backgroundColor: BG }}
              >
                {badge}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLOG ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h2
          className="mb-6 text-2xl text-gray-950 sm:mb-8"
          style={{ fontFamily: SERIF, fontWeight: 400 }}
        >
          Recent highlights from our blog
        </h2>
        <div
          className="grid gap-px overflow-hidden rounded-xl border border-gray-200 sm:rounded-2xl md:grid-cols-3"
          style={{ backgroundColor: '#e5e4e0' }}
        >
          {[
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
              title: 'Ona Automations: proactive background agents',
              body: 'Background agents that write, test, and ship code on a schedule.',
            },
            {
              tag: 'AI',
              date: 'February 13, 2026',
              author: 'Johannes Landgraf',
              title: 'The last year of localhost',
              body: "The companies winning with background agents didn't start with better models.",
            },
          ].map(post => (
            <Link
              key={post.title}
              href="/about/"
              className="flex flex-col justify-between p-6 transition-opacity hover:opacity-75 sm:p-8"
              style={{ backgroundColor: BG }}
            >
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs text-gray-400 sm:mb-4">
                  <span className="rounded-full border border-gray-200 px-2.5 py-0.5 font-medium">
                    {post.tag}
                  </span>
                  <span>{post.date}</span>
                </div>
                <h3
                  className="mb-2 text-base leading-snug text-gray-950 sm:text-lg"
                  style={{ fontFamily: SERIF, fontWeight: 400 }}
                >
                  {post.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">{post.body}</p>
              </div>
              <p className="mt-5 text-xs text-gray-400 sm:mt-6">{post.author}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
        <h2
          className="mb-2 text-3xl text-gray-950 sm:text-4xl md:text-5xl"
          style={{ fontFamily: SERIF, fontWeight: 400 }}
        >
          Start shipping with Ona
        </h2>
        <p className="mb-6 text-gray-500 sm:mb-8">No commitment. No setup. Just start.</p>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Link
            href="/sign-up/"
            className="w-full rounded-md bg-gray-950 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-80 sm:w-auto sm:px-5 sm:py-2.5"
          >
            Start for free
          </Link>
          <Link
            href="/about/"
            className="w-full rounded-md border border-gray-300 px-6 py-3 text-sm font-medium text-gray-900 transition-colors hover:border-gray-500 sm:w-auto sm:px-5 sm:py-2.5"
          >
            Request a demo
          </Link>
        </div>
      </section>

    </div>
  );
}
