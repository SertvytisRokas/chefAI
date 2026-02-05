import { NextResponse } from 'next/server';
import { generateRecipe } from '../../../lib/llmProvider';
import { supabaseServer } from '../../../lib/supabase/server';

/**
 * API route for generating recipes on the server side. It accepts a JSON
 * body with fridge contents, user preferences, and optional options.
 * The handler calls the LLM provider and, if the user is signed in,
 * records the generated recipe in the database.
 */
export async function POST(request: Request) {
  const { fridge, preferences, options, personalization } = await request.json();
  try {
    const recipe = await generateRecipe(fridge, preferences, options, personalization ?? null);
    // Save recipe in the database if the user is signed in
    const supabase = await supabaseServer();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    let recipeId: number | null = null;
    if (user) {
      // Determine if a recipe with the same title already exists for this user.
      const { data: existing } = await supabase
        .from('recipes')
        .select('id')
        .eq('user_id', user.id)
        .ilike('title', recipe.title)
        .maybeSingle();
      if (existing && 'id' in existing) {
        recipeId = (existing as any).id;
      } else {
        // Use the diet type classified by the same LLM that generated the recipe.
        // Normalize to lowercase and only accept known diet type names.
        const knownDiets = ['vegan', 'vegetarian', 'pescatarian', 'omnivore'];
        const dietName =
          recipe.dietType && typeof recipe.dietType === 'string'
            ? recipe.dietType.trim().toLowerCase()
            : '';
        const validDietName = knownDiets.includes(dietName) ? dietName : null;
        let dietTypeId: number | null = null;
        if (validDietName) {
          const { data: dietTypeRow } = await supabase
            .from('diet_types')
            .select('id')
            .eq('name', validDietName)
            .maybeSingle();
          if (dietTypeRow && 'id' in dietTypeRow) {
            dietTypeId = (dietTypeRow as any).id;
          }
        }
        // Determine meal_type_id if options.mealType is provided
        let mealTypeId: number | null = null;
        if (options && options.mealType) {
          const { data: mType } = await supabase
            .from('meal_types')
            .select('id')
            .eq('name', options.mealType)
            .maybeSingle();
          if (mType && 'id' in mType) mealTypeId = (mType as any).id;
        }
        const { data: inserted, error: insertError } = await supabase
          .from('recipes')
          .insert({
            user_id: user.id,
            title: recipe.title,
            meal_type_id: mealTypeId,
            ingredients: recipe.ingredients,
            steps: recipe.steps,
            diet_type_id: dietTypeId
          })
          .select('id');
        if (!insertError && inserted && inserted.length > 0) {
          recipeId = inserted[0].id as number;
        } else if (insertError) {
          console.error('Error inserting recipe:', insertError.message);
        }
      }
    }
    return NextResponse.json({ recipe, id: recipeId });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate recipe' },
      { status: 500 }
    );
  }
}