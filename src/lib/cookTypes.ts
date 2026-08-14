/**
 * Shared types for the cook -> fridge deduction loop (safe to import from client).
 *
 * The contract between resolution (deciding *what* changed) and execution
 * (doing the arithmetic and the write) is a plain deduction plan. Nothing that
 * produces a plan ever returns fridge state, and nothing that applies one ever
 * calls a model.
 */

/** How a recipe line was matched to a fridge item. Surfaced so the user can judge it. */
export type MatchSource =
  /** Names matched outright. No model involved. */
  | 'exact'
  /** Both sides resolved to the same row in `ingredient_standards`. No model involved. */
  | 'standard'
  /** The Kitchen Scribe decided they were the same food. */
  | 'model';

/** One proposed change to a single fridge item. */
export interface DeductionLine {
  /** Real `fridge_items.id`, resolved server-side — never supplied by the model. */
  fridgeItemId: string;
  /** Fridge item name, as stored. */
  name: string;
  /** What the recipe asked for, phrased as the recipe phrased it. */
  recipeLine: string;
  /** Unit of the fridge item; the amount below is always expressed in it. */
  unit: string;
  before: number;
  /** Amount consumed, already converted into the fridge item's unit. */
  deduct: number;
  /** Preview of `before - deduct`, floored at zero. Recomputed on apply. */
  after: number;
  /** Plain-language account of how the number was reached. */
  why: string;
  source: MatchSource;
  /** Present when the proposal looks wrong and deserves a second look. */
  warning?: string;
}

/** A recipe line we deliberately did not deduct, and why. */
export interface UnresolvedLine {
  /** What the recipe asked for. */
  recipeLine: string;
  name: string;
  /** Why nothing was deducted — always a reason, never a silent omission. */
  reason: string;
}

/** What the plan endpoint hands to the confirmation UI. */
export interface CookPlan {
  recipeId: string;
  recipeTitle: string;
  deductions: DeductionLine[];
  unresolved: UnresolvedLine[];
  /** True when the whole plan was resolved without spending a model call. */
  skippedModel: boolean;
}

/** What the client sends back to apply. Amounts are editable by the user. */
export interface DeductionRequest {
  fridgeItemId: string;
  deduct: number;
}

/** Result of applying one line, echoed back so the UI can show what happened. */
export interface AppliedDeduction {
  fridgeItemId: string;
  name: string;
  unit: string;
  before: number;
  deducted: number;
  after: number;
  /** True when the item hit zero. The row is kept; a 7-day removal window starts. */
  depleted: boolean;
}
