import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileMenu } from '@/components/MobileMenu';
import { AppConfig } from '@/utils/AppConfig';

const footerLinks = [
  {
    heading: 'Platform',
    links: ['Background agents', 'Automations', 'Environments', 'Governance', 'Pricing'],
  },
  {
    heading: 'Use cases',
    links: ['AI code review', 'Code migration', 'CVE remediation', 'Standardization'],
  },
  {
    heading: 'Compare',
    links: ['Claude Code', 'Cursor', 'GitHub Copilot', 'Devin', 'Codex', 'Factory'],
  },
  {
    heading: 'Resources',
    links: ['Blog', 'Docs', 'Changelog', 'Events', 'Newsletter', 'Templates', 'Videos', 'Reports'],
  },
  {
    heading: 'Company',
    links: ['About', 'Careers', 'Media', 'Contact'],
  },
];

export const BaseTemplate = (props: {
  leftNav: React.ReactNode;
  rightNav?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className="min-h-screen antialiased" style={{ backgroundColor: 'var(--bg)', color: 'var(--text,#111)' }}>
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-black/8 dark:border-white/8"
        style={{ backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(14px)' }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex-shrink-0">
            <span className="text-lg font-bold tracking-tight text-gray-950 dark:text-gray-50">
              {AppConfig.name.toUpperCase()}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main navigation" className="hidden md:flex">
            <ul className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {props.leftNav}
            </ul>
          </nav>

          {/* Desktop right actions */}
          <div className="hidden items-center gap-2 text-sm md:flex">
            <ThemeToggle />
            {props.rightNav}
          </div>

          {/* Mobile hamburger */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <MobileMenu />
          </div>
        </div>
      </header>

      <main className="pt-14">{props.children}</main>

      <footer
        className="border-t border-gray-200 dark:border-gray-800 px-4 pt-12 sm:px-6"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5">
            {footerLinks.map(col => (
              <div key={col.heading}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  {col.heading}
                </p>
                <ul className="space-y-2">
                  {col.links.map(link => (
                    <li key={link}>
                      <Link
                        href="/about/"
                        className="text-sm text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-950 dark:hover:text-gray-50"
                      >
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-800 py-6 text-xs text-gray-400 dark:text-gray-500">
            <span>{`© ${new Date().getFullYear()} ${AppConfig.name}`}</span>
            <div className="flex flex-wrap gap-3">
              {['Status', 'Security', 'Imprint', 'Terms of service', 'Privacy policy', 'Cookie policy'].map(
                item => (
                  <Link key={item} href="/about/" className="transition-colors hover:text-gray-700 dark:hover:text-gray-300">
                    {item}
                  </Link>
                ),
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
