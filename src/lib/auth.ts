// Server-side auth utilities.
//
// This module exposes helpers for accessing the currently logged-in
// user on the server. It relies on the Supabase server client from
// `src/lib/supabase/server`.

import { supabaseServer } from './supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the currently authenticated user or `null` if there is no
 * authenticated session. Should only be called from server code.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error.message);
    return null;
  }
  return data.user ?? null;
}