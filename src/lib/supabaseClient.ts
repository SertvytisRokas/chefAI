"use client";

import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { Database } from './types';

/**
 * This utility returns a browser-friendly Supabase client.
 * It should be used on the client side only. On the server, use
 * createServerSupabaseClient from `@supabase/auth-helpers-nextjs` instead.
 */
export const supabaseClient = createBrowserSupabaseClient<Database>();