/**
 * Shared types for recipe / weekly generation responses (safe to import from client).
 */

/**
 * One ingredient line as it comes back from the model and is stored in
 * `recipes.ingredients`.
 *
 * Current shape is `{ name, amount, unit }` — separate fields, so reading a
 * recipe back is a copy job rather than prose parsing. `quantity` is the legacy
 * free-text field ("200 grams") kept for recipes saved before 2026-08; it is
 * still read, never written. Use `normalizeRecipeIngredients` in
 * `src/lib/recipeIngredients.ts` rather than touching these fields directly.
 */
export interface RecipeIngredientPayload {
  name: string;
  /** Numeric amount. Null or absent when the recipe says "to taste". */
  amount?: number | string | null;
  /** Unit as the recipe writes it: "grams", "cloves", "tbsp". */
  unit?: string | null;
  /** @deprecated Legacy free-text quantity. Read-only, for old rows. */
  quantity?: string | null;
}

export interface RecipeResult {
  title: string;
  ingredients: RecipeIngredientPayload[];
  steps: string[];
  dietType?: string;
}

export interface WeeklyMeal {
  day: string;
  meals: {
    mealType: string;
    title: string;
    ingredients: RecipeIngredientPayload[];
    steps: string[];
    dietType?: string;
  }[];
}

export interface WeeklyPlan {
  week: WeeklyMeal[];
}
