"use client";

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import TopBar from './TopBar';
import LandingHeader from './LandingHeader';
import SideNav from './SideNav';

/**
 * Chooses between the marketing shell (landing) and the app shell
 * (top bar + side nav) based on the current route.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMarketing = pathname === '/' || pathname === '/login';

  if (isMarketing) {
    return (
      <div className="app">
        <LandingHeader />
        <main className={pathname === '/' ? 'landing-main' : 'page'}>{children}</main>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <SideNav />
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
