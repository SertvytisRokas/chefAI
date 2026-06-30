import { createClient } from '@supabase/supabase-js';

/** Server-only Supabase client with service role (never expose to the browser). */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Returns true if a user with this email exists in Supabase Auth. */
export async function authEmailExists(email: string): Promise<boolean> {
  const supabase = supabaseAdmin();
  const normalized = email.trim().toLowerCase();

  const admin = supabase.auth.admin as {
    getUserByEmail?: (
      e: string
    ) => Promise<{
      data: { user?: { id?: string } | null } | { id?: string } | null;
      error: { message?: string; status?: number } | null;
    }>;
  };

  if (typeof admin.getUserByEmail === 'function') {
    const { data, error } = await admin.getUserByEmail(normalized);
    if (error?.status === 404) return false;
    if (error) throw error;
    const user =
      data && typeof data === 'object' && 'user' in data
        ? data.user
        : data;
    return Boolean(user && typeof user === 'object' && 'id' in user && user.id);
  }

  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    if (data.users.some((u) => u.email?.toLowerCase() === normalized)) {
      return true;
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return false;
}
