import 'server-only';

import type { AppliedDeduction, DeductionRequest } from './cookTypes';

/**
 * The Executor.
 *
 * Takes a deduction plan and applies it. No model call, no model arithmetic:
 * every number here is computed in code and validated against rows the user
 * actually owns. This is the only place the fridge is mutated by cooking.
 *
 * Deliberately does NOT delete depleted items — a depleted row is set to zero
 * and kept. Deleting is irreversible and this is the first feature that can
 * destroy inventory data; leaving the row at zero means a bad resolution is
 * always visible and always recoverable by hand.
 */

/** Supabase server client. Typed loosely on purpose: this module only needs `from()`. */
type DbClient = { from: (table: string) => any };

/** Quantities are rounded to this many decimals to keep float noise out of the DB. */
const QUANTITY_DECIMALS = 3;

export function roundQuantity(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * The whole arithmetic contract, in one place: subtract, never go below zero.
 * Pure and side-effect free so it can be reasoned about (and later tested)
 * without a database.
 */
export function computeRemaining(before: number, deduct: number): number {
  if (!Number.isFinite(before)) return 0;
  if (!Number.isFinite(deduct) || deduct <= 0) return roundQuantity(before);
  return roundQuantity(Math.max(0, before - deduct));
}

export interface ExecutorResult {
  applied: AppliedDeduction[];
  /** Requests that were discarded, with why — surfaced for debugging, not shown as errors. */
  rejected: { fridgeItemId: string; reason: string }[];
}

/** Keeps one entry per fridge item, summing duplicates and dropping nonsense. */
function normalizeRequests(requests: DeductionRequest[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const request of requests) {
    if (!request || typeof request.fridgeItemId !== 'string') continue;
    const id = request.fridgeItemId.trim();
    if (!id) continue;
    const deduct =
      typeof request.deduct === 'number'
        ? request.deduct
        : Number.parseFloat(String(request.deduct));
    if (!Number.isFinite(deduct) || deduct <= 0) continue;
    merged.set(id, roundQuantity((merged.get(id) ?? 0) + deduct));
  }
  return merged;
}

/**
 * Applies a deduction plan to the user's fridge.
 *
 * Every id is re-checked against rows owned by `userId` before anything is
 * written, so a plan referring to someone else's row (or a row that no longer
 * exists) is rejected rather than applied. RLS enforces this too; this is the
 * second lock on the same door.
 */
export async function applyDeductions(
  supabase: DbClient,
  userId: string,
  requests: DeductionRequest[]
): Promise<ExecutorResult> {
  const merged = normalizeRequests(requests);
  const rejected: { fridgeItemId: string; reason: string }[] = [];

  for (const request of requests) {
    const id = typeof request?.fridgeItemId === 'string' ? request.fridgeItemId.trim() : '';
    if (id && !merged.has(id)) {
      rejected.push({ fridgeItemId: id, reason: 'invalid or non-positive amount' });
    }
  }

  if (merged.size === 0) {
    return { applied: [], rejected };
  }

  const ids = Array.from(merged.keys());
  const { data: rows, error } = await supabase
    .from('fridge_items')
    .select('id, name, quantity, measurement_type_id')
    .eq('user_id', userId)
    .in('id', ids);

  if (error) {
    throw new Error(`Failed to load fridge items: ${error.message}`);
  }

  const ownedRows: any[] = rows || [];
  const byId = new Map<string, any>(
    ownedRows.map((row): [string, any] => [String(row.id), row])
  );

  for (const id of ids) {
    if (!byId.has(id)) {
      rejected.push({ fridgeItemId: id, reason: 'not found in your fridge' });
    }
  }

  // Unit names are only needed for display in the result.
  const { data: measurementTypes } = await supabase.from('measurement_types').select('id, name');
  const unitById = new Map<number, string>(
    (measurementTypes || []).map((m: any): [number, string] => [Number(m.id), String(m.name)])
  );

  const applied: AppliedDeduction[] = [];

  for (const [id, deduct] of merged.entries()) {
    const row = byId.get(id);
    if (!row) continue;

    const before = roundQuantity(Number(row.quantity) || 0);
    const after = computeRemaining(before, deduct);

    const { error: updateError } = await supabase
      .from('fridge_items')
      .update({ quantity: after })
      .eq('id', row.id)
      .eq('user_id', userId);

    if (updateError) {
      rejected.push({ fridgeItemId: id, reason: updateError.message });
      continue;
    }

    applied.push({
      fridgeItemId: id,
      name: String(row.name),
      unit: unitById.get(row.measurement_type_id as number) || '',
      before,
      // Report what was actually removed, which is capped by what was there.
      deducted: roundQuantity(Math.min(deduct, before)),
      after,
      depleted: after === 0
    });
  }

  return { applied, rejected };
}
