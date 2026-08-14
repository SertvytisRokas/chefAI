import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { supabaseServer } from '../../../../lib/supabase/server';
import { loadDietContext } from '../../../../lib/dietContext';
import { loadIngredientStandards, findStandard } from '../../../../lib/ingredientStandards';
import { buildCookPlan } from '../../../../lib/cookPlanner';
import type { FridgeEntry } from '../../../../lib/cookPlanner';
import { roundAmount } from '../../../../lib/units';
import type { MeasurementType } from '../../../../lib/units';
import type { CookPlan } from '../../../../lib/cookTypes';

/**
 * Proposes what cooking a recipe should remove from the fridge.
 *
 * Read-only: this route never writes. It loads the recipe and fridge from the
 * database (never from the client, so a caller cannot deduct against someone
 * else's rows or an invented recipe), builds a plan, and returns it for the
 * user to confirm. `/api/cook/apply` does the write.
 *
 * Most of the work here is deterministic — see `cookPlanner.ts`. A model is
 * reached only for recipe lines the standards dictionary could not settle.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to do this.' }, { status: 401 });
  }

  let recipeId: string;
  try {
    const body = await request.json();
    recipeId = String(body?.recipeId ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!recipeId) {
    return NextResponse.json({ error: 'A recipeId is required.' }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();

    const { data: recipe } = await supabase
      .from('recipes')
      .select('id, title, ingredients')
      .eq('id', recipeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 });
    }

    // Split into two same-shaped batches rather than one mixed Promise.all:
    // still parallel, and far less fragile to infer.
    const [fridgeResult, measurementResult] = await Promise.all([
      supabase
        .from('fridge_items')
        .select('id, name, quantity, measurement_type_id')
        .eq('user_id', user.id),
      supabase
        .from('measurement_types')
        .select('id, name, abbreviation, dimension, to_base_factor')
    ]);
    const [standards, diet] = await Promise.all([
      loadIngredientStandards(supabase),
      loadDietContext(supabase, user.id)
    ]);

    const fridgeRows = fridgeResult.data;
    const measurementRows = measurementResult.data;

    const measurementTypes: MeasurementType[] = (measurementRows || []).map((row: any) => ({
      id: Number(row.id),
      name: String(row.name),
      abbreviation: row.abbreviation ?? null,
      dimension: row.dimension ?? null,
      to_base_factor: row.to_base_factor ?? null
    }));

    const measurementById = new Map<number, MeasurementType>(
      measurementTypes.map((mt): [number, MeasurementType] => [mt.id, mt])
    );

    const fridge: FridgeEntry[] = (fridgeRows || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      quantity: roundAmount(Number(row.quantity) || 0),
      measurementType: measurementById.get(Number(row.measurement_type_id)) ?? null,
      standard: findStandard(String(row.name), standards)
    }));

    const result = await buildCookPlan({
      recipeTitle: String((recipe as any).title ?? 'Recipe'),
      storedIngredients: (recipe as any).ingredients,
      fridge,
      measurementTypes,
      standards,
      diet: { diet: diet.diet, allergens: diet.allergens }
    });

    const plan: CookPlan = {
      recipeId: String((recipe as any).id),
      recipeTitle: String((recipe as any).title ?? 'Recipe'),
      deductions: result.deductions,
      unresolved: result.unresolved,
      skippedModel: result.skippedModel
    };

    return NextResponse.json({ plan });
  } catch (err: unknown) {
    console.error('Cook plan failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to work out what you used.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
