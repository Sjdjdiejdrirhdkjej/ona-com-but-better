import Link from 'next/link';
import { AppConfig } from '@/utils/AppConfig';

const BG = '#f7f6f2';

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
    <div className="min-h-screen antialiased" style={{ backgroundColor: BG, color: '#111' }}>
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-black/8"
        style={{ backgroundColor: 'rgba(247,246,242,0.88)', backdropFilter: 'blur(14px)' }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex-shrink-0">
            <span className="text-lg font-bold tracking-tight text-gray-950">
              {AppConfig.name.toUpperCase()}
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden md:flex">
            <ul className="flex items-center gap-1 text-sm font-medium text-gray-700">
              {props.leftNav}
            </ul>
          </nav>

          <div className="flex items-center gap-2 text-sm">
            {props.rightNav}
          </div>
        </div>
      </header>

      <main className="pt-14">{props.children}</main>

      <footer
        className="border-t border-gray-200 px-6 pt-14"
        style={{ backgroundColor: BG }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5">
            {footerLinks.map(col => (
              <div key={col.heading}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {col.heading}
                </p>
                <ul className="space-y-2">
                  {col.links.map(link => (
                    <li key={link}>
                      <Link
                        href="/about/"
                        className="text-sm text-gray-600 hover:text-gray-950 transition-colors"
                      >
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 py-6 text-xs text-gray-400">
            <span>{`© ${new Date().getFullYear()} ${AppConfig.name}`}</span>
            <div className="flex flex-wrap gap-4">
              {['Status', 'Security', 'Imprint', 'Terms of service', 'Privacy policy', 'Cookie policy'].map(
                item => (
                  <Link key={item} href="/about/" className="hover:text-gray-700 transition-colors">
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
