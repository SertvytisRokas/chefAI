"use client";

import { useState } from 'react';
import Modal from './Modal';
import type { AppliedDeduction, CookPlan } from '../lib/cookTypes';

interface CookedThisProps {
  /** Saved `recipes.id`. The button is hidden until the recipe has been saved. */
  recipeId: number | string | null;
  /** Called after a successful apply so the page can refresh its fridge copy. */
  onApplied?: () => void;
}

/** Trims float noise for display: 0.15 stays, 0.150 doesn't, 2.0 becomes 2. */
function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 1000) / 1000);
}

function remainingAfter(before: number, deduct: number): number {
  if (!Number.isFinite(deduct) || deduct <= 0) return Math.round(before * 1000) / 1000;
  return Math.round(Math.max(0, before - deduct) * 1000) / 1000;
}

/**
 * "I cooked this" — closes the maintenance loop.
 *
 * Asks the server for a proposed deduction plan, shows it for confirmation, and
 * applies it only when the user agrees. Amounts are editable, because the Scribe
 * guessing "0.15 of a bulb" is a starting point the user should be able to
 * correct ("I only used half the onion") rather than a verdict.
 */
export default function CookedThis({ recipeId, onApplied }: CookedThisProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<CookPlan | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<AppliedDeduction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (recipeId == null) return null;

  const resetAndClose = () => {
    setOpen(false);
    setPlan(null);
    setAmounts({});
    setApplied(null);
    setError(null);
  };

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setPlan(null);
    setApplied(null);
    try {
      const res = await fetch('/api/cook/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not work out what you used.');
      const nextPlan = data.plan as CookPlan;
      setPlan(nextPlan);
      const seeded: Record<string, string> = {};
      nextPlan.deductions.forEach((line) => {
        seeded[line.fridgeItemId] = formatQuantity(line.deduct);
      });
      setAmounts(seeded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
    setLoading(false);
  };

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    setError(null);
    try {
      const deductions = plan.deductions
        .map((line) => ({
          fridgeItemId: line.fridgeItemId,
          deduct: Number.parseFloat(amounts[line.fridgeItemId] ?? '')
        }))
        .filter((entry) => Number.isFinite(entry.deduct) && entry.deduct > 0);

      const res = await fetch('/api/cook/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deductions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update your fridge.');
      setApplied((data.applied || []) as AppliedDeduction[]);
      if (onApplied) onApplied();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
    setApplying(false);
  };

  const nothingToDeduct = plan !== null && plan.deductions.length === 0;

  return (
    <>
      <button type="button" className="btn mt-2" onClick={handleOpen}>
        I cooked this
      </button>

      <Modal open={open} onClose={resetAndClose} title="Update your fridge">
        {loading && <p className="page-lead">Working out what you used…</p>}

        {error && <p className="app-message app-message--error">{error}</p>}

        {/* Post-apply summary. */}
        {applied && (
          <div>
            <p className="page-lead">
              {applied.length > 0
                ? 'Your fridge has been updated.'
                : 'Nothing was changed.'}
            </p>
            {applied.length > 0 && (
              <ul className="app-ingredient-list app-ingredient-list--spaced mb-2">
                {applied.map((line) => (
                  <li key={line.fridgeItemId}>
                    {line.name}: {formatQuantity(line.before)} → {formatQuantity(line.after)}{' '}
                    {line.unit}
                    {line.depleted && <span className="text-danger"> (used up)</span>}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn" onClick={resetAndClose}>
              Done
            </button>
          </div>
        )}

        {/* The plan, awaiting confirmation. */}
        {plan && !applied && !loading && (
          <div>
            {nothingToDeduct ? (
              <p className="page-lead">
                Nothing in your fridge matched this recipe, so there is nothing to deduct.
              </p>
            ) : (
              <>
                <p className="page-lead">
                  Here is what we think you used. Adjust anything that looks wrong — set an
                  amount to 0 to leave that item alone.
                </p>
                <ul className="app-ingredient-list app-ingredient-list--spaced mb-2">
                  {plan.deductions.map((line) => {
                    const rawAmount = amounts[line.fridgeItemId] ?? '';
                    const parsed = Number.parseFloat(rawAmount);
                    const after = remainingAfter(line.before, parsed);
                    return (
                      <li key={line.fridgeItemId}>
                        <div className="app-field">
                          <label className="app-label">
                            {line.name} — have {formatQuantity(line.before)} {line.unit}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rawAmount}
                            aria-label={`Amount of ${line.name} used`}
                            onChange={(e) => {
                              const next = e.target.value.replace(/[^0-9.]/g, '');
                              setAmounts((prev) => ({
                                ...prev,
                                [line.fridgeItemId]: next
                              }));
                            }}
                          />
                        </div>
                        <div>
                          Uses {rawAmount === '' ? '0' : rawAmount} {line.unit} → leaves{' '}
                          {formatQuantity(after)} {line.unit}
                          {after === 0 && <span className="text-danger"> (used up)</span>}
                        </div>
                        {line.why && <div className="app-label">{line.why}</div>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {plan.question && (
              <div className="app-subsection">
                <h4 className="app-subsection-title">One thing we weren&apos;t sure about</h4>
                <p>{plan.question}</p>
              </div>
            )}

            {plan.unmatched.length > 0 && (
              <div className="app-subsection">
                <h4 className="app-subsection-title">Not deducted</h4>
                <p className="page-lead">
                  These weren&apos;t matched to anything in your fridge, so they were left alone.
                </p>
                <ul className="app-ingredient-list mb-2">
                  {plan.unmatched.map((name, idx) => (
                    <li key={idx}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2">
              {!nothingToDeduct && (
                <button
                  type="button"
                  className="btn"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? 'Updating…' : 'Update my fridge'}
                </button>
              )}{' '}
              <button type="button" className="btn" onClick={resetAndClose} disabled={applying}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
