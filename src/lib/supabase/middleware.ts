// Middleware helper to refresh Supabase auth sessions.
//
// This module exports a single function `updateSession` which is
// intended to be used from your project's `middleware.ts`. When a
// request comes in, calling `updateSession(request)` will create a
// server client, refresh the user's session if necessary, and write
// any updated cookies onto the response. The function returns a
// `NextResponse` that you should return from your middleware.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on every request. This ensures
 * that access and refresh tokens stored in HTTP‑only cookies are
 * rotated when they're about to expire. Without this middleware,
 * sessions may become stale and users could be logged out unexpectedly.
 *
 * @param request The incoming request from Next.js middleware.
 * @returns A `NextResponse` with updated cookies (if any).
 */
export async function updateSession(request: NextRequest) {
  // Create a server client using the request's cookies. We write
  // cookies onto the response returned by NextResponse.next().
  let response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );
  // Trigger a session refresh. If the access token has expired but
  // a refresh token is present, this call will update the cookies.
  await supabase.auth.getSession();
  return response;
}