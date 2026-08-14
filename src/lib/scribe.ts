import 'server-only';

import { openRouterScribeCompletion, parseJsonFromModelResponse } from './openrouter';

/**
 * The Kitchen Scribe, v2 — name matching, and nothing else.
 *
 * v1 asked one model call to do three jobs at once: read the amount, find the
 * matching fridge item, and convert the unit. It silently failed the easiest of
 * them — a recipe's 200 g of potatoes came back as "200" against a fridge item
 * held in kilograms, and one confirmation wiped 3 kg of stock. Unit mistakes are
 * order-of-magnitude mistakes on a destructive operation.
 *
 * So the job was cut down. This module now answers exactly one question, the
 * only one that genuinely needs judgement:
 *
 *     which fridge item is this recipe line talking about?
 *
 * It never sees an amount or a unit, and therefore cannot get one wrong.
 * Reading amounts is a copy job (`recipeIngredients.ts`), converting units is
 * arithmetic (`units.ts`, `ingredientStandards.ts`), and subtracting is the
 * Executor's job. Callers should reach this only for lines that could not
 * already be matched from the standards dictionary — see `cookPlanner.ts`.
 *
 * Safety property preserved from v1: the model refers to items by a 1-based
 * index into the lists we sent it, never a database id. An index we did not
 * issue is dropped, so a hallucinated reference cannot reach a real row.
 */

export interface ScribeCandidateItem {
  /** Caller's own identifier, echoed back untouched. Never shown to the model. */
  ref: string;
  name: string;
  /** Shown purely as a disambiguation hint, e.g. garlic held as "pieces". */
  unitLabel?: string;
}

export interface ScribeRecipeLine {
  ref: string;
  name: string;
}

export interface ScribeDietContext {
  diet?: string | null;
  allergens?: string[] | null;
}

export interface ScribeLink {
  /** `ref` of the recipe line. */
  recipeRef: string;
  /** `ref` of the fridge item it refers to. */
  fridgeRef: string;
}

export interface ScribeLinkResult {
  links: ScribeLink[];
  /** True when we answered without spending a model call. */
  skippedModel: boolean;
}

/** Ceiling on how much we will ever show the model in one call. */
const MAX_LINES = 60;
const MAX_NAME_CHARS = 48;

const SYSTEM_PROMPT = `You match ingredients from a recipe someone just cooked to the items in their fridge.

For each RECIPE line, find the FRIDGE item that is the same food. That is your only task.

Rules:
- Match only when it is genuinely the SAME food. Similar spelling is not enough: "cream" is not "ice cream", "corn" is not "cornflour", "coconut milk" is not "milk".
- A specific name and a general one do match when they are the same food: "cheddar" and "cheddar cheese", "spring onion" and "scallions", "mince" and "ground beef".
- If a recipe line has no matching fridge item, simply leave it out. Do not force a match.
- Each recipe line matches at most one fridge item.
- Amounts and units are deliberately not shown to you. They are handled elsewhere. Match names only.

Reply with ONLY a JSON object, no commentary and no markdown fences.

Worked example. Given:
RECIPE
1. potatoes
2. garlic
3. salt
FRIDGE
1. olive oil (ml)
2. potatoes (kilograms)
3. garlic (pieces)

the correct reply is exactly:
{"links":[{"r":1,"f":2},{"r":2,"f":3}]}

Salt is absent from that reply because the fridge has none. Use real numbers from the lists you are given; never output placeholders or angle brackets.`;

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function coerceIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function buildUserPrompt(
  recipeLines: ScribeRecipeLine[],
  fridgeItems: ScribeCandidateItem[],
  diet: ScribeDietContext
): string {
  const recipeText = recipeLines
    .map((line, index) => `${index + 1}. ${truncate(line.name, MAX_NAME_CHARS)}`)
    .join('\n');

  const fridgeText = fridgeItems
    .map((item, index) => {
      const unit = item.unitLabel ? ` (${truncate(item.unitLabel, 16)})` : '';
      return `${index + 1}. ${truncate(item.name, MAX_NAME_CHARS)}${unit}`;
    })
    .join('\n');

  // Diet context earns its tokens only as a disambiguation hint: a vegan's
  // "milk" is the oat milk in their fridge. Allergens are listed as things to
  // never match onto, since matching an allergen would propose consuming it.
  const dietBits: string[] = [];
  if (diet.diet) dietBits.push(`eats ${diet.diet}`);
  if (diet.allergens && diet.allergens.length > 0) {
    dietBits.push(`never match to: ${diet.allergens.slice(0, 12).join(', ')}`);
  }
  const dietLine = dietBits.length > 0 ? `\nUSER: ${dietBits.join('; ')}.\n` : '\n';

  return `RECIPE
${recipeText}

FRIDGE
${fridgeText}
${dietLine}
JSON:`;
}

interface RawLinkOutput {
  links?: unknown;
}

/**
 * Asks the model which fridge item each recipe line refers to.
 *
 * Returns only links it is confident enough to state; anything absent from the
 * result is simply left unmatched by the caller. Never throws for the empty
 * case — no lines or no candidates returns an empty result without spending a
 * model call.
 */
export async function linkIngredientsToFridge(
  recipeLines: ScribeRecipeLine[],
  fridgeItems: ScribeCandidateItem[],
  diet: ScribeDietContext = {}
): Promise<ScribeLinkResult> {
  const lines = recipeLines.filter((line) => line && line.name.trim()).slice(0, MAX_LINES);
  const candidates = fridgeItems.filter((item) => item && item.name.trim()).slice(0, MAX_LINES);

  if (lines.length === 0 || candidates.length === 0) {
    return { links: [], skippedModel: true };
  }

  const raw = await openRouterScribeCompletion(
    SYSTEM_PROMPT,
    buildUserPrompt(lines, candidates, diet)
  );

  let parsed: RawLinkOutput;
  try {
    parsed = parseJsonFromModelResponse<RawLinkOutput>(raw, 'ingredient links');
  } catch {
    // Weak models sometimes echo the example or wrap the object in prose.
    // Neither is recoverable, and the raw parser error tells the user nothing.
    throw new Error(
      'The Scribe model did not return usable JSON. Try again, or set OPENROUTER_SCRIBE_MODEL ' +
        'to a model that reliably follows structured output.'
    );
  }

  // Everything below re-validates the model's output. An index we did not
  // issue, or a duplicate claim on a recipe line, is dropped silently.
  const rawLinks = Array.isArray(parsed.links) ? parsed.links : [];
  const seenRecipeIndexes = new Set<number>();
  const links: ScribeLink[] = [];

  for (const entry of rawLinks.slice(0, MAX_LINES)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;

    const recipeIndex = coerceIndex(record.r);
    const fridgeIndex = coerceIndex(record.f);
    if (recipeIndex === null || fridgeIndex === null) continue;
    if (recipeIndex < 1 || recipeIndex > lines.length) continue;
    if (fridgeIndex < 1 || fridgeIndex > candidates.length) continue;
    if (seenRecipeIndexes.has(recipeIndex)) continue;

    seenRecipeIndexes.add(recipeIndex);
    links.push({
      recipeRef: lines[recipeIndex - 1].ref,
      fridgeRef: candidates[fridgeIndex - 1].ref
    });
  }

  return { links, skippedModel: false };
}
