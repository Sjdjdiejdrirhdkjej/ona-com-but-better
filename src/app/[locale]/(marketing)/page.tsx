import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

type IIndexProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: IIndexProps) {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'Index',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function Index(props: IIndexProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
          Ona Platform
        </p>
        <h2 className="text-4xl font-bold leading-tight text-gray-900">
          Background agents that keep work moving.
        </h2>
        <p className="max-w-2xl text-base text-gray-700">
          Build always-on operations with Ona. Automate repetitive workflows,
          route context to the right team, and ship outcomes faster.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-base font-semibold">
        <Link className="rounded-md bg-gray-900 px-4 py-2 text-white" href="/sign-up">
          Start free
        </Link>
        <Link className="rounded-md border border-gray-300 px-4 py-2 text-gray-900" href="/about">
          See how it works
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold">95%</p>
          <p className="text-sm text-gray-600">Ticket triage automated</p>
        </article>
        <article className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold">3x</p>
          <p className="text-sm text-gray-600">Faster onboarding workflows</p>
        </article>
        <article className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold">24/7</p>
          <p className="text-sm text-gray-600">Agent coverage for operations</p>
        </article>
      </div>
    </section>
  );
}
