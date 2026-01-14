import { cookies } from 'next/headers';
import { createServerSupabaseClient, type Session, type User } from '@supabase/auth-helpers-nextjs';
import type { Database } from './types';

/**
 * Returns a server-side Supabase client using the cookies from the incoming request.
 */
export function getServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerSupabaseClient<Database>({
    cookies: () => cookieStore
  });
}

/**
 * Fetches the currently authenticated user using the server-side client.
 */
export async function getCurrentUser() {
  const supabase = getServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}