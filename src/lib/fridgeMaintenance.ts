/**
 * The rules around emptied fridge items. Shared by the UI and any server code,
 * so the countdown a user sees and the row that actually gets removed can never
 * disagree.
 *
 * An item that reaches zero is not deleted immediately — it lingers for a week
 * as a visible "you are out of this" signal, which is useful information in a
 * food-waste app. Favourites are exempt entirely: a staple like flour should
 * stay on the list precisely *because* it ran out.
 *
 * `depleted_at` is set and cleared by a database trigger (see
 * scripts/m15-schema-alignment.sql), not by application code, so the timestamp
 * is correct no matter which write path emptied the item.
 */

/** How long an emptied, non-favourite item stays visible before removal. */
export const DEPLETED_RETENTION_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Supabase client, typed loosely on purpose: this module only needs `from()`. */
type DbClient = { from: (table: string) => any };

/**
 * Whole days left before an emptied item is removed.
 *
 * Rounds up, so an item stamped moments ago reads "7 days" rather than "6".
 * Returns null when the item is not empty, and 0 when it is already due.
 */
export function daysUntilRemoval(depletedAt: string | null | undefined, now = Date.now()): number | null {
  if (!depletedAt) return null;
  const stamped = new Date(depletedAt).getTime();
  if (!Number.isFinite(stamped)) return null;

  const elapsedDays = (now - stamped) / MS_PER_DAY;
  const remaining = DEPLETED_RETENTION_DAYS - elapsedDays;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining);
}

/** Human phrasing for the countdown shown beside an emptied item. */
export function removalNotice(depletedAt: string | null | undefined, now = Date.now()): string | null {
  const days = daysUntilRemoval(depletedAt, now);
  if (days === null) return null;
  if (days === 0) return 'Will be removed shortly';
  if (days === 1) return 'Will be removed tomorrow';
  return `Will be removed in ${days} days`;
}

/** The cutoff timestamp before which emptied items are due for removal. */
export function removalCutoffIso(now = Date.now()): string {
  return new Date(now - DEPLETED_RETENTION_DAYS * MS_PER_DAY).toISOString();
}

/**
 * Deletes emptied, non-favourite items whose week has elapsed.
 *
 * Runs opportunistically when the fridge is opened rather than on a schedule —
 * no cron to maintain, and the only moment the result matters is when someone
 * is looking at the list. Returns the ids removed so the caller can update its
 * local copy without refetching.
 */
export async function purgeExpiredDepletedItems(
  supabase: DbClient,
  userId: string,
  now = Date.now()
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('user_id', userId)
      .eq('favorite', false)
      .lte('quantity', 0)
      .lt('depleted_at', removalCutoffIso(now))
      .select('id');

    if (error) {
      console.error('Could not purge depleted fridge items:', error.message);
      return [];
    }
    return (data || []).map((row: any) => String(row.id));
  } catch (err) {
    // Housekeeping must never block the page from rendering.
    console.error('Could not purge depleted fridge items:', err);
    return [];
  }
}
