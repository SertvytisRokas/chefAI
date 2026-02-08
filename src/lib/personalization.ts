/**
 * Types and constants for the personalization quiz. Stored in
 * user_personalization.answers (JSONB) and used by the recipe
 * generator to tailor portions, diet, cuisines, goals, etc.
 */

/** Diet type options (must match diet_types.name in DB; use pescatarian not pescetarian) */
export const DIET_TYPES = ['omnivore', 'vegetarian', 'pescatarian', 'vegan'] as const;
export type DietTypeOption = (typeof DIET_TYPES)[number];

export const GENDERS = ['male', 'female', 'other', 'prefer not to say'] as const;
export type GenderOption = (typeof GENDERS)[number];

export const ACTIVITY_LEVELS = ['minimal', 'low', 'medium', 'high', 'extreme'] as const;
export type ActivityLevelOption = (typeof ACTIVITY_LEVELS)[number];

export const DIETARY_LIFESTYLES = [
  'no specific lifestyle diet',
  'low-carb',
  'keto',
  'intermittent fasting',
  'high-protein',
  'other'
] as const;
export type DietaryLifestyleOption = (typeof DIETARY_LIFESTYLES)[number];

export const RELIGIOUS_RESTRICTIONS = [
  'Halal',
  'Kosher',
  'Fasting',
  'None',
  'Prefer not to say',
  'Other'
] as const;
export type ReligiousRestrictionOption = (typeof RELIGIOUS_RESTRICTIONS)[number];

export const PRIMARY_GOALS = [
  'weight loss',
  'weight maintenance',
  'weight gain',
  'build muscle',
  'eat more balanced',
  'improve cooking skills',
  'save money',
  'other'
] as const;
export type PrimaryGoalOption = (typeof PRIMARY_GOALS)[number];

export const MEAL_FREQUENCY_OPTIONS = [1, 2, 3, 4, 5] as const; // 5 = "5+"

export const CUISINE_OPTIONS = [
  'Italian',
  'Mexican',
  'French',
  'Chinese',
  'Indian',
  'Mediterranean',
  'Japanese',
  'Thai',
  'Middle Eastern',
  'American',
  'Greek',
  'Other'
] as const;

export const SPICE_LEVELS = ['zero tolerance', 'mild', 'medium', 'hot', 'flaming hot'] as const;
export type SpiceLevelOption = (typeof SPICE_LEVELS)[number];

export const FLAVOR_OPTIONS = [
  'savory',
  'sweet',
  'spicy',
  'salty',
  'sour',
  'bitter',
  'other'
] as const;

export const PROTEIN_OPTIONS = [
  'poultry',
  'eggs',
  'fish',
  'lentils',
  'chickpeas',
  'tofu',
  'soy',
  'other'
] as const;

export const COOKING_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'master chef'] as const;
export type CookingSkillOption = (typeof COOKING_SKILL_LEVELS)[number];

export const TIME_TO_COOK_OPTIONS = [
  '15 minutes',
  '30 minutes',
  '45 minutes',
  '1 hour',
  'more than 1 hour'
] as const;
export type TimeToCookOption = (typeof TIME_TO_COOK_OPTIONS)[number];

export const APPLIANCE_OPTIONS = [
  'oven',
  'stove',
  'microwave',
  'rice cooker',
  'air fryer',
  'blender',
  'grill',
  'other'
] as const;

export const GROCERY_FREQUENCY_OPTIONS = [
  'every day',
  '1-3 times a week',
  'once a week',
  'less than once a week'
] as const;
export type GroceryFrequencyOption = (typeof GROCERY_FREQUENCY_OPTIONS)[number];

export const BUDGET_OPTIONS = [
  'Very – prefer low-cost ingredients',
  'Somewhat – a balance',
  'Not at all – any ingredients are fine'
] as const;
export type BudgetOption = (typeof BUDGET_OPTIONS)[number];

/** Full personalization answers shape. All fields optional for partial save. */
export interface PersonalizationAnswers {
  // 1. Physical & Body Profile (heightValue always cm, weightValue always kg; unit is display only)
  age?: number | 'prefer not to say' | null;
  gender?: GenderOption | null;
  heightValue?: number | null; // always stored in cm
  heightUnit?: 'cm' | 'ft' | null;
  weightValue?: number | null; // always stored in kg
  weightUnit?: 'kg' | 'lbs' | null;
  activityLevel?: ActivityLevelOption | null;
  activityLevelValue?: number | null; // 0-100 for smooth slider; derived from activityLevel if missing

  // 2. Dietary Preferences & Restrictions
  dietType?: DietTypeOption | null;
  dietaryLifestyle?: (DietaryLifestyleOption | string)[] | null; // "other" can add freeform
  dietaryLifestyleOther?: string | null;
  religiousRestrictions?: (ReligiousRestrictionOption | string)[] | null;
  religiousRestrictionsOther?: string | null;
  allergens?: string[] | null;

  // 3. Health & Wellness Goals (weightGoalValue always kg; primaryGoals max 3)
  primaryGoals?: string[] | null; // max 3: from PRIMARY_GOALS or custom "other"
  weightGoalValue?: number | null; // always stored in kg
  weightGoalUnit?: 'kg' | 'lbs' | null;
  dailyCalorieTarget?: number | null;
  mealFrequency?: number | null; // 1-5, 5 means 5+

  // 4. Taste & Cuisine Preferences
  favoriteCuisines?: (string)[] | null;
  favoriteCuisinesOther?: string[] | null;
  cuisinesToLimit?: (string)[] | null;
  cuisinesToLimitOther?: string[] | null;
  spiceLevel?: SpiceLevelOption | null;
  spiceLevelValue?: number | null; // 0-100 for smooth slider
  flavorPreferences?: (string)[] | null;
  flavorPreferencesOther?: string[] | null;
  preferredProteins?: (string)[] | null; // can include "other" freeform entries
  favoriteIngredientsDishes?: string[] | null; // array of freeform strings

  // 5. Cooking & Lifestyle Habits
  cookingSkillLevel?: CookingSkillOption | null;
  cookingSkillLevelValue?: number | null; // 0-100 for smooth slider
  timeToCook?: TimeToCookOption | null;
  kitchenAppliances?: (string)[] | null;
  kitchenAppliancesOther?: string[] | null; // "other" freeform list
  groceryFrequency?: GroceryFrequencyOption | null;
  budgetSensitivity?: BudgetOption | null;
}

/** Empty/default answers for initial state */
export const DEFAULT_PERSONALIZATION: PersonalizationAnswers = {};

/**
 * Builds a short context string from personalization answers for the LLM prompt.
 * Used to tailor portion sizes, diet, goals, cuisines, time, and budget.
 */
export function buildPersonalizationContext(p: PersonalizationAnswers | null | undefined): string {
  if (!p || typeof p !== 'object') return '';
  const parts: string[] = [];
  if (p.age != null && p.age !== 'prefer not to say') parts.push(`age ${p.age}`);
  if (p.gender) parts.push(`gender ${p.gender}`);
  if (p.heightValue != null) parts.push(`height ${Math.round(p.heightValue)} cm`);
  if (p.weightValue != null) parts.push(`weight ${Math.round(p.weightValue * 10) / 10} kg`);
  if (p.activityLevel) parts.push(`activity level ${p.activityLevel}`);
  if (p.dietType) parts.push(`diet ${p.dietType}`);
  if (Array.isArray(p.dietaryLifestyle) && p.dietaryLifestyle.length) parts.push(`lifestyle diet: ${p.dietaryLifestyle.join(', ')}`);
  if (p.dietaryLifestyleOther) parts.push(`lifestyle other: ${p.dietaryLifestyleOther}`);
  if (Array.isArray(p.religiousRestrictions) && p.religiousRestrictions.length) parts.push(`religious/cultural: ${p.religiousRestrictions.join(', ')}`);
  if (p.religiousRestrictionsOther) parts.push(`religious other: ${p.religiousRestrictionsOther}`);
  if (Array.isArray(p.allergens) && p.allergens.length) parts.push(`allergens to avoid: ${p.allergens.join(', ')}`);
  const goals = Array.isArray(p.primaryGoals) ? p.primaryGoals : (p as any).primaryGoal ? [(p as any).primaryGoal] : [];
  if (goals.length) parts.push(`goals: ${goals.join(', ')}`);
  if (p.weightGoalValue != null) parts.push(`target weight ${Math.round(p.weightGoalValue * 10) / 10} kg`);
  if (p.dailyCalorieTarget != null) parts.push(`daily calorie target ${p.dailyCalorieTarget} kcal`);
  if (p.mealFrequency != null) parts.push(`meals per day ${p.mealFrequency === 5 ? '5+' : p.mealFrequency}`);
  if (Array.isArray(p.favoriteCuisines) && p.favoriteCuisines.length) parts.push(`favorite cuisines: ${p.favoriteCuisines.join(', ')}`);
  if (Array.isArray(p.favoriteCuisinesOther) && p.favoriteCuisinesOther.length) parts.push(`favorite cuisines other: ${p.favoriteCuisinesOther.join(', ')}`);
  if (Array.isArray(p.cuisinesToLimit) && p.cuisinesToLimit.length) parts.push(`cuisines to limit: ${p.cuisinesToLimit.join(', ')}`);
  if (Array.isArray(p.cuisinesToLimitOther) && p.cuisinesToLimitOther.length) parts.push(`cuisines to limit other: ${p.cuisinesToLimitOther.join(', ')}`);
  if (p.spiceLevel) parts.push(`spice level ${p.spiceLevel}`);
  if (Array.isArray(p.flavorPreferences) && p.flavorPreferences.length) parts.push(`flavor preferences: ${p.flavorPreferences.join(', ')}`);
  if (Array.isArray(p.flavorPreferencesOther) && p.flavorPreferencesOther.length) parts.push(`flavor other: ${p.flavorPreferencesOther.join(', ')}`);
  if (Array.isArray(p.preferredProteins) && p.preferredProteins.length) parts.push(`preferred proteins: ${p.preferredProteins.join(', ')}`);
  if (Array.isArray(p.favoriteIngredientsDishes) && p.favoriteIngredientsDishes.length) parts.push(`favorite ingredients/dishes: ${p.favoriteIngredientsDishes.join(', ')}`);
  if (p.cookingSkillLevel) parts.push(`cooking skill ${p.cookingSkillLevel}`);
  if (p.timeToCook) parts.push(`time to cook per meal: ${p.timeToCook}`);
  if (Array.isArray(p.kitchenAppliances) && p.kitchenAppliances.length) parts.push(`appliances: ${p.kitchenAppliances.join(', ')}`);
  if (Array.isArray(p.kitchenAppliancesOther) && p.kitchenAppliancesOther.length) parts.push(`appliances other: ${p.kitchenAppliancesOther.join(', ')}`);
  if (p.groceryFrequency) parts.push(`grocery frequency ${p.groceryFrequency}`);
  if (p.budgetSensitivity) parts.push(`budget: ${p.budgetSensitivity}`);
  if (parts.length === 0) return '';
  return `User profile (use to adjust portions, calories, and recipe style): ${parts.join('. ')}.`;
}

/**
 * Builds diet, allergens, likes, dislikes from personalization for the recipe generator.
 * Use when user has saved personalization; otherwise fall back to profiles + user_allergens + user_preferences.
 */
export function preferencesFromPersonalization(p: PersonalizationAnswers | null | undefined): {
  diet?: string;
  allergens: string[];
  likes: string[];
  dislikes: string[];
} {
  if (!p || typeof p !== 'object') return { allergens: [], likes: [], dislikes: [] };
  const diet = p.dietType ?? undefined;
  const allergens = Array.isArray(p.allergens) ? p.allergens.filter(Boolean) : [];
  const likes = [
    ...(Array.isArray(p.favoriteIngredientsDishes) ? p.favoriteIngredientsDishes : []),
    ...(Array.isArray(p.preferredProteins) ? p.preferredProteins : []),
    ...(Array.isArray(p.favoriteCuisines) ? p.favoriteCuisines.filter((c) => c !== 'Other') : []),
    ...(Array.isArray(p.favoriteCuisinesOther) ? p.favoriteCuisinesOther : [])
  ].filter(Boolean);
  const dislikes = [
    ...(Array.isArray(p.cuisinesToLimit) ? p.cuisinesToLimit.filter(Boolean) : []),
    ...(Array.isArray(p.cuisinesToLimitOther) ? p.cuisinesToLimitOther : [])
  ].filter(Boolean);
  return { diet, allergens, likes, dislikes };
}
