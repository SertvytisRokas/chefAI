import { createClient, type User } from '@supabase/supabase-js';

/** Unconfirmed signups are deleted after this window (also match Supabase OTP expiry). */
export const UNCONFIRMED_SIGNUP_TTL_MS = 60 * 60 * 1000;

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

function isUserConfirmed(user: Pick<User, 'email_confirmed_at'>): boolean {
  return Boolean(user.email_confirmed_at);
}

function isUnconfirmedExpired(
  user: Pick<User, 'email_confirmed_at' | 'created_at'>,
  now = Date.now()
): boolean {
  if (isUserConfirmed(user)) return false;
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!created) return false;
  return now - created >= UNCONFIRMED_SIGNUP_TTL_MS;
}

async function findUserByEmail(email: string): Promise<User | null> {
  const supabase = supabaseAdmin();
  const normalized = email.trim().toLowerCase();

  const admin = supabase.auth.admin as {
    getUserByEmail?: (
      e: string
    ) => Promise<{
      data: { user?: User | null } | User | null;
      error: { message?: string; status?: number } | null;
    }>;
  };

  if (typeof admin.getUserByEmail === 'function') {
    const { data, error } = await admin.getUserByEmail(normalized);
    if (error?.status === 404) return null;
    if (error) throw error;
    const user =
      data && typeof data === 'object' && 'user' in data ? data.user : (data as User | null);
    return user ?? null;
  }

  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === normalized) ?? null;
    if (user) return user;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

/** Deletes one unconfirmed user if their signup window expired. Returns true if deleted. */
export async function cleanupStaleUnconfirmedUserByEmail(email: string): Promise<boolean> {
  const user = await findUserByEmail(email);
  if (!user || !isUnconfirmedExpired(user)) return false;
  await deleteAuthUser(user.id);
  return true;
}

/**
 * Returns true when signup must be blocked: confirmed account exists, or an
 * unconfirmed signup still inside the 1-hour verification window.
 */
export async function authEmailBlocksSignup(email: string): Promise<boolean> {
  const status = await getSignupEmailStatus(email);
  return status !== 'available';
}

export type SignupEmailStatus = 'available' | 'confirmed' | 'pending_verification';

export async function getSignupEmailStatus(email: string): Promise<SignupEmailStatus> {
  await cleanupStaleUnconfirmedUserByEmail(email);
  const user = await findUserByEmail(email);
  if (!user) return 'available';
  if (isUserConfirmed(user)) return 'confirmed';
  if (!isUnconfirmedExpired(user)) return 'pending_verification';
  return 'available';
}

/** Batch-delete all expired unconfirmed users (for scheduled cron). */
export async function cleanupAllStaleUnconfirmedUsers(): Promise<number> {
  const supabase = supabaseAdmin();
  const now = Date.now();
  let deleted = 0;
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users) {
      if (isUserConfirmed(user)) continue;
      const created = user.created_at ? new Date(user.created_at).getTime() : 0;
      if (!created || now - created < UNCONFIRMED_SIGNUP_TTL_MS) continue;
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (!delError) deleted += 1;
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return deleted;
}
