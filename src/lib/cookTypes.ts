/**
 * Shared types for the cook -> fridge deduction loop (safe to import from client).
 *
 * The contract between the Kitchen Scribe (which decides *what* changed) and the
 * Executor (which does the arithmetic and the write) is a plain deduction plan.
 * The model never returns fridge state; it only ever proposes amounts consumed.
 */

/** One proposed change to a single fridge item. */
export interface DeductionLine {
  /** Real `fridge_items.id`, resolved server-side — never supplied by the model. */
  fridgeItemId: string;
  name: string;
  unit: string;
  /** Quantity currently in the fridge. */
  before: number;
  /** Amount the Scribe believes was consumed, in the item's own unit. */
  deduct: number;
  /** Preview of `before - deduct`, floored at zero. Recomputed on apply. */
  after: number;
  /** Short human explanation, e.g. "2 cloves ≈ 0.15 of a bulb". */
  why?: string;
}

/** What the plan endpoint hands to the confirmation UI. */
export interface CookPlan {
  recipeId: string;
  recipeTitle: string;
  deductions: DeductionLine[];
  /** Recipe ingredients with no plausible fridge match (incl. trace staples). */
  unmatched: string[];
  /** A single clarifying question, only when the Scribe is genuinely stuck. */
  question: string | null;
  /** True when we skipped the model call entirely (nothing to resolve). */
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
  /** True when the item hit zero. The row is kept, not deleted. */
  depleted: boolean;
}
