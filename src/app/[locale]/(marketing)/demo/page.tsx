import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = {
  title: 'Request a demo — ONA',
  description: 'See ONA running in your environment. Walk through automations, governance, and review flows with our team.',
};

const agenda = [
  { step: '01', title: 'Your repos, your stack', body: 'We start with the codebases you actually want agents to work in — not a generic demo repo.' },
  { step: '02', title: 'Live agent run', body: 'Watch an agent pick up a real task, run tests in an isolated VM, and open a pull request you can review.' },
  { step: '03', title: 'Governance walkthrough', body: 'Network controls, scoped credentials, audit trails, and how it all fits inside your VPC.' },
  { step: '04', title: 'Q&A and next steps', body: 'Pricing, rollout plan, security review materials — whatever your team needs to move forward.' },
];

export default async function DemoPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <section className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
        <div className="mx-auto max-w-6xl border-x px-6 py-20 sm:px-8 sm:py-28" style={{ borderColor: 'var(--cream-border)' }}>
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>
                Request a demo
              </p>
              <h1
                className="text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50"
                style={{ fontFamily: SERIF, fontWeight: 400 }}
              >
                <span className="block italic">See ONA</span>
                <span className="block">in your stack.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
                Tell us a little about your team and we&apos;ll set up a working session against your repos, with the integrations and controls your security team needs.
              </p>
            </div>

            <form className="rounded-sm border p-6 sm:p-8 lg:col-span-5" style={{ borderColor: 'var(--cream-border)' }} action="/api/demo-request" method="post">
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>Work email</span>
                  <input required type="email" name="email" className="w-full rounded-sm border bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:text-neutral-100" style={{ borderColor: 'var(--cream-border)' }} placeholder="you@company.com" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>Company</span>
                  <input required type="text" name="company" className="w-full rounded-sm border bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:text-neutral-100" style={{ borderColor: 'var(--cream-border)' }} placeholder="Acme Inc" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>Team size</span>
                  <select name="size" className="w-full rounded-sm border bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:text-neutral-100 [&>option]:text-neutral-900" style={{ borderColor: 'var(--cream-border)' }}>
                    <option>1–10 engineers</option>
                    <option>11–50 engineers</option>
                    <option>51–200 engineers</option>
                    <option>200+ engineers</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>What would you like to see?</span>
                  <textarea name="notes" rows={4} className="w-full rounded-sm border bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:text-neutral-100" style={{ borderColor: 'var(--cream-border)' }} placeholder="A migration across our Java services, plus VPC setup." />
                </label>
                <button type="submit" className="w-full rounded-sm bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-neutral-950">
                  Request a demo →
                </button>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">We reply within one business day. No sales sequences.</p>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="border-b" style={{ borderColor: 'var(--cream-border)' }}>
        <div className="mx-auto max-w-6xl border-x px-6 py-12 sm:px-8 sm:py-16" style={{ borderColor: 'var(--cream-border)' }}>
          <p className="mb-8 text-[11px] uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400" style={{ fontFamily: MONO }}>What the call covers</p>
          <div className="grid border md:grid-cols-2 lg:grid-cols-4" style={{ borderColor: 'var(--cream-border)' }}>
            {agenda.map(item => (
              <div key={item.step} className="border-b p-6 last:border-b-0 sm:p-8 lg:border-b-0 lg:border-r lg:last:border-r-0" style={{ borderColor: 'var(--cream-border)' }}>
                <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-400 dark:text-neutral-500" style={{ fontFamily: MONO }}>{item.step}</p>
                <h3 className="mt-6 text-2xl leading-[0.95] tracking-[-0.045em] text-neutral-950 dark:text-neutral-50" style={{ fontFamily: SERIF, fontWeight: 400 }}>{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">
            Prefer to try it yourself first?{' '}
            <Link href="/dashboard" className="underline underline-offset-4 hover:opacity-70">Open the dashboard</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
