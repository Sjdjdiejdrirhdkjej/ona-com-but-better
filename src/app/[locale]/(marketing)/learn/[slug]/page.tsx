import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { blogPosts, learnEntries } from '../content';

const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

function getEntry(slug: string) {
  return learnEntries[slug] ?? blogPosts[slug];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const entry = getEntry(slug);
  if (!entry) return {};
  return {
    title: `${entry.title} — ONA`,
    description: entry.intro,
  };
}

export function generateStaticParams() {
  return [...Object.keys(learnEntries), ...Object.keys(blogPosts)].map(slug => ({ slug }));
}

export default async function LearnPage(props: Props) {
  const { locale, slug } = await props.params;
  setRequestLocale(locale);

  const entry = getEntry(slug);
  if (!entry) notFound();

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <section className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
        <div className="mx-auto max-w-4xl border-x px-6 py-20 sm:px-8 sm:py-28" style={{ borderColor: 'var(--cream-border)' }}>
          <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>
            {entry.tag}
          </p>
          <h1
            className="text-[clamp(2.5rem,7vw,5rem)] leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            {entry.title}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
            {entry.intro}
          </p>
        </div>
      </section>

      <section className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
        <div className="mx-auto max-w-4xl border-x px-6 py-12 sm:px-8 sm:py-16" style={{ borderColor: 'var(--cream-border)' }}>
          <div className="space-y-14">
            {entry.sections.map(section => (
              <div key={section.heading} className="grid gap-6 md:grid-cols-12">
                <h2
                  className="text-2xl leading-tight tracking-[-0.045em] text-neutral-950 dark:text-neutral-50 sm:text-3xl md:col-span-5"
                  style={{ fontFamily: SERIF, fontWeight: 400 }}
                >
                  {section.heading}
                </h2>
                <div className="md:col-span-7">
                  <p className="text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {section.body}
                  </p>
                  {section.bullets && (
                    <ul className="mt-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                      {section.bullets.map(b => (
                        <li key={b} className="flex gap-3">
                          <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-neutral-500 dark:bg-neutral-400" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-4xl border-x px-6 py-16 text-center sm:px-8 sm:py-24" style={{ borderColor: 'var(--cream-border)' }}>
          <p className="mb-4 text-[11px] uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>
            Next step
          </p>
          <h2
            className="mx-auto max-w-2xl text-3xl leading-[0.95] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50 sm:text-5xl"
            style={{ fontFamily: SERIF, fontWeight: 400 }}
          >
            Ready to put this to work?
          </h2>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {entry.cta && (
              <Link
                href={entry.cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-neutral-950"
              >
                {entry.cta.label}
                <span>→</span>
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex justify-center rounded-sm border px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-neutral-50"
              style={{ borderColor: 'var(--cream-border)' }}
            >
              Back to overview
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
