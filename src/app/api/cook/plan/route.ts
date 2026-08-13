import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { supabaseServer } from '../../../../lib/supabase/server';
import { loadDietContext } from '../../../../lib/dietContext';
import { resolveCookDeductions } from '../../../../lib/scribe';
import type { ScribeFridgeItem, ScribeRecipeIngredient } from '../../../../lib/scribe';
import { computeRemaining, roundQuantity } from '../../../../lib/executor';
import type { CookPlan, DeductionLine } from '../../../../lib/cookTypes';

/**
 * Proposes what cooking a recipe should remove from the fridge.
 *
 * Read-only: this route never writes. It loads the recipe and fridge from the
 * database (never from the client, so a caller cannot deduct against someone
 * else's rows or an invented recipe), asks the Kitchen Scribe to resolve them,
 * and returns a plan for the user to confirm. `/api/cook/apply` does the write.
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

    const rawIngredients = Array.isArray((recipe as any).ingredients)
      ? ((recipe as any).ingredients as any[])
      : [];
    const ingredients: ScribeRecipeIngredient[] = rawIngredients
      .filter((ing) => ing && typeof ing === 'object' && typeof ing.name === 'string')
      .map((ing) => ({
        name: String(ing.name),
        quantity: typeof ing.quantity === 'string' ? ing.quantity : String(ing.quantity ?? '')
      }));

    const [{ data: fridgeRows }, { data: measurementTypes }] = await Promise.all([
      supabase
        .from('fridge_items')
        .select('id, name, quantity, measurement_type_id')
        .eq('user_id', user.id),
      supabase.from('measurement_types').select('id, name')
    ]);

    const unitById = new Map<number, string>(
      (measurementTypes || []).map((m: any): [number, string] => [Number(m.id), String(m.name)])
    );

    const fridge: ScribeFridgeItem[] = (fridgeRows || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      quantity: roundQuantity(Number(row.quantity) || 0),
      unit: unitById.get(row.measurement_type_id as number) || ''
    }));

    const diet = await loadDietContext(supabase, user.id);

    const resolution = await resolveCookDeductions(
      String((recipe as any).title ?? 'Recipe'),
      ingredients,
      fridge,
      { diet: diet.diet, allergens: diet.allergens }
    );

    const fridgeById = new Map<string, ScribeFridgeItem>(
      fridge.map((item): [string, ScribeFridgeItem] => [item.id, item])
    );
    const deductions: DeductionLine[] = resolution.deductions
      .map((entry): DeductionLine | null => {
        const item = fridgeById.get(entry.fridgeItemId);
        if (!item) return null;
        return {
          fridgeItemId: item.id,
          name: item.name,
          unit: item.unit,
          before: item.quantity,
          deduct: entry.deduct,
          after: computeRemaining(item.quantity, entry.deduct),
          why: entry.why
        };
      })
      .filter((line): line is DeductionLine => line !== null);

    const plan: CookPlan = {
      recipeId: String((recipe as any).id),
      recipeTitle: String((recipe as any).title ?? 'Recipe'),
      deductions,
      unmatched: resolution.unmatched,
      question: resolution.question,
      skippedModel: resolution.skippedModel
    };

    return NextResponse.json({ plan });
  } catch (err: unknown) {
    console.error('Cook plan failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to work out what you used.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
