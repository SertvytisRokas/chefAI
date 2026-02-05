interface GenerateOptions {
  mealType?: string;
  portions?: number;
  /**
   * When true, the LLM may include a small number of ingredients
   * that are not present in the fridge. This is used for suggest
   * mode, where the user is open to buying additional ingredients.
   * Default is false (strict mode).
   */
  suggestMode?: boolean;
}

/**
 * Result of a recipe generation request. The schema should match whatever
 * the LLM is expected to return. dietType is classified by the same model
 * that generates the recipe (one of: vegan, vegetarian, pescatarian, omnivore).
 */
export interface RecipeResult {
  title: string;
  ingredients: {
    name: string;
    quantity: string;
  }[];
  steps: string[];
  /** Diet classification from the model: vegan | vegetarian | pescatarian | omnivore (optional if model omits) */
  dietType?: string;
}

import { embedText, retrieveSimilarRecipes } from './rag';
import { buildPersonalizationContext } from './personalization';
import type { PersonalizationAnswers } from './personalization';

/**
 * Constructs a prompt for the recipe LLM. It uses RAG to include the
 * most relevant recipe templates as examples. The model is instructed
 * to generate a recipe using only the available fridge items and to
 * respect the user's dietary restrictions, allergens, likes and
 * dislikes. If personalization is provided, portion sizes, goals,
 * and style are tailored to the user profile.
 */
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
  // Create a human‑readable list of the available ingredients with quantities
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
  /*
    When allowMissing is true (suggest mode), the model may include a
    small number of additional ingredients. We still direct it to
    prioritise using ingredients already in the fridge and to avoid
    recommending variants of ingredients that are effectively the same
    (e.g. red onion vs onion, arborio rice vs rice). In strict mode
    (allowMissing is false), we explicitly instruct the model not to
    introduce any ingredients outside those provided. If a classic
    recipe would normally use an unavailable ingredient, the model
    should adapt by using the closest available item (for example,
    using bread from the fridge and toasting it if the recipe calls
    for toast bread).
  */
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
 * Generates a recipe using a local Qwen 7B model with retrieval‑augmented
 * templates. It embeds the fridge contents, fetches the top templates,
 * constructs a prompt, and sends it to the model via the Ollama API.
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
  // Build a textual representation of the fridge for embedding
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
  const endpoint =
    process.env.LLM_MODEL_ENDPOINT || 'http://localhost:11434/api/generate';
  const modelName = process.env.LLM_MODEL_NAME || 'qwen2.5:7b-instruct';
  const body = {
    model: modelName,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.2
    }
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    throw new Error(`LLM request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  // For Ollama, the response field contains the raw response string
  const raw = data.response ?? data.choices?.[0]?.message?.content ?? '';
  // Logging for debugging: show the prompt and raw response. These logs
  // will be visible in the server console when running `pnpm dev` and
  // can help diagnose parsing errors.
  // eslint-disable-next-line no-console
  console.log('LLM prompt:', prompt);
  // eslint-disable-next-line no-console
  console.log('LLM raw response:', raw);
  // Extract JSON from the response (the model may include surrounding text)
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Failed to parse JSON recipe from LLM response');
  }
  let jsonString = raw.slice(jsonStart, jsonEnd + 1);
  // eslint-disable-next-line no-console
  console.log('Extracted JSON string:', jsonString);
  // Remove trailing commas before a closing bracket/brace to avoid
  // common JSON syntax errors. This regex replaces a comma followed
  // by optional whitespace and a closing bracket/brace with just the
  // closing bracket/brace.
  const cleanedJsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
  try {
    const recipe: RecipeResult = JSON.parse(cleanedJsonString);
    return recipe;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Error parsing JSON from LLM response:', err);
    // eslint-disable-next-line no-console
    console.error('Original JSON string:', jsonString);
    // eslint-disable-next-line no-console
    console.error('Cleaned JSON string:', cleanedJsonString);
    throw new Error(`Failed to parse JSON recipe: ${err.message}`);
  }
}

/**
 * Weekly plan structure returned by `generateWeeklyPlan`. Each day
 * contains a name (e.g., "Monday") and an array of meals. Each
 * meal includes its type (breakfast, lunch, dinner), a generated
 * recipe, and dietType classified by the model.
 */
export interface WeeklyMeal {
  day: string;
  meals: {
    mealType: string;
    title: string;
    ingredients: { name: string; quantity: string }[];
    steps: string[];
    /** Diet classification from the model: vegan | vegetarian | pescatarian | omnivore (optional if model omits) */
    dietType?: string;
  }[];
}

export interface WeeklyPlan {
  week: WeeklyMeal[];
}

/**
 * Generates a weekly meal plan using a local Qwen model. The plan
 * respects available fridge ingredients and user preferences. It
 * instructs the model not to propose meals that require buying many
 * extra ingredients. The plan covers seven days (Monday through
 * Sunday) and includes breakfast, lunch and dinner for each day.
 * The result is returned as a `WeeklyPlan` JSON object.
 */
export async function generateWeeklyPlan(
  fridge: Array<{ name: string; quantity: number; unit: string; expires?: string | null }>,
  preferences: {
    diet?: string;
    allergens?: string[];
    likes?: string[];
    dislikes?: string[];
  },
  // When true, the weekly planner may suggest a small number of
  // additional ingredients. Otherwise it will strictly use what is
  // available in the fridge. This corresponds to the suggestMode
  // checkbox in the UI.
  suggestMode: boolean = false,
  personalization?: PersonalizationAnswers | null
): Promise<WeeklyPlan> {
  const fridgeSummary = fridge.map((item) => item.name).join(', ');
  const queryEmbedding = await embedText(fridgeSummary);
  // Retrieve more templates to provide broad inspiration
  const templates = await retrieveSimilarRecipes(queryEmbedding, 5);
  // Build a prompt for weekly planning. Emphasise limited ingredients
  // and not buying many extras. The format of the desired JSON is
  // described to the model.
  const diet = preferences.diet ? `Diet: ${preferences.diet}.` : '';
  const allergens = preferences.allergens && preferences.allergens.length > 0
    ? `Avoid allergens: ${preferences.allergens.join(', ')}.`
    : '';
  const likes = preferences.likes && preferences.likes.length > 0
    ? `Likes: ${preferences.likes.join(', ')}.`
    : '';
  const dislikes = preferences.dislikes && preferences.dislikes.length > 0
    ? `Dislikes: ${preferences.dislikes.join(', ')}.`
    : '';
  const personalizationContext = buildPersonalizationContext(personalization);
  const personalizationBlock = personalizationContext
    ? `\n${personalizationContext} Adjust portion sizes and recipe style based on the user profile.\n`
    : '';
  const templatesText = templates
    .map((t) => `### Template: ${t.title}\n${t.content}`)
    .join('\n\n');
  // Choose whether to allow missing ingredients. If suggestMode is true,
  // we allow up to 30% of ingredients to be additional. Otherwise we
  // strictly prohibit missing items. We also instruct the model to
  // provide detailed multi-step instructions for each meal. Each step
  // should describe a single distinct action rather than combining
  // multiple actions. We discourage the use of generic phrases
  // such as "for each serving" and instead encourage the model to
  // explicitly refer to the number of portions. We also emphasise
  // that the instructions must be long enough to cover all important
  // actions; do not limit to three steps and break actions up as
  // necessary.
  const weeklyMissingInstruction = suggestMode
    ? 'You may include a small number of additional ingredients (no more than 30% of the total) if necessary to create a delicious meal. You must prioritise using the available ingredients and avoid suggesting ingredients that are very similar to existing ones (for example, avoid proposing red onion if you have onion or Arborio rice if you have rice).'
    : 'Use ONLY the ingredients provided. Do not hallucinate or invent additional ingredients. If a traditional recipe uses an ingredient you do not have, adapt the recipe to use a similar available ingredient (e.g., toast the bread you have instead of asking for toast bread).';
  const prompt = `You are an expert meal planner. ${weeklyMissingInstruction}\n` +
    `${diet} ${allergens} ${likes} ${dislikes}${personalizationBlock}\n` +
    `The available ingredients are: ${fridgeSummary}.\n` +
    `Create a seven‑day meal plan (Monday through Sunday) with breakfast, lunch and dinner each day.\n` +
    `The plan should prioritise using ingredients that will expire soon and avoid suggesting meals that require many additional ingredients.\n` +
    `Each meal should include clear, step-by-step instructions covering all key actions such as prepping, cooking and serving. Each step should describe a single distinct action and you must not compress multiple actions into one step. The instructions should be as long as necessary to cover all important actions — do not limit yourself to three steps. Avoid generic phrases like \"for each serving\"; instead tailor instructions to the number of portions.\n` +
    `Output JSON with a single key \"week\" which is an array of objects. Each object has a \"day\" string and a \"meals\" array. Each meal has \"mealType\" (breakfast, lunch, dinner), \"title\", \"ingredients\" (array of {name, quantity}), \"steps\" (array of strings), and \"dietType\" (string). For dietType of each meal you must choose exactly one of: vegan, vegetarian, pescatarian, omnivore — based on the ingredients and preparation of that meal (vegan: no animal products; vegetarian: may include dairy/eggs but no meat or fish; pescatarian: may include fish/seafood but no meat; omnivore: may include meat). Do not include any commentary outside the JSON.\n\n` +
    `Here are some similar recipes for inspiration:\n${templatesText}\n\nJSON:`;
  const endpoint = process.env.LLM_MODEL_ENDPOINT || 'http://localhost:11434/api/generate';
  const modelName = process.env.LLM_MODEL_NAME || 'qwen2.5:7b-instruct';
  const body = {
    model: modelName,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.2
    }
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    throw new Error(`LLM request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  const raw = data.response ?? data.choices?.[0]?.message?.content ?? '';
  // Debug logging
  // eslint-disable-next-line no-console
  console.log('Weekly plan prompt:', prompt);
  // eslint-disable-next-line no-console
  console.log('Weekly plan raw response:', raw);
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Failed to parse JSON weekly plan from LLM response');
  }
  let jsonString = raw.slice(jsonStart, jsonEnd + 1);
  // eslint-disable-next-line no-console
  console.log('Extracted weekly plan JSON:', jsonString);
  // Remove trailing commas before a closing bracket/brace to avoid
  // common JSON syntax errors.
  const cleanedJsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
  try {
    const plan: WeeklyPlan = JSON.parse(cleanedJsonString);
    return plan;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Error parsing weekly plan JSON:', err);
    // eslint-disable-next-line no-console
    console.error('Original JSON string:', jsonString);
    // eslint-disable-next-line no-console
    console.error('Cleaned JSON string:', cleanedJsonString);
    throw new Error(`Failed to parse weekly plan: ${err.message}`);
  }
}