// Utility for creating a Supabase client in the browser.
//
// This wraps the `createBrowserClient` helper from `@supabase/ssr` and
// configures it with your project's URL and anon key. It should only
// be called in client components; calling it on the server will
// produce errors because it relies on browser APIs like `document.cookie`.

import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a new Supabase client for use in the browser. The client
 * is configured to automatically persist and refresh authentication
 * sessions using secure, HTTP‑only cookies.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}