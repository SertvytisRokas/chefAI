import 'server-only';

import { embedText, retrieveSimilarRecipes } from './rag';
import { buildPersonalizationContext } from './personalization';
import type { PersonalizationAnswers } from './personalization';
import { openRouterChatCompletion, parseJsonFromModelResponse } from './openrouter';
import type { RecipeResult, WeeklyPlan } from './llmTypes';

export type { RecipeResult, WeeklyMeal, WeeklyPlan } from './llmTypes';

interface GenerateOptions {
  mealType?: string;
  portions?: number;
  suggestMode?: boolean;
}

function buildPrompt(
  fridge: Array<{ name: string; quantity: number; unit: string; expires?: string | null }>,
  preferences: {
    diet?: string;
    allergens?: string[];
    likes?: string[];
    dislikes?: string[];
  },
  options: GenerateOptions,
  templates: { title: string; content: string }[],
  allowMissing: boolean = false,
  personalization?: PersonalizationAnswers | null
): string {
  const ingredientsList = fridge
    .map((item) => `${item.quantity} ${item.unit} ${item.name}`)
    .join(', ');
  const diet = preferences.diet ? `Diet: ${preferences.diet}.` : '';
  const allergens =
    preferences.allergens && preferences.allergens.length > 0
      ? `Avoid allergens: ${preferences.allergens.join(', ')}.`
      : '';
  const likes =
    preferences.likes && preferences.likes.length > 0
      ? `Likes: ${preferences.likes.join(', ')}.`
      : '';
  const dislikes =
    preferences.dislikes && preferences.dislikes.length > 0
      ? `Dislikes: ${preferences.dislikes.join(', ')}.`
      : '';
  const portionText = options.portions ? `${options.portions} portion(s)` : '';
  const mealText = options.mealType ? `${options.mealType}` : 'meal';
  const personalizationContext = buildPersonalizationContext(personalization);
  const templatesText = templates
    .map((t) => `### Template: ${t.title}\n${t.content}`)
    .join('\n\n');

  const missingInstruction = allowMissing
    ? 'You may include a small number of additional ingredients (no more than 30% of the total) if necessary to create a delicious meal. You must prioritise using the available ingredients and avoid suggesting ingredients that are very similar to existing ones (for example, avoid proposing red onion if you have onion or Arborio rice if you have rice).'
    : 'Use ONLY the ingredients provided. Do not hallucinate or invent additional ingredients. If a traditional recipe uses an ingredient you do not have, adapt the recipe to use a similar available ingredient (e.g., toast the bread you have instead of asking for toast bread).';

  // With no saved profile the model has no anchor for how much food a person
  // eats, and free models drift toward large, elaborate dishes. Give it one.
  const personalizationBlock = personalizationContext
    ? `\n${personalizationContext} Adjust portion sizes and calories based on the user profile when relevant.\n`
    : '\nNo user profile is saved. Use normal, realistic portions for one average adult per serving, and keep the dish to something an ordinary home cook would actually make on a weekday.\n';

  return `You are an expert chef. ${missingInstruction}
${diet} ${allergens} ${likes} ${dislikes}${personalizationBlock}
The available ingredients are: ${ingredientsList}.
Generate a ${mealText} recipe for ${portionText}.

Instructions — aim for the balance a good recipe book strikes:
- Use 5 to 9 steps for a simple dish. Only a genuinely complex dish should go higher, and never write more than 12 steps.
- Each step is one distinct action. Do not merge several actions into one step.
- Do not pad the count. Omit obvious or trivial steps entirely ("wash the vegetables", "gather your ingredients", "clean the mushrooms") — fold them into the step that uses them.
- Keep each step to one or two sentences, and state times and temperatures where they matter.
- Prefer the straightforward version of a dish over an elaborate one unless the user asked for elaborate.

Write quantities for exactly ${portionText}. Avoid generic phrases such as "for each serving".
Format your response as JSON with the keys: title (string), ingredients (array), steps (array of strings), and dietType (string).

Each ingredient is an object with three separate fields:
- "name": the ingredient alone, with no amount in it. "potatoes", not "200g potatoes".
- "amount": a NUMBER, never a string, never a range, never a fraction like "1/2" — write 0.5. Use null only when the recipe genuinely has no measurable amount, as with salt to taste.
- "unit": the unit as a string, e.g. "grams", "ml", "pieces", "tbsp", "cloves". Use null when amount is null.

Example of a correct ingredients array:
[{"name":"potatoes","amount":200,"unit":"grams"},{"name":"garlic","amount":2,"unit":"cloves"},{"name":"salt","amount":null,"unit":null}]

Keeping the number separate from the unit is required — the app does arithmetic on these values, and an amount buried in text cannot be used.

For dietType you must choose exactly one of: vegan, vegetarian, pescatarian, omnivore — based on the ingredients and preparation of this recipe (vegan: no animal products; vegetarian: may include dairy/eggs but no meat or fish; pescatarian: may include fish/seafood but no meat; omnivore: may include meat). The JSON must be strictly valid (no trailing commas) and use double quotes for all keys and string values. Do not include any commentary outside the JSON.

Here are some similar recipes for inspiration:
${templatesText}

JSON:`;
}

/**
 * Generates a recipe with retrieval-augmented templates via OpenRouter.
 */
export async function generateRecipe(
  fridge: Array<{ name: string; quantity: number; unit: string; expires?: string | null }>,
  preferences: {
    diet?: string;
    allergens?: string[];
    likes?: string[];
    dislikes?: string[];
  },
  options: GenerateOptions = {},
  personalization?: PersonalizationAnswers | null
): Promise<RecipeResult> {
  const fridgeSummary = fridge.map((item) => item.name).join(', ');
  const queryEmbedding = await embedText(fridgeSummary);
  const templates = await retrieveSimilarRecipes(queryEmbedding, 3);
  const prompt = buildPrompt(
    fridge,
    preferences,
    options,
    templates.map((t) => ({ title: t.title, content: t.content })),
    options.suggestMode === true,
    personalization
  );

  const raw = await openRouterChatCompletion('recipe', prompt, 0.2);
  return parseJsonFromModelResponse<RecipeResult>(raw, 'recipe');
}

/**
 * Generates a weekly meal plan with retrieval-augmented templates via OpenRouter.
 */
export async function generateWeeklyPlan(
  fridge: Array<{ name: string; quantity: number; unit: string; expires?: string | null }>,
  preferences: {
    diet?: string;
    allergens?: string[];
    likes?: string[];
    dislikes?: string[];
  },
  suggestMode: boolean = false,
  personalization?: PersonalizationAnswers | null
): Promise<WeeklyPlan> {
  const fridgeSummary = fridge.map((item) => item.name).join(', ');
  const queryEmbedding = await embedText(fridgeSummary);
  const templates = await retrieveSimilarRecipes(queryEmbedding, 5);

  const diet = preferences.diet ? `Diet: ${preferences.diet}.` : '';
  const allergens =
    preferences.allergens && preferences.allergens.length > 0
      ? `Avoid allergens: ${preferences.allergens.join(', ')}.`
      : '';
  const likes =
    preferences.likes && preferences.likes.length > 0
      ? `Likes: ${preferences.likes.join(', ')}.`
      : '';
  const dislikes =
    preferences.dislikes && preferences.dislikes.length > 0
      ? `Dislikes: ${preferences.dislikes.join(', ')}.`
      : '';
  const personalizationContext = buildPersonalizationContext(personalization);
  const personalizationBlock = personalizationContext
    ? `\n${personalizationContext} Adjust portion sizes and recipe style based on the user profile.\n`
    : '\nNo user profile is saved. Use normal, realistic portions for one average adult per serving, and keep meals to what an ordinary home cook would make on a weekday.\n';
  const templatesText = templates
    .map((t) => `### Template: ${t.title}\n${t.content}`)
    .join('\n\n');

  const weeklyMissingInstruction = suggestMode
    ? 'You may include a small number of additional ingredients (no more than 30% of the total) if necessary to create a delicious meal. You must prioritise using the available ingredients and avoid suggesting ingredients that are very similar to existing ones (for example, avoid proposing red onion if you have onion or Arborio rice if you have rice).'
    : 'Use ONLY the ingredients provided. Do not hallucinate or invent additional ingredients. If a traditional recipe uses an ingredient you do not have, adapt the recipe to use a similar available ingredient (e.g., toast the bread you have instead of asking for toast bread).';

  const prompt =
    `You are an expert meal planner. ${weeklyMissingInstruction}\n` +
    `${diet} ${allergens} ${likes} ${dislikes}${personalizationBlock}\n` +
    `The available ingredients are: ${fridgeSummary}.\n` +
    `Create a seven‑day meal plan (Monday through Sunday) with breakfast, lunch and dinner each day.\n` +
    `The plan should prioritise using ingredients that will expire soon and avoid suggesting meals that require many additional ingredients.\n` +
    `Each meal needs clear step-by-step instructions. Because this response covers 21 meals, keep every meal tight: 4 to 7 steps, never more than 8. Each step is one distinct action — do not merge several actions into one step, and do not pad with trivial steps like "wash the vegetables" or "gather your ingredients". One or two sentences per step. Avoid generic phrases like \"for each serving\"; tailor instructions to the number of portions.\n` +
    `Output JSON with a single key \"week\" which is an array of objects. Each object has a \"day\" string and a \"meals\" array. Each meal has \"mealType\" (breakfast, lunch, dinner), \"title\", \"ingredients\", \"steps\" (array of strings), and \"dietType\" (string).\n` +
    `Each ingredient is an object with three separate fields: \"name\" (the ingredient alone, no amount inside it), \"amount\" (a NUMBER — write 0.5, never \"1/2\", never a range, and null only when there is no measurable amount such as salt to taste), and \"unit\" (a string such as \"grams\", \"ml\", \"pieces\", \"cloves\"; null when amount is null). Example: [{\"name\":\"rice\",\"amount\":300,\"unit\":\"grams\"},{\"name\":\"garlic\",\"amount\":2,\"unit\":\"cloves\"}]. The app does arithmetic on these numbers, so an amount buried in text is unusable.\n` +
    `For dietType of each meal you must choose exactly one of: vegan, vegetarian, pescatarian, omnivore — based on the ingredients and preparation of that meal (vegan: no animal products; vegetarian: may include dairy/eggs but no meat or fish; pescatarian: may include fish/seafood but no meat; omnivore: may include meat). Do not include any commentary outside the JSON.\n\n` +
    `Here are some similar recipes for inspiration:\n${templatesText}\n\nJSON:`;

  const raw = await openRouterChatCompletion('weekly', prompt, 0.2);
  return parseJsonFromModelResponse<WeeklyPlan>(raw, 'weekly plan');
}
