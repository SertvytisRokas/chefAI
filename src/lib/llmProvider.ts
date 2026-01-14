import { cache } from 'react';

interface GenerateOptions {
  mealType?: string;
  portions?: number;
}

/**
 * Result of a recipe generation request. The schema should match whatever
 * the LLM is expected to return. For now it's a simple structure with a
 * title, list of ingredients, and preparation steps.
 */
export interface RecipeResult {
  title: string;
  ingredients: {
    name: string;
    quantity: string;
  }[];
  steps: string[];
}

import { embedText, retrieveSimilarRecipes } from './rag';

/**
 * Constructs a prompt for the recipe LLM. It uses RAG to include the
 * most relevant recipe templates as examples. The model is instructed
 * to generate a recipe using only the available fridge items and to
 * respect the user's dietary restrictions, allergens, likes and
 * dislikes. The output must be valid JSON conforming to the
 * RecipeResult schema.
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
  templates: { title: string; content: string }[]
): string {
  const ingredientsList = fridge
    .map((item) => `${item.quantity} ${item.unit} ${item.name}`)
    .join(', ');
  const diet = preferences.diet ? `Diet: ${preferences.diet}.` : '';
  const allergens = preferences.allergens && preferences.allergens.length > 0 ? `Avoid allergens: ${preferences.allergens.join(', ')}.` : '';
  const likes = preferences.likes && preferences.likes.length > 0 ? `Likes: ${preferences.likes.join(', ')}.` : '';
  const dislikes = preferences.dislikes && preferences.dislikes.length > 0 ? `Dislikes: ${preferences.dislikes.join(', ')}.` : '';
  const portionText = options.portions ? `${options.portions} portion(s)` : '';
  const mealText = options.mealType ? `${options.mealType}` : 'meal';
  const templatesText = templates
    .map((t) => `### Template: ${t.title}\n${t.content}`)
    .join('\n\n');
  return `You are an expert chef. Use ONLY the ingredients provided. Do not hallucinate additional ingredients.
${diet} ${allergens} ${likes} ${dislikes}
The available ingredients are: ${ingredientsList}.
Generate a ${mealText} recipe for ${portionText}. Format your response as JSON with keys: title (string), ingredients (array of objects with name and quantity), and steps (array of strings). Do not include any commentary outside the JSON.

Here are some similar recipes for inspiration:
${templatesText}

JSON:`;
}

/**
 * Generates a recipe using a local Qwen 7B model with retrieval-augmented
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
  options: GenerateOptions = {}
): Promise<RecipeResult> {
  // Build a textual representation of the fridge for embedding
  const fridgeSummary = fridge.map((item) => item.name).join(', ');
  const queryEmbedding = await embedText(fridgeSummary);
  const templates = await retrieveSimilarRecipes(queryEmbedding, 3);
  const prompt = buildPrompt(
    fridge,
    preferences,
    options,
    templates.map((t) => ({ title: t.title, content: t.content }))
  );
  const endpoint = process.env.LLM_MODEL_ENDPOINT || 'http://localhost:11434/api/generate';
  const modelName = process.env.LLM_MODEL_NAME || 'qwen:7b';
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
  // Extract JSON from the response (the model may include surrounding text)
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Failed to parse JSON recipe from LLM response');
  }
  const jsonString = raw.slice(jsonStart, jsonEnd + 1);
  const recipe: RecipeResult = JSON.parse(jsonString);
  return recipe;
}