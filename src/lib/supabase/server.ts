// Utility for creating a Supabase client on the server.
//
// This helper uses the `createServerClient` function from
// `@supabase/ssr` to configure a Supabase client that can read and
// write authentication cookies. It accepts no parameters and
// derives cookies from Next.js's `cookies()` API.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Returns a Supabase client configured for server‑side execution.
 * The returned client reads auth cookies from the incoming request
 * and writes updated cookies back when sessions are refreshed. This
 * helper should only be called from server components, server actions
 * or API routes (never from client code).
 */
export async function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignored when called from a server component. During
            // rendering, cookie writes have no effect. Session
            // refreshes are handled by middleware instead.
          }
        }
      }
    }
  );
}