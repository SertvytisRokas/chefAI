"use client";

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import LandingHeader from './LandingHeader';
import SideNav from './SideNav';
import { useUser } from './SupabaseProvider';

/**
 * Unified shell: landing header on every route; side nav only when signed in.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useUser();
  const isLanding = pathname === '/';
  const showSideNav =
    Boolean(user) &&
    pathname !== '/login' &&
    !pathname.startsWith('/auth/');

  return (
    <div className="app">
      <LandingHeader />
      <div className="app-body">
        {showSideNav && <SideNav />}
        <main className={isLanding ? 'landing-main' : 'page'}>{children}</main>
      </div>
    </div>
  );
}
