"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Vertical side navigation for the Meal Genius app.  Renders
 * navigation links for core pages: Fridge and Genius.  The
 * currently active link is highlighted.  Additional links can be
 * added here as the application grows.
 */
export default function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="side-nav">
      <Link href="/fridge" className={pathname === '/fridge' ? 'active' : ''}>
        Fridge
      </Link>
      <Link href="/genius" className={pathname === '/genius' ? 'active' : ''}>
        Genius
      </Link>
      <Link href="/weekly" className={pathname === '/weekly' ? 'active' : ''}>
        Weekly Plan
      </Link>
      <Link href="/history" className={pathname === '/history' ? 'active' : ''}>
        History
      </Link>
      <Link href="/questionnaire" className={pathname === '/questionnaire' ? 'active' : ''}>
        Personalization
      </Link>
      <Link href="/shopping" className={pathname === '/shopping' ? 'active' : ''}>
        Shopping List
      </Link>
    </nav>
  );
}