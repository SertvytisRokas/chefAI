import { NextResponse } from 'next/server';
import { getSignupEmailStatus } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const status = await getSignupEmailStatus(email);
    return NextResponse.json({
      exists: status !== 'available',
      status,
    });
  } catch {
    return NextResponse.json({ error: 'Could not check email' }, { status: 500 });
  }
}
