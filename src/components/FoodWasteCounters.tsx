"use client";

import { useEffect, useState } from 'react';

/**
 * Live counters derived from published global estimates.
 * Rates are linear projections from annual figures — illustrative,
 * not real-time sensor data.
 *
 * Sources:
 * - UNEP Food Waste Index Report 2021 (~931M tonnes/year consumer + retail)
 * - FAO SOFI 2023 (~735M people facing chronic hunger, 2022)
 * - FAO: ~1/3 of food produced for human consumption is lost or wasted
 */

const TONNES_PER_YEAR = 931_000_000;
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = TONNES_PER_YEAR / SECONDS_PER_YEAR;

/** Rough average meal mass used for "meals recoverable" estimate */
const KG_PER_MEAL = 0.45;

const HUNGER_COUNT = 735_000_000;

function yearStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString();
}

function formatTonnes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} million t`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K t`;
  return `${Math.floor(n).toLocaleString()} t`;
}

export default function FoodWasteCounters() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const yearElapsedSec = (now - yearStartMs()) / 1000;
  const todayElapsedSec = (now - todayStartMs()) / 1000;

  const wastedThisYear = yearElapsedSec * TONNES_PER_SECOND;
  const wastedToday = todayElapsedSec * TONNES_PER_SECOND;
  const mealsFromTodayWaste = (wastedToday * 1000) / KG_PER_MEAL;

  const counters = [
    {
      label: 'Food wasted this year',
      value: formatTonnes(wastedThisYear),
      sub: 'Projected from ~931M t/year globally',
    },
    {
      label: 'Food wasted today',
      value: formatTonnes(wastedToday),
      sub: 'Updating live',
    },
    {
      label: 'People facing hunger',
      value: formatCompact(HUNGER_COUNT),
      sub: 'FAO estimate (2022)',
    },
    {
      label: 'Meals lost from today\u2019s waste',
      value: formatCompact(mealsFromTodayWaste),
      sub: 'If redirected at ~450 g per meal',
    },
  ];

  return (
    <div className="waste-counters">
      {counters.map((c) => (
        <div key={c.label} className="waste-counter-card">
          <p className="waste-counter-value">{c.value}</p>
          <p className="waste-counter-label">{c.label}</p>
          <p className="waste-counter-sub">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
