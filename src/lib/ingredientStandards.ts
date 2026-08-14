/**
 * Access layer for `ingredient_standards` — the global, server-owned table that
 * says which unit each ingredient is normally kept in and how its sub-units
 * work (a garlic bulb holds about ten cloves).
 *
 * The reason this table exists: facts that are the same for every user do not
 * belong in a prompt. Before it, the model had to invent "how much of a bulb is
 * two cloves" on every single cook, and got it wrong. Now it is a lookup, and
 * the model is left with the one job it is actually needed for — deciding which
 * fridge item a recipe line refers to when the names differ.
 *
 * Pure functions here; no model calls. Loading is a plain select.
 */

import type { MeasurementType } from './units';
import { roundAmount } from './units';

export interface IngredientStandard {
  id: number;
  name: string;
  measurement_type_id: number;
  aliases: string[];
  sub_unit: string | null;
  sub_units_per_unit: number | null;
  category: string | null;
  typical_shelf_life_days: number | null;
}

/** Prebuilt lookup so repeated matching doesn't rescan the table. */
export interface StandardsIndex {
  all: IngredientStandard[];
  /** Normalised name or alias -> standard. */
  byName: Map<string, IngredientStandard>;
}

/** Supabase client, typed loosely on purpose: this module only needs `from()`. */
type DbClient = { from: (table: string) => any };

const STANDARD_COLUMNS =
  'id, name, measurement_type_id, aliases, sub_unit, sub_units_per_unit, category, typical_shelf_life_days';

/**
 * Folds a name to a comparison key: lowercase, punctuation stripped, and a
 * naive singularisation so "potato" and "potatoes" collide.
 *
 * Deliberately conservative. This is only used for *exact* dictionary hits;
 * genuinely fuzzy matching is the model's job, and a greedy normaliser here
 * would silently create the same false positives the old substring matcher did
 * ("corn" matching "cornflour").
 */
export function normalizeIngredientName(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const words = cleaned.split(' ');
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

/**
 * English plurals are only stripped where the rule is actually safe.
 *
 * The naive "ends with es -> drop two characters" rule is wrong far more often
 * than it looks: it turns "cloves" into "clov", which then fails to match the
 * sub-unit "clove" and silently breaks garlic conversion. English only adds
 * *es* after a sibilant (boxes, dishes, glasses); everywhere else the plural is
 * a bare *s* on a word that happens to end in e.
 */
function singularize(word: string): string {
  if (word.length <= 3) return word;

  // berries -> berry
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  // potatoes -> potato, tomatoes -> tomato
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
  // boxes -> box, dishes -> dish, glasses -> glass
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  // grass, glass: already singular
  if (word.endsWith('ss')) return word;
  // cloves -> clove, onions -> onion, eggs -> egg
  if (word.endsWith('s')) return word.slice(0, -1);

  return word;
}

/** Loads every standard and builds the lookup index. */
export async function loadIngredientStandards(supabase: DbClient): Promise<StandardsIndex> {
  const { data, error } = await supabase.from('ingredient_standards').select(STANDARD_COLUMNS);

  if (error) {
    // The standards table is an optimisation, not a dependency. If it is
    // missing or unreadable the cook loop must still work, just with more of
    // the burden left on the model.
    console.error('Could not load ingredient standards:', error.message);
    return { all: [], byName: new Map() };
  }

  const all: IngredientStandard[] = (data || []).map((row: any) => ({
    id: Number(row.id),
    name: String(row.name),
    measurement_type_id: Number(row.measurement_type_id),
    aliases: Array.isArray(row.aliases) ? row.aliases.map((a: any) => String(a)) : [],
    sub_unit: row.sub_unit ? String(row.sub_unit) : null,
    sub_units_per_unit:
      row.sub_units_per_unit === null || row.sub_units_per_unit === undefined
        ? null
        : Number(row.sub_units_per_unit),
    category: row.category ? String(row.category) : null,
    typical_shelf_life_days:
      row.typical_shelf_life_days === null || row.typical_shelf_life_days === undefined
        ? null
        : Number(row.typical_shelf_life_days)
  }));

  return { all, byName: buildIndex(all) };
}

export function buildIndex(standards: IngredientStandard[]): Map<string, IngredientStandard> {
  const byName = new Map<string, IngredientStandard>();
  for (const standard of standards) {
    const keys = [standard.name, ...standard.aliases];
    for (const key of keys) {
      const normalized = normalizeIngredientName(key);
      // First writer wins, so a canonical name is never shadowed by another
      // ingredient's alias.
      if (normalized && !byName.has(normalized)) {
        byName.set(normalized, standard);
      }
    }
  }
  return byName;
}

/** Exact dictionary lookup by canonical name or alias. Null when unknown. */
export function findStandard(name: string, index: StandardsIndex): IngredientStandard | null {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return null;
  return index.byName.get(normalized) ?? null;
}

/**
 * Converts a sub-unit amount into the ingredient's canonical unit.
 *
 * "2 cloves" against garlic (sub_unit `clove`, 10 per piece) returns 0.2.
 * Returns null when the token is not this ingredient's sub-unit, so the caller
 * falls through to normal unit conversion instead of applying a wrong ratio.
 */
export function convertSubUnit(
  amount: number,
  unitToken: string | null | undefined,
  standard: IngredientStandard | null | undefined
): number | null {
  if (!standard || !standard.sub_unit || !standard.sub_units_per_unit) return null;
  if (!unitToken || !Number.isFinite(amount)) return null;
  if (standard.sub_units_per_unit <= 0) return null;

  const token = normalizeIngredientName(unitToken);
  const subUnit = normalizeIngredientName(standard.sub_unit);
  if (!token || token !== subUnit) return null;

  return roundAmount(amount / standard.sub_units_per_unit);
}

/** The canonical measurement type for a standard, if it is still stocked. */
export function canonicalUnitFor(
  standard: IngredientStandard | null | undefined,
  measurementTypes: MeasurementType[]
): MeasurementType | null {
  if (!standard) return null;
  return measurementTypes.find((mt) => mt.id === standard.measurement_type_id) ?? null;
}

/**
 * Names present in the fridge that no standard covers.
 *
 * Drives the normalisation pass: each unknown name is resolved once, by a
 * model, and written back to `ingredient_standards` for every user thereafter.
 */
export function findUnstandardisedNames(names: string[], index: StandardsIndex): string[] {
  const unknown = new Set<string>();
  for (const name of names) {
    const normalized = normalizeIngredientName(name);
    if (!normalized) continue;
    if (!index.byName.has(normalized)) unknown.add(name.trim());
  }
  return Array.from(unknown);
}
