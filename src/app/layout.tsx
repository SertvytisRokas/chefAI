import './globals.css';
import { ReactNode } from 'react';
import NavBar from '../components/NavBar';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { Database } from '../lib/types';

/**
 * Root layout for the application. It wraps the page in a Supabase
 * context provider so that client components can access the user and
 * perform database operations. It also renders a persistent NavBar on
 * every page.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const supabaseClient = createBrowserSupabaseClient<Database>();
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">
        <SessionContextProvider supabaseClient={supabaseClient} initialSession={null}>
          <NavBar />
          <main className="p-4 max-w-4xl mx-auto">{children}</main>
        </SessionContextProvider>
      </body>
    </html>
  );
}