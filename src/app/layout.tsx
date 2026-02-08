import './globals.css';
import SupabaseProvider from '../components/SupabaseProvider';
import TopBar from '../components/TopBar';
import SideNav from '../components/SideNav';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Meal Genius',
  description: 'Reduce food waste by creating meals from your fridge contents'
};

/**
 * The root layout wraps all pages with the Supabase provider and
 * navigation bar. Using the App Router, this component applies to
 * every route in the application. We render children inside a
 * centralised container for consistent spacing.
 */
export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SupabaseProvider>
          <div className="app">
            <TopBar />
            <div className="app-body">
              <SideNav />
              <main className="page">{children}</main>
            </div>
          </div>
        </SupabaseProvider>
      </body>
    </html>
  );
}