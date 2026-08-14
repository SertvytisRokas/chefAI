import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { supabaseServer } from '../../../../lib/supabase/server';
import { loadIngredientStandards } from '../../../../lib/ingredientStandards';
import { normalizeNewFridgeItems } from '../../../../lib/normalizeFridge';
import type { MeasurementType } from '../../../../lib/units';

/**
 * Standardises fridge item names that `ingredient_standards` does not cover yet.
 *
 * Called opportunistically after the fridge changes. Each unknown ingredient is
 * resolved once and written to the global table, so the same question is never
 * asked again — by this user or any other. As the table fills, the cook loop
 * needs the model less and less.
 *
 * Deliberately forgiving: this is an optimisation, not a dependency. Any
 * failure returns a normal response and the app carries on unchanged.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to do this.' }, { status: 401 });
  }

  try {
    const supabase = await supabaseServer();

    const [fridgeResult, measurementResult] = await Promise.all([
      supabase.from('fridge_items').select('name').eq('user_id', user.id),
      supabase
        .from('measurement_types')
        .select('id, name, abbreviation, dimension, to_base_factor')
    ]);
    const standards = await loadIngredientStandards(supabase);

    const fridgeRows = fridgeResult.data;
    const measurementRows = measurementResult.data;

    const names = (fridgeRows || [])
      .map((row: any) => String(row.name || '').trim())
      .filter(Boolean);

    if (names.length === 0) {
      return NextResponse.json({ added: 0, considered: [] });
    }

    const measurementTypes: MeasurementType[] = (measurementRows || []).map((row: any) => ({
      id: Number(row.id),
      name: String(row.name),
      abbreviation: row.abbreviation ?? null,
      dimension: row.dimension ?? null,
      to_base_factor: row.to_base_factor ?? null
    }));

    const result = await normalizeNewFridgeItems(names, standards, measurementTypes);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Fridge normalisation route failed:', err);
    // Never surface this as an error to the user: nothing they did is broken.
    return NextResponse.json({ added: 0, considered: [] });
  }
}
