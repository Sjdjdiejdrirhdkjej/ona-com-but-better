import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/libs/I18nRouting';

type IPortfolioDetailProps = {
  params: Promise<{ slug: string; locale: string }>;
};

export function generateStaticParams() {
  const slugs = [
    'release-readiness',
    'incident-triage',
    'dependency-remediation',
    'legacy-migration',
    'backlog-sweeps',
    'docs-and-cleanup',
  ];

  return routing.locales
    .map(locale =>
      slugs.map(slug => ({
        slug,
        locale,
      })),
    )
    .flat(1);
}

export async function generateMetadata(props: IPortfolioDetailProps) {
  const { locale, slug } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'PortfolioSlug',
  });

  return {
    title: t('meta_title', { slug }),
    description: t('meta_description', { slug }),
  };
}

export default async function PortfolioDetail(props: IPortfolioDetailProps) {
  const { locale, slug } = await props.params;
  setRequestLocale(locale);
  await getTranslations({
    locale,
    namespace: 'PortfolioSlug',
  });

  const caseStudies = {
    'release-readiness': {
      title: 'Release Readiness Command Center',
      challenge: 'Teams lose time piecing together release blockers across pull requests, failing CI checks, and unresolved review threads.',
      approach: 'An agent continuously scans release branches, identifies critical blockers, groups them by ownership, and drafts a readiness report with direct links.',
      impact: 'Release leads move from reactive firefighting to a predictable pre-release checklist with cleaner handoffs.',
      checklist: [
        'Collect open PRs tied to a target milestone.',
        'Highlight failing checks and stale approvals.',
        'Generate a summary comment and next-action list.',
      ],
    },
    'incident-triage': {
      title: 'Incident Triage Automation',
      challenge: 'Production issues arrive faster than teams can triage them, especially outside core working hours.',
      approach: 'The agent ingests incident data, reproduces failures in sandboxed environments, proposes likely root causes, and opens draft fixes for review.',
      impact: 'Engineers begin the day with actionable PRs and context instead of raw alert noise.',
      checklist: [
        'Ingest fresh incident events from monitoring tools.',
        'Reproduce failure paths in isolated runtime environments.',
        'Open a draft PR with logs, assumptions, and test output.',
      ],
    },
    'dependency-remediation': {
      title: 'Dependency and CVE Remediation',
      challenge: 'Security fixes get deprioritized because they are repetitive and spread across many repositories.',
      approach: 'Scheduled agents detect vulnerable packages, apply constrained upgrades, run targeted tests, and prepare grouped remediation pull requests.',
      impact: 'Security posture improves continuously without stealing feature delivery bandwidth.',
      checklist: [
        'Scan dependency graph for vulnerable ranges.',
        'Apply minimal version bumps that satisfy constraints.',
        'Attach changelog notes and test evidence to each PR.',
      ],
    },
    'legacy-migration': {
      title: 'Legacy Framework Migration',
      challenge: 'Migration programs often stall because every repository diverges in subtle but expensive ways.',
      approach: 'Reusable migration playbooks let agents execute staged upgrade plans, validate builds, and surface manual decisions where needed.',
      impact: 'Modernization work progresses in parallel with clear visibility and lower operational risk.',
      checklist: [
        'Apply migration codemods and config updates.',
        'Run build and smoke tests after each migration stage.',
        'Capture incompatibilities as explicit follow-up tasks.',
      ],
    },
    'backlog-sweeps': {
      title: 'Backlog Sweep Agents',
      challenge: 'Well-scoped maintenance tickets can linger for months despite being easy to automate.',
      approach: 'Agents run on schedules, pull eligible tickets, implement and verify changes, then open linked pull requests with delivery notes.',
      impact: 'Teams steadily reduce backlog debt while developers focus on roadmap-critical work.',
      checklist: [
        'Select tickets by labels, size, and risk profile.',
        'Implement fixes in isolated branches with full test runs.',
        'Publish PRs with ticket references and completion notes.',
      ],
    },
    'docs-and-cleanup': {
      title: 'Docs Drift and Cleanup',
      challenge: 'Documentation and code hygiene decay quietly and eventually slow down every engineering task.',
      approach: 'Agents compare docs against recent code changes, identify stale references, and apply cleanup patches with explicit rationale.',
      impact: 'Repositories remain easier to navigate, onboard into, and safely automate.',
      checklist: [
        'Detect outdated references and dead links in docs.',
        'Flag unused modules and stale configuration paths.',
        'Open focused cleanup PRs with before/after context.',
      ],
    },
  } as const;

  const study = caseStudies[slug as keyof typeof caseStudies];
  if (!study) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Case study not found</h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          This portfolio entry does not exist. Return to the portfolio page to explore available use cases.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Portfolio case study</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight text-gray-900 sm:text-5xl dark:text-gray-50">{study.title}</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-black/10 bg-white/50 p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Challenge</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{study.challenge}</p>
        </article>
        <article className="rounded-xl border border-black/10 bg-white/50 p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Approach</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{study.approach}</p>
        </article>
        <article className="rounded-xl border border-black/10 bg-white/50 p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Impact</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{study.impact}</p>
        </article>
      </section>

      <section className="rounded-xl border border-black/10 p-6 dark:border-white/10">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Execution checklist</h2>
        <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {study.checklist.map(item => (
            <li key={item} className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export const dynamicParams = false;
