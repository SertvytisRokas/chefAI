import 'server-only';

import { openRouterScribeCompletion, parseJsonFromModelResponse } from './openrouter';
import { supabaseAdmin } from './supabase/admin';
import type { StandardsIndex } from './ingredientStandards';
import { findUnstandardisedNames, normalizeIngredientName } from './ingredientStandards';
import type { MeasurementType } from './units';

/**
 * Fridge normalisation — teaching the app an ingredient once, for everyone.
 *
 * When a name appears that `ingredient_standards` does not cover, a cheap model
 * decides how that ingredient is normally measured, what it is also called, and
 * whether it has a sub-unit (a garlic bulb holds roughly ten cloves). The
 * answer is written to the global table.
 *
 * The point is that this is a *write*, not a prompt. The same question is never
 * asked twice, by this user or any other, and the cook loop gets steadily more
 * deterministic as the table fills. It is the opposite of paying a model to
 * re-derive the same world knowledge on every cook.
 *
 * Writes go through the service role because `ingredient_standards` is global
 * reference data: readable by everyone, writable by no client.
 */

/** Never send more than this to the model in one pass. */
const MAX_NEW_PER_RUN = 25;
const MAX_NAME_CHARS = 48;

const SYSTEM_PROMPT = `You describe how kitchen ingredients are normally stored and measured, for a food inventory app.

For each ingredient given, return:
- "name": the ingredient in its normal, lowercase form (usually plural for countable produce: "onions", "carrots").
- "unit": how a household would normally record it. Choose EXACTLY ONE from the allowed list you are given. Weighable staples use a mass unit, liquids use a volume unit, and things counted whole use a count unit.
- "aliases": other names the same ingredient goes by, including singular/plural and common regional names. Keep it under 6, lowercase, and never repeat "name".
- "sub_unit" and "sub_per_unit": only when a whole one is routinely broken into smaller named parts. Garlic: "clove", 10. A loaf of bread: "slice", 20. Otherwise both null.
- "category": one of produce, dairy, protein, pantry, spice, bakery, frozen.
- "shelf_life_days": roughly how long it keeps once at home, as a whole number.

Be conservative. If you are unsure whether an ingredient has a sub-unit, use null for both fields — a wrong ratio causes bad inventory maths.

Reply with ONLY a JSON object, no commentary and no markdown fences.

Worked example, for the ingredients "garlic" and "double cream" with grams, ml, pieces among the allowed units:
{"items":[{"name":"garlic","unit":"pieces","aliases":["garlic bulb","garlic clove","garlic cloves"],"sub_unit":"clove","sub_per_unit":10,"category":"produce","shelf_life_days":90},{"name":"double cream","unit":"ml","aliases":["heavy cream","cream"],"sub_unit":null,"sub_per_unit":null,"category":"dairy","shelf_life_days":10}]}

Use real values for the ingredients you are given. Never output placeholders or angle brackets.`;

interface RawStandardItem {
  name?: unknown;
  unit?: unknown;
  aliases?: unknown;
  sub_unit?: unknown;
  sub_per_unit?: unknown;
  category?: unknown;
  shelf_life_days?: unknown;
}

interface RawNormalizationOutput {
  items?: unknown;
}

const ALLOWED_CATEGORIES = new Set([
  'produce',
  'dairy',
  'protein',
  'pantry',
  'spice',
  'bakery',
  'frozen'
]);

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface NormalizationResult {
  /** How many new rows were written to `ingredient_standards`. */
  added: number;
  /** Names that were unknown and went to the model. */
  considered: string[];
  skippedModel: boolean;
}

/**
 * Standardises any fridge item names that no standard covers yet.
 *
 * Safe to call often: it does nothing when every name is already known, and
 * inserts ignore conflicts, so two concurrent runs cannot create duplicates.
 * Failure is never fatal — normalisation is an optimisation, and the cook loop
 * still works without it, just with more left to the model.
 */
export async function normalizeNewFridgeItems(
  fridgeNames: string[],
  standards: StandardsIndex,
  measurementTypes: MeasurementType[]
): Promise<NormalizationResult> {
  const unknown = findUnstandardisedNames(fridgeNames, standards).slice(0, MAX_NEW_PER_RUN);
  if (unknown.length === 0) {
    return { added: 0, considered: [], skippedModel: true };
  }

  const activeUnits = measurementTypes.filter((mt) => mt.dimension);
  if (activeUnits.length === 0) {
    return { added: 0, considered: unknown, skippedModel: true };
  }

  const unitList = activeUnits
    .map((mt) => `${mt.name} (${mt.dimension})`)
    .join(', ');

  const userPrompt = `ALLOWED UNITS: ${unitList}

INGREDIENTS:
${unknown.map((name, index) => `${index + 1}. ${truncate(name, MAX_NAME_CHARS)}`).join('\n')}

JSON:`;

  let parsed: RawNormalizationOutput;
  try {
    const raw = await openRouterScribeCompletion(SYSTEM_PROMPT, userPrompt, 1200);
    parsed = parseJsonFromModelResponse<RawNormalizationOutput>(raw, 'ingredient standards');
  } catch (err) {
    console.error('Fridge normalisation failed:', err);
    return { added: 0, considered: unknown, skippedModel: false };
  }

  const unitByName = new Map<string, MeasurementType>(
    activeUnits.map((mt): [string, MeasurementType] => [mt.name.toLowerCase(), mt])
  );
  // Only accept names we actually asked about, so a chatty model cannot seed
  // the global table with ingredients nobody has.
  const requested = new Set(unknown.map((name) => normalizeIngredientName(name)));

  const rows: Record<string, unknown>[] = [];
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  for (const entry of rawItems.slice(0, MAX_NEW_PER_RUN)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as RawStandardItem;

    const name = typeof item.name === 'string' ? item.name.trim().toLowerCase() : '';
    if (!name) continue;

    const normalized = normalizeIngredientName(name);
    if (!normalized || !requested.has(normalized)) continue;

    const unitName = typeof item.unit === 'string' ? item.unit.trim().toLowerCase() : '';
    const measurementType = unitByName.get(unitName);
    if (!measurementType) continue;

    const aliases = Array.isArray(item.aliases)
      ? Array.from(
          new Set(
            item.aliases
              .filter((alias): alias is string => typeof alias === 'string')
              .map((alias) => truncate(alias.toLowerCase(), MAX_NAME_CHARS))
              .filter((alias) => alias && alias !== name)
          )
        ).slice(0, 6)
      : [];

    // Sub-unit fields are all-or-nothing; the database enforces this too.
    const subUnit = typeof item.sub_unit === 'string' && item.sub_unit.trim()
      ? item.sub_unit.trim().toLowerCase()
      : null;
    const subPerUnit = coerceNumber(item.sub_per_unit);
    const validSubUnit = subUnit !== null && subPerUnit !== null && subPerUnit > 0;

    const category =
      typeof item.category === 'string' && ALLOWED_CATEGORIES.has(item.category.trim().toLowerCase())
        ? item.category.trim().toLowerCase()
        : null;

    const shelfLife = coerceNumber(item.shelf_life_days);

    rows.push({
      name,
      measurement_type_id: measurementType.id,
      aliases,
      sub_unit: validSubUnit ? subUnit : null,
      sub_units_per_unit: validSubUnit ? subPerUnit : null,
      category,
      typical_shelf_life_days:
        shelfLife !== null && shelfLife > 0 ? Math.round(shelfLife) : null
    });
  }

  if (rows.length === 0) {
    return { added: 0, considered: unknown, skippedModel: false };
  }

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('ingredient_standards')
      .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
      .select('id');
    if (error) {
      console.error('Could not write ingredient standards:', error.message);
      return { added: 0, considered: unknown, skippedModel: false };
    }
    return { added: (data || []).length, considered: unknown, skippedModel: false };
  } catch (err) {
    console.error('Could not write ingredient standards:', err);
    return { added: 0, considered: unknown, skippedModel: false };
  }
}
