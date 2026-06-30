import { NextResponse } from 'next/server';
import { cleanupAllStaleUnconfirmedUsers } from '../../../../lib/supabase/admin';

/**
 * Hourly cleanup of unconfirmed signups older than 1 hour.
 * Vercel Cron sends Authorization: Bearer CRON_SECRET when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deleted = await cleanupAllStaleUnconfirmedUsers();
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
