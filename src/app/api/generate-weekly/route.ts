import { NextResponse } from 'next/server';
import { generateWeeklyPlan } from '../../../lib/llmProvider';

/**
 * API route for generating a weekly meal plan on the server (OpenRouter + RAG).
 */
export async function POST(request: Request) {
  const { fridge, preferences, suggestMode, personalization } = await request.json();
  try {
    const plan = await generateWeeklyPlan(
      fridge,
      preferences,
      suggestMode === true,
      personalization ?? null
    );
    return NextResponse.json({ plan });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Failed to generate weekly plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
