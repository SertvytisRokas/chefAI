import { updateSession } from './src/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

/**
 * Next.js middleware entry point. This simply delegates to the
 * Supabase `updateSession` helper defined in `src/lib/supabase/middleware.ts`.
 * The matcher below ensures that static files and image routes are
 * ignored so that the middleware only runs on dynamic routes.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Exclude Next.js internals and static assets from middleware.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};