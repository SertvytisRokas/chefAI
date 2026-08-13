import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { supabaseServer } from '../../../../lib/supabase/server';
import { applyDeductions } from '../../../../lib/executor';
import type { DeductionRequest } from '../../../../lib/cookTypes';

/** Guards against an oversized payload; no real fridge approaches this. */
const MAX_DEDUCTIONS = 100;

/**
 * Applies a confirmed deduction plan to the fridge.
 *
 * No model call happens here — this is pure arithmetic over rows the user owns.
 * Amounts are taken from the request because the user is allowed to correct the
 * Scribe, but every id is re-verified against their own fridge before any write.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to do this.' }, { status: 401 });
  }

  let deductions: DeductionRequest[];
  try {
    const body = await request.json();
    const raw = Array.isArray(body?.deductions) ? body.deductions : null;
    if (!raw) {
      return NextResponse.json({ error: 'A deductions array is required.' }, { status: 400 });
    }
    if (raw.length > MAX_DEDUCTIONS) {
      return NextResponse.json({ error: 'Too many deductions in one request.' }, { status: 400 });
    }
    deductions = raw.map((entry: any) => ({
      fridgeItemId: String(entry?.fridgeItemId ?? ''),
      deduct: Number(entry?.deduct)
    }));
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();
    const result = await applyDeductions(supabase, user.id, deductions);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Cook apply failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to update your fridge.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
