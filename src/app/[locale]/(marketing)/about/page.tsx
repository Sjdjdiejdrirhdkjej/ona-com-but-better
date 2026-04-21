import { getTranslations, setRequestLocale } from 'next-intl/server';

type IAboutProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: IAboutProps) {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'About',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function About(props: IAboutProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  await getTranslations({
    locale,
    namespace: 'About',
  });

  const principles = [
    {
      title: 'Purpose over novelty',
      body: 'Agents should not exist to demo intelligence. They should remove real engineering bottlenecks and move product work forward every day.',
    },
    {
      title: 'Trust through visibility',
      body: 'Every task should leave a clear trail: what changed, why it changed, what tests ran, and how to take over instantly when humans want control.',
    },
    {
      title: 'Quality is the product',
      body: 'A good agent outcome is not just generated code. It is tested, reviewed, understandable, and production-ready in the form of a pull request.',
    },
  ];

  const values = [
    'Operate in real environments, not toy sandboxes.',
    'Keep humans in charge of direction and approvals.',
    'Optimize for repeatable delivery, not one-off chat wins.',
    'Build in the open so teams can inspect and adapt everything.',
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-6 sm:py-16">
      <section className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">About ONA</p>
        <h1 className="max-w-3xl text-4xl font-medium tracking-tight text-gray-900 sm:text-5xl dark:text-gray-50">
          Built with purpose for teams that need work shipped, not just suggested.
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
          This project is inspired by Ona&apos;s idea of background agents: task in, pull request out. We built ONA as an open-source
          implementation focused on practical execution, clear governance, and developer-first control.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {principles.map(item => (
          <article key={item.title} className="rounded-xl border border-black/10 bg-white/50 p-5 dark:border-white/10 dark:bg-white/5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-8 rounded-2xl border border-black/10 bg-gradient-to-b from-neutral-100 to-neutral-50 p-6 text-neutral-900 sm:p-8 md:grid-cols-2 dark:border-white/10 dark:from-neutral-950 dark:to-neutral-900 dark:text-neutral-100">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">What we are building</h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            A full-stack agent runtime where AI can plan, execute, and deliver inside secure cloud environments. The system connects code,
            tests, tooling, and workflow context so every run produces useful output your team can review.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-neutral-700 dark:text-neutral-200">
          {values.map(value => (
            <li key={value} className="rounded-lg border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              {value}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 p-6 dark:border-white/10">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Where this is heading</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          Our goal is to help any product team run reliable autonomous execution for backlog triage, bug fixing, migrations, and maintenance.
          We want teams to spend more time making decisions and less time pushing repetitive work through the pipeline.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          If that vision resonates with your team, start a task in the app and let the agent show its work end-to-end.
        </p>
      </section>
    </div>
  );
};
