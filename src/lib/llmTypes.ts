/**
 * Shared types for recipe / weekly generation responses (safe to import from client).
 */

export interface RecipeResult {
  title: string;
  ingredients: {
    name: string;
    quantity: string;
  }[];
  steps: string[];
  dietType?: string;
}

export interface WeeklyMeal {
  day: string;
  meals: {
    mealType: string;
    title: string;
    ingredients: { name: string; quantity: string }[];
    steps: string[];
    dietType?: string;
  }[];
}

export interface WeeklyPlan {
  week: WeeklyMeal[];
}
