"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const APP_LINKS = [
  { href: '/fridge', label: 'Fridge' },
  { href: '/genius', label: 'Genius' },
  { href: '/weekly', label: 'Weekly Plan' },
  { href: '/history', label: 'History' },
  { href: '/questionnaire', label: 'Personalization' },
  { href: '/shopping', label: 'Shopping List' },
] as const;

/**
 * Side navigation — visible only for signed-in users.
 */
export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="side-nav">
      <div className="side-nav-links">
        {APP_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? 'active' : ''}
          >
            {label}
          </Link>
        ))}
      </div>
      <Link
        href="/blog"
        className={`side-nav-articles${pathname === '/blog' || pathname.startsWith('/blog/') ? ' active' : ''}`}
      >
        Articles
      </Link>
    </nav>
  );
}
