"use client";

import { useEffect, useState } from 'react';

/**
 * Live-style counters projected from published FAO / UNEP annual figures.
 * There is no official UN live API — third-party widgets (e.g. live-counter.com)
 * use the same ~1.3B t/year FAO estimate at ~41 t/s; we tick locally so styling
 * matches the app.
 *
 * Source tiers:
 * - LIVE (projected): annual rate → elapsed time this year / today
 * - OFFICIAL (static): FAO hunger figure from SOFI reports
 * - ESTIMATED (derived): meals calculable from today's waste projection
 */

const TONNES_PER_YEAR = 1_300_000_000; // FAO / UNEP cited global estimate
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = TONNES_PER_YEAR / SECONDS_PER_YEAR;
const KG_PER_MEAL = 0.45;

/** FAO SOFI 2023 — people facing chronic hunger (2022 data), not live-updated */
const HUNGER_COUNT = 735_000_000;

type CounterTier = 'live' | 'official' | 'estimated';

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M t`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K t`;
  return `${Math.floor(n).toLocaleString()} t`;
}

const TIER_LABEL: Record<CounterTier, string> = {
  live: 'Live projection',
  official: 'Official estimate',
  estimated: 'Derived estimate',
};

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

  const counters: {
    label: string;
    value: string;
    sub: string;
    tier: CounterTier;
  }[] = [
    {
      label: 'Food wasted this year',
      value: formatTonnes(wastedThisYear),
      sub: '1.3B t/year rate (FAO / UNEP)',
      tier: 'live',
    },
    {
      label: 'Food wasted today',
      value: formatTonnes(wastedToday),
      sub: '~41 tonnes per second globally',
      tier: 'live',
    },
    {
      label: 'People facing hunger',
      value: formatCompact(HUNGER_COUNT),
      sub: 'FAO SOFI 2023 (2022 data)',
      tier: 'official',
    },
    {
      label: 'Meals lost from today\u2019s waste',
      value: formatCompact(mealsFromTodayWaste),
      sub: 'At ~450 g per meal — illustrative',
      tier: 'estimated',
    },
  ];

  return (
    <div className="waste-counters">
      {counters.map((c) => (
        <div key={c.label} className="waste-counter-card">
          <span className={`waste-counter-tier waste-counter-tier--${c.tier}`}>
            {TIER_LABEL[c.tier]}
          </span>
          <p className="waste-counter-value">{c.value}</p>
          <p className="waste-counter-label">{c.label}</p>
          <p className="waste-counter-sub">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
