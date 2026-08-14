import 'server-only';

import type { DeductionLine, UnresolvedLine } from './cookTypes';
import type { IngredientStandard, StandardsIndex } from './ingredientStandards';
import { canonicalUnitFor, convertSubUnit, findStandard, normalizeIngredientName } from './ingredientStandards';
import { describeRecipeIngredient, normalizeRecipeIngredients } from './recipeIngredients';
import type { RecipeIngredient } from './recipeIngredients';
import { linkIngredientsToFridge } from './scribe';
import type { ScribeDietContext } from './scribe';
import type { MeasurementType } from './units';
import { convertAmount, dimensionOf, resolveUnitToken, roundAmount, unitLabel } from './units';

/**
 * Turns "I cooked this" into a deduction plan.
 *
 * This is the layered design that replaced the single do-everything model call:
 *
 *   1. Read the recipe            -- copy job      (recipeIngredients.ts)
 *   2. Match names                -- dictionary first, model only for leftovers
 *   3. Convert units              -- arithmetic    (units.ts, ingredientStandards.ts)
 *   4. Subtract and write         -- arithmetic    (executor.ts)
 *
 * The model is reached in step 2 and only for lines the dictionary could not
 * settle. It never sees an amount, so it cannot get one wrong. Every step that
 * *can* be deterministic *is* deterministic, and anything that cannot be
 * resolved is reported with a reason instead of being guessed at.
 */

/** A fridge row joined with everything we know about it. */
export interface FridgeEntry {
  id: string;
  name: string;
  quantity: number;
  measurementType: MeasurementType | null;
  standard: IngredientStandard | null;
}

export interface CookPlanInput {
  recipeTitle: string;
  /** Raw `recipes.ingredients` JSONB, either era. */
  storedIngredients: unknown;
  fridge: FridgeEntry[];
  measurementTypes: MeasurementType[];
  standards: StandardsIndex;
  diet?: ScribeDietContext;
}

export interface CookPlanResult {
  deductions: DeductionLine[];
  unresolved: UnresolvedLine[];
  skippedModel: boolean;
}

/** A recipe line paired with the fridge entry we believe it refers to. */
interface MatchedPair {
  ingredient: RecipeIngredient;
  entry: FridgeEntry;
  source: 'exact' | 'standard' | 'model';
}

/**
 * Works out how much of `entry` the recipe line consumes, in the fridge item's
 * own unit.
 *
 * Returns a reason string instead of a number whenever the conversion is not
 * defined. Refusing is always correct here: a wrong conversion is an
 * order-of-magnitude error applied to real inventory.
 */
function resolveDeductionAmount(
  ingredient: RecipeIngredient,
  entry: FridgeEntry,
  measurementTypes: MeasurementType[]
): { amount: number; why: string } | { error: string } {
  if (ingredient.amount === null) {
    return { error: 'the recipe gives no measurable amount' };
  }
  if (ingredient.amount <= 0) {
    return { error: 'the recipe amount is zero' };
  }

  const targetUnit = entry.measurementType;
  if (!targetUnit) {
    return { error: `"${entry.name}" has no unit set in your fridge` };
  }

  const targetLabel = unitLabel(targetUnit);
  const standard = entry.standard;

  // 1. Sub-unit first: "2 cloves" against garlic held as whole bulbs. This is
  //    the case that used to be an LLM guess and is now a table lookup.
  const subUnitAmount = convertSubUnit(ingredient.amount, ingredient.unitToken, standard);
  if (subUnitAmount !== null && standard) {
    const canonical = canonicalUnitFor(standard, measurementTypes);
    if (canonical) {
      const inTarget =
        canonical.id === targetUnit.id
          ? subUnitAmount
          : convertAmount(subUnitAmount, canonical, targetUnit);
      if (inTarget !== null) {
        return {
          amount: inTarget,
          why: `${ingredient.display} = ${roundAmount(inTarget)} ${targetLabel} (about ${standard.sub_units_per_unit} ${standard.sub_unit}s in a whole one)`
        };
      }
    }
  }

  // 1b. Sometimes the sub-unit rides in the name instead of the unit field —
  //     "2 garlic cloves" with no unit set. Without this, that would be read as
  //     two whole bulbs, which is the same order-of-magnitude error in
  //     miniature. Only consulted when no unit was given.
  if (!ingredient.unitToken && standard?.sub_unit) {
    const trailingWord = ingredient.name.trim().split(/\s+/).pop() ?? null;
    const fromName = convertSubUnit(ingredient.amount, trailingWord, standard);
    if (fromName !== null) {
      const canonical = canonicalUnitFor(standard, measurementTypes);
      if (canonical) {
        const inTarget =
          canonical.id === targetUnit.id
            ? fromName
            : convertAmount(fromName, canonical, targetUnit);
        if (inTarget !== null) {
          return {
            amount: inTarget,
            why: `${ingredient.amount} ${trailingWord} = ${roundAmount(inTarget)} ${targetLabel} (about ${standard.sub_units_per_unit} in a whole one)`
          };
        }
      }
    }
  }

  // 2. No unit written at all ("2 eggs"). Only safe when the fridge counts them.
  if (!ingredient.unitToken) {
    if (dimensionOf(targetUnit) === 'count') {
      return {
        amount: roundAmount(ingredient.amount),
        why: `${ingredient.display} counted as ${targetLabel}`
      };
    }
    return {
      error: `the recipe gives no unit, and "${entry.name}" is measured in ${targetLabel}`
    };
  }

  // 3. Ordinary unit conversion within a dimension.
  const resolved = resolveUnitToken(ingredient.unitToken, measurementTypes);
  if (!resolved) {
    return { error: `"${ingredient.unitToken}" is not a unit we recognise` };
  }

  const amountInResolvedUnit = ingredient.amount * resolved.multiplier;
  const converted = convertAmount(amountInResolvedUnit, resolved.measurementType, targetUnit);
  if (converted === null) {
    const from = unitLabel(resolved.measurementType);
    return {
      error: `cannot convert ${from} to ${targetLabel} — they measure different things`
    };
  }

  const why =
    resolved.measurementType.id === targetUnit.id && resolved.multiplier === 1
      ? `${ingredient.display}`
      : `${ingredient.display} = ${roundAmount(converted)} ${targetLabel}`;

  return { amount: converted, why };
}

/** Deterministic name matching. Exact names first, then the standards dictionary. */
function matchDeterministically(
  ingredients: RecipeIngredient[],
  fridge: FridgeEntry[],
  standards: StandardsIndex
): { pairs: MatchedPair[]; leftovers: RecipeIngredient[] } {
  const byNormalizedName = new Map<string, FridgeEntry>();
  const byStandardId = new Map<number, FridgeEntry>();

  for (const entry of fridge) {
    const key = normalizeIngredientName(entry.name);
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, entry);
    if (entry.standard && !byStandardId.has(entry.standard.id)) {
      byStandardId.set(entry.standard.id, entry);
    }
  }

  const pairs: MatchedPair[] = [];
  const leftovers: RecipeIngredient[] = [];

  for (const ingredient of ingredients) {
    const key = normalizeIngredientName(ingredient.name);

    const byName = key ? byNormalizedName.get(key) : undefined;
    if (byName) {
      pairs.push({ ingredient, entry: byName, source: 'exact' });
      continue;
    }

    // Both sides resolving to the same standard is a genuine match: it is how
    // "garlic bulb" in the fridge meets "garlic" in a recipe.
    const ingredientStandard = findStandard(ingredient.name, standards);
    if (ingredientStandard) {
      const byStandard = byStandardId.get(ingredientStandard.id);
      if (byStandard) {
        pairs.push({ ingredient, entry: byStandard, source: 'standard' });
        continue;
      }
    }

    leftovers.push(ingredient);
  }

  return { pairs, leftovers };
}

/**
 * Builds the full plan for a cooked recipe.
 *
 * Never throws for the empty cases — a recipe with no ingredients, or an empty
 * fridge, returns an empty plan without spending a model call.
 */
export async function buildCookPlan(input: CookPlanInput): Promise<CookPlanResult> {
  const { fridge, measurementTypes, standards, diet } = input;
  const ingredients = normalizeRecipeIngredients(input.storedIngredients);

  if (ingredients.length === 0 || fridge.length === 0) {
    return {
      deductions: [],
      unresolved: ingredients.map((ingredient) => ({
        recipeLine: describeRecipeIngredient(ingredient),
        name: ingredient.name,
        reason: fridge.length === 0 ? 'your fridge is empty' : 'nothing to match against'
      })),
      skippedModel: true
    };
  }

  const { pairs, leftovers } = matchDeterministically(ingredients, fridge, standards);
  const unresolved: UnresolvedLine[] = [];
  let skippedModel = true;

  // Only the leftovers reach the model, and only the fridge items nothing has
  // claimed yet. On a well-standardised fridge this call is skipped entirely.
  if (leftovers.length > 0) {
    const claimed = new Set(pairs.map((pair) => pair.entry.id));
    const available = fridge.filter((entry) => !claimed.has(entry.id));

    if (available.length > 0) {
      const entryById = new Map(available.map((entry): [string, FridgeEntry] => [entry.id, entry]));
      const ingredientByRef = new Map(
        leftovers.map((ingredient, index): [string, RecipeIngredient] => [String(index), ingredient])
      );

      const result = await linkIngredientsToFridge(
        leftovers.map((ingredient, index) => ({ ref: String(index), name: ingredient.name })),
        available.map((entry) => ({
          ref: entry.id,
          name: entry.name,
          unitLabel: unitLabel(entry.measurementType)
        })),
        diet ?? {}
      );
      skippedModel = result.skippedModel;

      const linkedRefs = new Set<string>();
      for (const link of result.links) {
        const ingredient = ingredientByRef.get(link.recipeRef);
        const entry = entryById.get(link.fridgeRef);
        if (!ingredient || !entry) continue;
        linkedRefs.add(link.recipeRef);
        pairs.push({ ingredient, entry, source: 'model' });
      }

      for (const [ref, ingredient] of ingredientByRef.entries()) {
        if (!linkedRefs.has(ref)) {
          unresolved.push({
            recipeLine: describeRecipeIngredient(ingredient),
            name: ingredient.name,
            reason: 'not found in your fridge'
          });
        }
      }
    } else {
      for (const ingredient of leftovers) {
        unresolved.push({
          recipeLine: describeRecipeIngredient(ingredient),
          name: ingredient.name,
          reason: 'not found in your fridge'
        });
      }
    }
  }

  // Convert every matched pair into an amount in the fridge item's own unit,
  // merging lines that point at the same item rather than letting them fight.
  const byFridgeId = new Map<string, DeductionLine>();

  for (const pair of pairs) {
    const recipeLine = describeRecipeIngredient(pair.ingredient);
    const outcome = resolveDeductionAmount(pair.ingredient, pair.entry, measurementTypes);

    if ('error' in outcome) {
      unresolved.push({ recipeLine, name: pair.ingredient.name, reason: outcome.error });
      continue;
    }

    const existing = byFridgeId.get(pair.entry.id);
    if (existing) {
      existing.deduct = roundAmount(existing.deduct + outcome.amount);
      existing.recipeLine = `${existing.recipeLine} + ${recipeLine}`;
      existing.why = `${existing.why}; ${outcome.why}`;
    } else {
      byFridgeId.set(pair.entry.id, {
        fridgeItemId: pair.entry.id,
        name: pair.entry.name,
        recipeLine,
        unit: unitLabel(pair.entry.measurementType),
        before: roundAmount(pair.entry.quantity),
        deduct: roundAmount(outcome.amount),
        after: 0,
        why: outcome.why,
        source: pair.source
      });
    }
  }

  // Final pass: compute the preview and flag anything that looks wrong.
  const deductions: DeductionLine[] = [];
  for (const line of byFridgeId.values()) {
    line.after = roundAmount(Math.max(0, line.before - line.deduct));

    // The guard that would have caught the 200 g / 3 kg incident on its own.
    if (line.deduct > line.before) {
      line.warning = `This would use more than you have (${line.deduct} ${line.unit} of ${line.before} ${line.unit}). Check the amount before applying.`;
    }

    deductions.push(line);
  }

  return { deductions, unresolved, skippedModel };
}
