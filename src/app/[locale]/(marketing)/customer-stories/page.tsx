import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = {
  title: 'Customer stories — ONA',
  description: 'How teams use ONA background agents to ship migrations, remediate CVEs, and clear backlogs.',
};

const stories = [
  {
    company: 'Top 100 global company',
    quote: '"90–95% of migration work is done by ONA Automations. We just have to do the final push commands."',
    body: 'A platform team modernized 400+ Python services in six months by dispatching agents in parallel against a shared migration spec. Reviews stayed familiar — every change shipped as a normal pull request.',
    stats: [
      { stat: '4x', label: 'productivity increase' },
      { stat: '83%', label: 'of PRs co-authored by ONA' },
      { stat: '400+', label: 'Python repos modernized in 6 months' },
    ],
  },
  {
    company: 'Series-C fintech',
    quote: '"Our CVE backlog used to take a quarter. Now it closes itself overnight."',
    body: 'Connecting their dependency scanner to ONA reduced mean time to remediate from weeks to under 24 hours. Each CVE produces a focused PR per repo, validated by the existing test suite.',
    stats: [
      { stat: '24h', label: 'mean time to remediate' },
      { stat: '120+', label: 'repos under automation' },
      { stat: '0', label: 'manual dependency bumps last quarter' },
    ],
  },
  {
    company: 'Developer tools company',
    quote: '"The backlog stopped being a graveyard."',
    body: 'Well-scoped tickets are now picked up by agents within minutes of triage. Engineers focus on architectural work; routine changes ship as reviewable diffs without context switches.',
    stats: [
      { stat: '62%', label: 'of tickets resolved by agents' },
      { stat: '11 min', label: 'median time-to-PR' },
      { stat: '3x', label: 'sprint throughput' },
    ],
  },
];

export default async function CustomerStoriesPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <section className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
        <div className="mx-auto max-w-6xl border-x px-6 py-20 sm:px-8 sm:py-28" style={{ borderColor: 'var(--cream-border)' }}>
          <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>Customer stories</p>
          <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>
            <span className="block italic">Real teams.</span>
            <span className="block">Real PRs.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
            Each of these teams started with one repetitive task. They expanded as they saw the review queue stay manageable and the test results stay green.
          </p>
        </div>
      </section>

      {stories.map((story, i) => (
        <section key={story.company} className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
          <div className="mx-auto max-w-6xl border-x px-6 py-16 sm:px-8 sm:py-20" style={{ borderColor: 'var(--cream-border)' }}>
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <p className="mb-6 text-[11px] uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                  Story 0{i + 1} · {story.company}
                </p>
                <blockquote className="text-3xl leading-[0.98] tracking-[-0.045em] text-neutral-950 dark:text-neutral-50 sm:text-4xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  {story.quote}
                </blockquote>
                <p className="mt-8 max-w-xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300">{story.body}</p>
              </div>
              <div className="grid gap-5 lg:col-span-5 lg:border-l lg:pl-8" style={{ borderColor: 'var(--cream-border)' }}>
                {story.stats.map(s => (
                  <div key={s.stat} className="border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--cream-border)' }}>
                    <p className="text-5xl leading-none tracking-[-0.06em] text-neutral-950 dark:text-neutral-50 sm:text-6xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>{s.stat}</p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      <section>
        <div className="mx-auto max-w-6xl border-x px-6 py-16 text-center sm:px-8 sm:py-24" style={{ borderColor: 'var(--cream-border)' }}>
          <h2 className="mx-auto max-w-2xl text-3xl leading-[0.95] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50 sm:text-5xl" style={{ fontFamily: SERIF, fontWeight: 400 }}>
            Want to be next?
          </h2>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/demo" className="inline-flex items-center justify-center gap-2 rounded-sm bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-neutral-950">
              Request a demo
              <span>→</span>
            </Link>
            <Link href="/dashboard" className="inline-flex justify-center rounded-sm border px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-neutral-50" style={{ borderColor: 'var(--cream-border)' }}>
              Open the dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
