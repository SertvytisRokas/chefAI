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

  const personalizationBlock = personalizationContext
    ? `\n${personalizationContext} Adjust portion sizes and calories based on the user profile when relevant.\n`
    : '';

  return `You are an expert chef. ${missingInstruction}
${diet} ${allergens} ${likes} ${dislikes}${personalizationBlock}
The available ingredients are: ${ingredientsList}.
Generate a ${mealText} recipe for ${portionText}. Provide very detailed, step-by-step instructions that fully describe the preparation and cooking process. Each step should focus on one distinct action (for example: chopping, mixing, preheating, cooking, assembling or serving) and you must not compress multiple actions into a single step. The instructions should be as long as necessary to cover all important actions — do not limit yourself to three steps. Avoid generic phrases such as "for each serving"; instead, write instructions that explicitly refer to the specified number of portions and the actual actions to perform.
Format your response as JSON with the keys: title (string), ingredients (array of objects with "name" and "quantity" fields), steps (array of strings), and dietType (string). For dietType you must choose exactly one of: vegan, vegetarian, pescatarian, omnivore — based on the ingredients and preparation of this recipe (vegan: no animal products; vegetarian: may include dairy/eggs but no meat or fish; pescatarian: may include fish/seafood but no meat; omnivore: may include meat). The JSON must be strictly valid (no trailing commas) and use double quotes for all keys and string values. Do not include any commentary outside the JSON.

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
    : '';
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
    `Each meal should include clear, step-by-step instructions covering all key actions such as prepping, cooking and serving. Each step should describe a single distinct action and you must not compress multiple actions into one step. The instructions should be as long as necessary to cover all important actions — do not limit yourself to three steps. Avoid generic phrases like \"for each serving\"; instead tailor instructions to the number of portions.\n` +
    `Output JSON with a single key \"week\" which is an array of objects. Each object has a \"day\" string and a \"meals\" array. Each meal has \"mealType\" (breakfast, lunch, dinner), \"title\", \"ingredients\" (array of {name, quantity}), \"steps\" (array of strings), and \"dietType\" (string). For dietType of each meal you must choose exactly one of: vegan, vegetarian, pescatarian, omnivore — based on the ingredients and preparation of that meal (vegan: no animal products; vegetarian: may include dairy/eggs but no meat or fish; pescatarian: may include fish/seafood but no meat; omnivore: may include meat). Do not include any commentary outside the JSON.\n\n` +
    `Here are some similar recipes for inspiration:\n${templatesText}\n\nJSON:`;

  const raw = await openRouterChatCompletion('weekly', prompt, 0.2);
  return parseJsonFromModelResponse<WeeklyPlan>(raw, 'weekly plan');
}
