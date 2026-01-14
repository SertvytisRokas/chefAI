import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '../../../lib/types';
import { generateRecipe } from '../../../lib/llmProvider';

/**
 * API route for generating recipes on the server side. It accepts a JSON
 * body with fridge contents, user preferences, and optional options.
 * The handler calls the LLM provider and, if the user is signed in,
 * records the generated recipe in the database.
 */
export async function POST(request: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const body = await request.json();
  const { fridge, preferences, options } = body;
  try {
    const recipe = await generateRecipe(fridge, preferences, options);
    // Save recipe in the database if user session exists
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from('recipes').insert({
        user_id: session.user.id,
        title: recipe.title,
        meal_type_id: null,
        ingredients: recipe.ingredients,
        steps: recipe.steps
      });
    }
    return NextResponse.json(recipe);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || 'Failed to generate recipe' }, { status: 500 });
  }
}