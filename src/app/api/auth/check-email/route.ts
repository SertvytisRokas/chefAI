import { NextResponse } from 'next/server';
import { authEmailExists } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const exists = await authEmailExists(email);
    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ error: 'Could not check email' }, { status: 500 });
  }
}
