/**
 * Deterministic unit handling. No model calls, no network, no database.
 *
 * This module exists because of a real incident: a recipe asked for 200 g of
 * potatoes, the fridge held 3 kg, and the model reported "200" against a
 * kilogram-denominated item — wiping the entire stock. Unit errors are
 * order-of-magnitude errors on a destructive operation, so unit handling must
 * never be a judgement call.
 *
 * The rule enforced here: two amounts can only be compared or subtracted when
 * they share a dimension (mass / volume / count). Conversion is then arithmetic
 * against each unit's factor relative to that dimension's base unit, both of
 * which live in `measurement_types` (see scripts/m15-schema-alignment.sql).
 * A cross-dimension conversion returns null rather than a plausible-looking
 * number — "300 ml of flour" has no correct answer and must not be invented.
 */

export type UnitDimension = 'mass' | 'volume' | 'count';

/** A row of `measurement_types`, including the conversion metadata. */
export interface MeasurementType {
  id: number;
  name: string;
  abbreviation?: string | null;
  dimension?: string | null;
  to_base_factor?: number | string | null;
}

/**
 * A unit token resolved against the database, plus the multiplier needed to
 * express the parsed amount in that unit.
 *
 * The multiplier covers units a recipe may use that we do not stock as a
 * measurement type — an ounce resolves to `grams` with a multiplier of 28.35
 * rather than failing outright.
 */
export interface ResolvedUnit {
  measurementType: MeasurementType;
  multiplier: number;
}

/** Result of reading a free-text quantity such as "1 1/2 cups" or "to taste". */
export interface ParsedQuantity {
  /** Null when the text carries no number ("to taste", "a pinch"). */
  amount: number | null;
  /** Raw unit token as written, not yet resolved against the database. */
  unitToken: string | null;
  /** True when the source was a range ("1-2 tbsp") and we took the midpoint. */
  approximated: boolean;
  raw: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875
};

/**
 * Unit spellings a recipe might use, mapped to a `measurement_types.name` plus
 * the multiplier to reach it.
 *
 * Multipliers other than 1 exist for units we deliberately do not stock: an
 * imperial recipe saying "4 oz" becomes 113.4 grams rather than an unresolvable
 * token. Everything here converts within its own dimension only.
 */
const UNIT_ALIASES: Record<string, { canonical: string; multiplier: number }> = {
  // mass
  g: { canonical: 'grams', multiplier: 1 },
  gr: { canonical: 'grams', multiplier: 1 },
  gram: { canonical: 'grams', multiplier: 1 },
  grams: { canonical: 'grams', multiplier: 1 },
  gramme: { canonical: 'grams', multiplier: 1 },
  grammes: { canonical: 'grams', multiplier: 1 },
  kg: { canonical: 'kilograms', multiplier: 1 },
  kilo: { canonical: 'kilograms', multiplier: 1 },
  kilos: { canonical: 'kilograms', multiplier: 1 },
  kilogram: { canonical: 'kilograms', multiplier: 1 },
  kilograms: { canonical: 'kilograms', multiplier: 1 },
  mg: { canonical: 'grams', multiplier: 0.001 },
  milligram: { canonical: 'grams', multiplier: 0.001 },
  milligrams: { canonical: 'grams', multiplier: 0.001 },
  oz: { canonical: 'grams', multiplier: 28.3495 },
  ounce: { canonical: 'grams', multiplier: 28.3495 },
  ounces: { canonical: 'grams', multiplier: 28.3495 },
  lb: { canonical: 'pounds', multiplier: 1 },
  lbs: { canonical: 'pounds', multiplier: 1 },
  pound: { canonical: 'pounds', multiplier: 1 },
  pounds: { canonical: 'pounds', multiplier: 1 },

  // volume
  ml: { canonical: 'ml', multiplier: 1 },
  milliliter: { canonical: 'ml', multiplier: 1 },
  milliliters: { canonical: 'ml', multiplier: 1 },
  millilitre: { canonical: 'ml', multiplier: 1 },
  millilitres: { canonical: 'ml', multiplier: 1 },
  cl: { canonical: 'ml', multiplier: 10 },
  dl: { canonical: 'ml', multiplier: 100 },
  l: { canonical: 'liters', multiplier: 1 },
  lt: { canonical: 'liters', multiplier: 1 },
  liter: { canonical: 'liters', multiplier: 1 },
  liters: { canonical: 'liters', multiplier: 1 },
  litre: { canonical: 'liters', multiplier: 1 },
  litres: { canonical: 'liters', multiplier: 1 },
  tbsp: { canonical: 'tablespoons', multiplier: 1 },
  tbsps: { canonical: 'tablespoons', multiplier: 1 },
  tablespoon: { canonical: 'tablespoons', multiplier: 1 },
  tablespoons: { canonical: 'tablespoons', multiplier: 1 },
  tsp: { canonical: 'teaspoons', multiplier: 1 },
  tsps: { canonical: 'teaspoons', multiplier: 1 },
  teaspoon: { canonical: 'teaspoons', multiplier: 1 },
  teaspoons: { canonical: 'teaspoons', multiplier: 1 },
  cup: { canonical: 'cups', multiplier: 1 },
  cups: { canonical: 'cups', multiplier: 1 },

  // count
  piece: { canonical: 'pieces', multiplier: 1 },
  pieces: { canonical: 'pieces', multiplier: 1 },
  pc: { canonical: 'pieces', multiplier: 1 },
  pcs: { canonical: 'pieces', multiplier: 1 },
  unit: { canonical: 'pieces', multiplier: 1 },
  units: { canonical: 'pieces', multiplier: 1 },
  whole: { canonical: 'pieces', multiplier: 1 },
  dozen: { canonical: 'pieces', multiplier: 12 },
  dozens: { canonical: 'pieces', multiplier: 12 }
};

/**
 * Words that appear where a unit would sit but carry no measurable amount.
 * Treated as "no number given" rather than guessed at — the caller routes these
 * to the unmatched list instead of deducting an invented quantity.
 */
const NON_QUANTITY_PHRASES = [
  'to taste',
  'a pinch',
  'pinch',
  'a dash',
  'dash',
  'a splash',
  'splash',
  'as needed',
  'as required',
  'optional',
  'some',
  'handful',
  'a handful',
  'for garnish',
  'for serving',
  'for greasing',
  'to serve'
];

/** Descriptive words to drop before looking for a unit ("2 large eggs"). */
const SIZE_ADJECTIVES = new Set([
  'large',
  'medium',
  'small',
  'big',
  'fresh',
  'ripe',
  'raw',
  'cooked',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'grated',
  'ground',
  'peeled',
  'of',
  'a',
  'an'
]);

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Rounds to 4 decimals to keep float noise out of comparisons and the UI. */
export function roundAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Reads the leading numeric portion of a quantity string.
 *
 * Handles plain numbers, decimals with either separator, "1/4", "1 1/2",
 * unicode fractions, and ranges (returning the midpoint). Returns null when no
 * number is present.
 */
function readLeadingAmount(text: string): { amount: number | null; rest: string; approximated: boolean } {
  const working = text.trim();

  // Unicode fraction possibly preceded by a whole number: "1½", "½"
  const unicodeMatch = working.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);
  if (unicodeMatch) {
    const whole = unicodeMatch[1] ? Number.parseInt(unicodeMatch[1], 10) : 0;
    const fraction = UNICODE_FRACTIONS[unicodeMatch[2]] ?? 0;
    return {
      amount: whole + fraction,
      rest: working.slice(unicodeMatch[0].length).trim(),
      approximated: false
    };
  }

  // Range: "1-2", "1 to 2". Midpoint is closer on average than either end.
  const rangeMatch = working.match(/^(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)/i);
  if (rangeMatch) {
    const low = Number.parseFloat(rangeMatch[1].replace(',', '.'));
    const high = Number.parseFloat(rangeMatch[2].replace(',', '.'));
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return {
        amount: (low + high) / 2,
        rest: working.slice(rangeMatch[0].length).trim(),
        approximated: true
      };
    }
  }

  // Mixed number: "1 1/2"
  const mixedMatch = working.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixedMatch) {
    const whole = Number.parseInt(mixedMatch[1], 10);
    const numerator = Number.parseInt(mixedMatch[2], 10);
    const denominator = Number.parseInt(mixedMatch[3], 10);
    if (denominator > 0) {
      return {
        amount: whole + numerator / denominator,
        rest: working.slice(mixedMatch[0].length).trim(),
        approximated: false
      };
    }
  }

  // Simple fraction: "1/4"
  const fractionMatch = working.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const numerator = Number.parseInt(fractionMatch[1], 10);
    const denominator = Number.parseInt(fractionMatch[2], 10);
    if (denominator > 0) {
      return {
        amount: numerator / denominator,
        rest: working.slice(fractionMatch[0].length).trim(),
        approximated: false
      };
    }
  }

  // Plain number, accepting a comma decimal separator.
  const numberMatch = working.match(/^(\d+(?:[.,]\d+)?)/);
  if (numberMatch) {
    const amount = Number.parseFloat(numberMatch[1].replace(',', '.'));
    if (Number.isFinite(amount)) {
      return {
        amount,
        rest: working.slice(numberMatch[0].length).trim(),
        approximated: false
      };
    }
  }

  return { amount: null, rest: working, approximated: false };
}

/**
 * Parses a free-text quantity such as "200 grams", "1/4 piece" or "to taste".
 *
 * Only needed for recipes saved before quantities became structured; new
 * recipes carry `amount` and `unit` as separate fields. Kept permanently so old
 * rows never have to be migrated.
 */
export function parseQuantityString(raw: string | null | undefined): ParsedQuantity {
  const original = typeof raw === 'string' ? raw.trim() : '';
  if (!original) {
    return { amount: null, unitToken: null, approximated: false, raw: '' };
  }

  const lowered = original.toLowerCase();
  if (NON_QUANTITY_PHRASES.some((phrase) => lowered === phrase || lowered.startsWith(`${phrase} `))) {
    return { amount: null, unitToken: null, approximated: false, raw: original };
  }

  const { amount, rest, approximated } = readLeadingAmount(lowered);

  // Take the first word after the number that isn't a size adjective.
  const words = rest
    .replace(/[^a-z\s./]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let unitToken: string | null = null;
  for (const word of words) {
    if (SIZE_ADJECTIVES.has(word)) continue;
    unitToken = word;
    break;
  }

  return { amount, unitToken, approximated, raw: original };
}

/**
 * Resolves a unit token to a stocked measurement type plus a multiplier.
 *
 * Matches the alias table first, then the database's own `name` and
 * `abbreviation`. Returns null for anything unrecognised — callers must treat
 * an unknown unit as "cannot deduct" rather than assuming a default.
 */
export function resolveUnitToken(
  token: string | null | undefined,
  measurementTypes: MeasurementType[]
): ResolvedUnit | null {
  if (!token) return null;
  const key = token.trim().toLowerCase().replace(/\.$/, '');
  if (!key) return null;

  const alias = UNIT_ALIASES[key];
  if (alias) {
    const measurementType = measurementTypes.find((mt) => mt.name.toLowerCase() === alias.canonical);
    if (measurementType) {
      return { measurementType, multiplier: alias.multiplier };
    }
  }

  const direct = measurementTypes.find(
    (mt) =>
      mt.name.toLowerCase() === key ||
      (mt.abbreviation ? mt.abbreviation.toLowerCase() === key : false)
  );
  if (direct) return { measurementType: direct, multiplier: 1 };

  return null;
}

export function dimensionOf(measurementType: MeasurementType | null | undefined): UnitDimension | null {
  const dimension = measurementType?.dimension;
  if (dimension === 'mass' || dimension === 'volume' || dimension === 'count') return dimension;
  return null;
}

function baseFactorOf(measurementType: MeasurementType): number | null {
  const factor = toFiniteNumber(measurementType.to_base_factor);
  return factor !== null && factor > 0 ? factor : null;
}

/**
 * Converts an amount between two measurement types.
 *
 * Returns null when the conversion is not defined — different dimensions, or
 * either unit missing its factor. **Null means "do not deduct"**, never
 * "assume they are equivalent"; that assumption is precisely what caused the
 * 200 g / 3 kg incident.
 */
export function convertAmount(
  amount: number,
  from: MeasurementType,
  to: MeasurementType
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from.id === to.id) return roundAmount(amount);

  const fromDimension = dimensionOf(from);
  const toDimension = dimensionOf(to);
  if (!fromDimension || !toDimension || fromDimension !== toDimension) return null;

  const fromFactor = baseFactorOf(from);
  const toFactor = baseFactorOf(to);
  if (fromFactor === null || toFactor === null) return null;

  return roundAmount((amount * fromFactor) / toFactor);
}

/** Human-readable unit label, preferring the short form where one exists. */
export function unitLabel(measurementType: MeasurementType | null | undefined): string {
  if (!measurementType) return '';
  return measurementType.abbreviation || measurementType.name;
}
