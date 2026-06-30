import './globals.css';
import SupabaseProvider from '../components/SupabaseProvider';
import AppShell from '../components/AppShell';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'chefAI — Cook smarter, waste less',
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
          <AppShell>{children}</AppShell>
        </SupabaseProvider>
      </body>
    </html>
  );
}