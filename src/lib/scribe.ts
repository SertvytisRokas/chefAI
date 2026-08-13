import 'server-only';

import { openRouterScribeCompletion, parseJsonFromModelResponse } from './openrouter';

/**
 * The Kitchen Scribe.
 *
 * Bounded resolver: given a cooked recipe and the user's fridge, it decides
 * *what* was consumed and how much, reconciling units along the way ("2 cloves"
 * against "1 bulb"). It returns a deduction plan and nothing else — it never
 * computes the remaining quantity, never returns fridge state, and never
 * touches the database. The Executor does all of that deterministically.
 *
 * Two deliberate safety properties:
 *  - The model references fridge items by a 1-based index into the list we sent
 *    it, not by database id. An index we did not issue is simply dropped, so a
 *    hallucinated reference cannot reach a real row.
 *  - Every field is re-validated and clamped here before it leaves this module.
 */

export interface ScribeFridgeItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface ScribeRecipeIngredient {
  name: string;
  quantity: string;
}

export interface ScribeDietContext {
  diet?: string | null;
  allergens?: string[] | null;
}

export interface ScribeResolution {
  deductions: { fridgeItemId: string; deduct: number; why?: string }[];
  unmatched: string[];
  question: string | null;
  /** True when we answered without spending a model call. */
  skippedModel: boolean;
}

/** Below this many fridge rows we send the whole fridge; above it we pre-filter. */
const INLINE_FRIDGE_LIMIT = 40;
/** Hard ceiling on rows sent to the model, whatever the filter produces. */
const MAX_CANDIDATE_ROWS = 60;
/** Recipes longer than this are truncated — no real recipe approaches it. */
const MAX_INGREDIENTS = 40;
const MAX_NAME_CHARS = 48;
const MAX_WHY_CHARS = 80;
const MAX_QUESTION_CHARS = 200;

const SYSTEM_PROMPT = `You are the Kitchen Scribe for a food-waste app. Given a recipe the user just cooked and their fridge, you report how much of each fridge item was consumed.

Rules:
- Reference fridge items ONLY by the numeric id shown in the FRIDGE list. Never invent an id.
- "amt" is the amount consumed, expressed in that item's OWN unit (the unit shown next to it).
- Convert between how recipes talk and how fridges are stored. Examples: 2 cloves of garlic out of a whole bulb is about 0.15 bulb; 1 cup of rice is about 180 grams; 1 medium onion is 1 piece.
- Approximate confidently. A close number is far more useful than no answer. Never return 0 for something clearly used.
- Only match a fridge item if it is plausibly the SAME food. Similar names are not enough: "cream" is not "ice cream", "corn" is not "cornflour".
- If a recipe ingredient has no plausible fridge match, put its name in "unmatched".
- Put trace seasonings and things nobody tracks (salt, pepper, water, oil for greasing) in "unmatched" instead of guessing an amount.
- Never report more than the fridge holds unless the recipe genuinely used more; the app handles running out.
- Use "question" only if you genuinely cannot proceed without asking. Otherwise null.
- You do NOT calculate what is left. The app subtracts. Report only what was consumed.

Output ONLY this JSON, no commentary, no markdown fences:
{"deduct":[{"i":<fridge id>,"amt":<number>,"why":"<max 8 words>"}],"unmatched":["<ingredient name>"],"question":null}`;

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Lowercase word tokens with naive singularisation, used only for candidate recall. */
function tokenize(value: string): string[] {
  const words = value
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  const singular = words.map((word) => {
    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
  });
  return Array.from(new Set(singular));
}

function tokensOverlap(a: string[], b: string[]): boolean {
  for (const left of a) {
    for (const right of b) {
      if (left === right) return true;
      // Substring matches only for longer tokens, to avoid "oat" hitting "oats"
      // style false positives being drowned out by junk like "ice" in "rice".
      if (left.length >= 5 && right.length >= 5) {
        if (left.includes(right) || right.includes(left)) return true;
      }
    }
  }
  return false;
}

/**
 * Narrows a large fridge to plausibly relevant rows before spending tokens.
 *
 * Deliberately high-recall: this only decides what the model gets to *see*, never
 * what gets deducted. Small fridges skip it entirely so nothing can be missed.
 */
function selectCandidates(
  fridge: ScribeFridgeItem[],
  ingredients: ScribeRecipeIngredient[]
): ScribeFridgeItem[] {
  if (fridge.length <= INLINE_FRIDGE_LIMIT) return fridge;

  const ingredientTokens = ingredients.map((ing) => tokenize(ing.name));
  const picked = fridge.filter((item) => {
    const itemTokens = tokenize(item.name);
    return ingredientTokens.some((tokens) => tokensOverlap(tokens, itemTokens));
  });

  return picked.slice(0, MAX_CANDIDATE_ROWS);
}

function buildUserPrompt(
  recipeTitle: string,
  ingredients: ScribeRecipeIngredient[],
  candidates: ScribeFridgeItem[],
  diet: ScribeDietContext
): string {
  const usedLines = ingredients
    .map((ing) => `- ${truncate(ing.quantity || '', 24)} ${truncate(ing.name, MAX_NAME_CHARS)}`.trim())
    .join('\n');

  // Index is 1-based and local to this request; it is not a database id.
  const fridgeLines = candidates
    .map(
      (item, index) =>
        `${index + 1}|${truncate(item.name, MAX_NAME_CHARS)}|${item.quantity}|${truncate(item.unit || 'units', 16)}`
    )
    .join('\n');

  // Diet context is included only to disambiguate matches (a vegan's "milk" is
  // the oat milk in their fridge). Deliberately not the full personalization
  // profile — this call runs on every cook and stays small.
  const dietBits: string[] = [];
  if (diet.diet) dietBits.push(`diet ${diet.diet}`);
  if (diet.allergens && diet.allergens.length > 0) {
    dietBits.push(`never matches to: ${diet.allergens.slice(0, 12).join(', ')}`);
  }
  const dietLine = dietBits.length > 0 ? `\nUSER: ${dietBits.join('; ')}.\n` : '\n';

  return `RECIPE: ${truncate(recipeTitle, 80)}

USED:
${usedLines}

FRIDGE (id|item|have|unit):
${fridgeLines}
${dietLine}
JSON:`;
}

interface RawScribeOutput {
  deduct?: unknown;
  unmatched?: unknown;
  question?: unknown;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Resolves a cooked recipe against the fridge into a deduction plan.
 *
 * Never throws for "nothing to do" cases — an empty fridge or an ingredient-less
 * recipe returns an empty plan without spending a model call.
 */
export async function resolveCookDeductions(
  recipeTitle: string,
  ingredients: ScribeRecipeIngredient[],
  fridge: ScribeFridgeItem[],
  diet: ScribeDietContext = {}
): Promise<ScribeResolution> {
  const usableIngredients = ingredients
    .filter((ing) => ing && typeof ing.name === 'string' && ing.name.trim().length > 0)
    .slice(0, MAX_INGREDIENTS)
    .map((ing) => ({
      name: ing.name,
      quantity: typeof ing.quantity === 'string' ? ing.quantity : ''
    }));

  // Nothing to resolve — don't pay for a model call to learn that.
  if (usableIngredients.length === 0 || fridge.length === 0) {
    return {
      deductions: [],
      unmatched: usableIngredients.map((ing) => ing.name),
      question: null,
      skippedModel: true
    };
  }

  const candidates = selectCandidates(fridge, usableIngredients);
  if (candidates.length === 0) {
    return {
      deductions: [],
      unmatched: usableIngredients.map((ing) => ing.name),
      question: null,
      skippedModel: true
    };
  }

  const raw = await openRouterScribeCompletion(
    SYSTEM_PROMPT,
    buildUserPrompt(recipeTitle, usableIngredients, candidates, diet)
  );
  const parsed = parseJsonFromModelResponse<RawScribeOutput>(raw, 'deduction plan');

  // Everything below re-validates the model's output. An index we did not issue,
  // a non-numeric amount, or a non-positive amount is dropped silently.
  const byItemId = new Map<string, { fridgeItemId: string; deduct: number; why?: string }>();
  const rawDeductions = Array.isArray(parsed.deduct) ? parsed.deduct : [];

  for (const entry of rawDeductions.slice(0, MAX_CANDIDATE_ROWS)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const index = coerceNumber(record.i);
    const amount = coerceNumber(record.amt);
    if (index === null || amount === null) continue;
    if (!Number.isInteger(index) || index < 1 || index > candidates.length) continue;
    if (amount <= 0) continue;

    const item = candidates[index - 1];
    const why = typeof record.why === 'string' ? truncate(record.why, MAX_WHY_CHARS) : undefined;

    // Two lines pointing at the same item are summed rather than fighting.
    const existing = byItemId.get(item.id);
    if (existing) {
      existing.deduct = Math.round((existing.deduct + amount) * 1000) / 1000;
    } else {
      byItemId.set(item.id, {
        fridgeItemId: item.id,
        deduct: Math.round(amount * 1000) / 1000,
        why
      });
    }
  }

  const unmatched = (Array.isArray(parsed.unmatched) ? parsed.unmatched : [])
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => truncate(name, MAX_NAME_CHARS))
    .slice(0, MAX_INGREDIENTS);

  const question =
    typeof parsed.question === 'string' && parsed.question.trim().length > 0
      ? truncate(parsed.question, MAX_QUESTION_CHARS)
      : null;

  return {
    deductions: Array.from(byItemId.values()),
    unmatched,
    question,
    skippedModel: false
  };
}
