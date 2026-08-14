/**
 * Reading recipe ingredients into a structured shape.
 *
 * Recipes generated from 2026-08 onward store each ingredient as
 * `{ name, amount, unit }`. Everything saved before that used a single
 * free-text `quantity` string ("200 grams", "1/4 piece", "to taste").
 *
 * Both shapes are supported here, permanently and on read. There is no
 * migration: the old rows are a small, closed set, and a parser that falls back
 * is less risky than rewriting historical data. Callers get one shape and never
 * have to know which era a recipe came from.
 *
 * Nothing in this module calls a model. Reading a recipe is a copy job.
 */

import { parseQuantityString, roundAmount } from './units';

/** One ingredient line as stored in `recipes.ingredients` (either era). */
export interface StoredRecipeIngredient {
  name?: unknown;
  /** Structured form (current). */
  amount?: unknown;
  unit?: unknown;
  /** Free-text form (legacy, pre-2026-08). */
  quantity?: unknown;
}

export interface RecipeIngredient {
  name: string;
  /** Null when the recipe gives no measurable amount ("to taste", "a pinch"). */
  amount: number | null;
  /** Unit as written by the recipe; resolved against the database later. */
  unitToken: string | null;
  /** True when the amount came from a range and we took the midpoint. */
  approximated: boolean;
  /** What to show the user, preserving how the recipe actually phrased it. */
  display: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Trims float noise for display: 0.2 stays, 0.2000 doesn't, 2.0 becomes 2. */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(roundAmount(value));
}

/** Renders an ingredient the way a recipe would read it. */
export function formatIngredient(ingredient: RecipeIngredient): string {
  if (ingredient.display) return ingredient.display;
  if (ingredient.amount === null) return ingredient.name;
  const unit = ingredient.unitToken ? ` ${ingredient.unitToken}` : '';
  return `${formatAmount(ingredient.amount)}${unit}`.trim();
}

/**
 * Normalises one stored ingredient into the structured shape.
 *
 * Prefers the structured fields when present; otherwise parses the legacy
 * `quantity` string. Returns null only when there is no usable name — an
 * ingredient with no amount is still meaningful and is kept with `amount: null`.
 */
export function normalizeRecipeIngredient(
  stored: StoredRecipeIngredient | null | undefined
): RecipeIngredient | null {
  if (!stored || typeof stored !== 'object') return null;

  const name = typeof stored.name === 'string' ? stored.name.trim() : '';
  if (!name) return null;

  // Current shape: amount and unit as separate fields.
  const structuredAmount = toFiniteNumber(stored.amount);
  const structuredUnit =
    typeof stored.unit === 'string' && stored.unit.trim() ? stored.unit.trim() : null;

  if (structuredAmount !== null || structuredUnit !== null) {
    const display =
      structuredAmount !== null
        ? `${formatAmount(structuredAmount)}${structuredUnit ? ` ${structuredUnit}` : ''}`
        : structuredUnit ?? '';
    return {
      name,
      amount: structuredAmount,
      unitToken: structuredUnit,
      approximated: false,
      display: display.trim()
    };
  }

  // Legacy shape: one free-text string holding both.
  const rawQuantity =
    typeof stored.quantity === 'string'
      ? stored.quantity
      : stored.quantity !== null && stored.quantity !== undefined
        ? String(stored.quantity)
        : '';

  const parsed = parseQuantityString(rawQuantity);
  return {
    name,
    amount: parsed.amount,
    unitToken: parsed.unitToken,
    approximated: parsed.approximated,
    display: parsed.raw
  };
}

/**
 * Renders a normalised ingredient as one line: "200 grams potatoes".
 *
 * Guards against doubling the name when there is no measurable amount —
 * `formatIngredient` falls back to the name in that case, which would otherwise
 * produce "salt salt".
 */
export function describeRecipeIngredient(ingredient: RecipeIngredient): string {
  const quantity = formatIngredient(ingredient);
  return quantity && quantity !== ingredient.name
    ? `${quantity} ${ingredient.name}`
    : ingredient.name;
}

/**
 * Renders a stored ingredient as one line: "200 grams potatoes".
 *
 * The display helper for every surface that lists a recipe, so old free-text
 * rows and new structured ones read identically.
 */
export function formatStoredIngredient(stored: StoredRecipeIngredient | null | undefined): string {
  const normalized = normalizeRecipeIngredient(stored);
  if (!normalized) return '';
  const quantity = formatIngredient(normalized);
  return quantity && quantity !== normalized.name
    ? `${quantity} ${normalized.name}`
    : normalized.name;
}

/**
 * Amount and unit for a stored ingredient, for the shopping list.
 *
 * Falls back to a count of 1 with no unit when the recipe gives no measurable
 * amount, which is the sensible thing to put on a shopping list for "salt".
 */
export function storedIngredientQuantity(
  stored: StoredRecipeIngredient | null | undefined
): { quantity: number; unit: string } {
  const normalized = normalizeRecipeIngredient(stored);
  if (!normalized) return { quantity: 1, unit: '' };
  return {
    quantity: normalized.amount !== null && normalized.amount > 0 ? normalized.amount : 1,
    unit: normalized.unitToken ? normalized.unitToken.toLowerCase() : ''
  };
}

/** Normalises a whole `recipes.ingredients` array, dropping unusable entries. */
export function normalizeRecipeIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  const result: RecipeIngredient[] = [];
  for (const entry of raw) {
    const normalized = normalizeRecipeIngredient(entry as StoredRecipeIngredient);
    if (normalized) result.push(normalized);
  }
  return result;
}
