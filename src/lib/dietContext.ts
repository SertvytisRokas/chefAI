import 'server-only';

import { preferencesFromPersonalization } from './personalization';
import type { PersonalizationAnswers } from './personalization';

/**
 * Loads the user's diet and allergens on the server.
 *
 * Mirrors the precedence the Genius page already uses: the personalization quiz
 * wins when present, otherwise fall back to `profiles` + `user_allergens`.
 * Factored out here because every model-facing feature needs it — the Scribe
 * uses it to disambiguate matches today, and the assistant will need it later.
 *
 * Intentionally narrow: diet and allergens only. The full personalization
 * profile matters when *generating* food, not when reconciling what was eaten,
 * and this runs on every cook.
 */

/** Supabase server client. Typed loosely on purpose: this module only needs `from()`. */
type DbClient = { from: (table: string) => any };

export interface DietContext {
  diet?: string;
  /** Hard constraints. Never traded off, and never matched against by the Scribe. */
  allergens: string[];
}

export async function loadDietContext(
  supabase: DbClient,
  userId: string
): Promise<DietContext> {
  try {
    const { data: personalizationRow } = await supabase
      .from('user_personalization')
      .select('answers')
      .eq('user_id', userId)
      .maybeSingle();

    if (personalizationRow?.answers && typeof personalizationRow.answers === 'object') {
      const answers = personalizationRow.answers as PersonalizationAnswers;
      const prefs = preferencesFromPersonalization(answers);
      return { diet: prefs.diet, allergens: prefs.allergens };
    }
  } catch {
    // Personalization is optional; fall through to the profile tables.
  }

  let diet: string | undefined;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('diet_type_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.diet_type_id) {
      const { data: dietType } = await supabase
        .from('diet_types')
        .select('name')
        .eq('id', profile.diet_type_id)
        .maybeSingle();
      if (dietType?.name) diet = String(dietType.name);
    }
  } catch {
    // No profile row yet — diet simply stays undefined.
  }

  let allergens: string[] = [];
  try {
    const { data: allergenRows } = await supabase
      .from('user_allergens')
      .select('name')
      .eq('user_id', userId);
    allergens = (allergenRows || [])
      .map((row: any) => String(row.name))
      .filter((name: string) => name.trim().length > 0);
  } catch {
    // Allergens are optional.
  }

  return { diet, allergens };
}
