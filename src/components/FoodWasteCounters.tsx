"use client";

import { useEffect, useState } from 'react';

/**
 * Counter types (shown on each card tag):
 *
 * - Live projection — ticks in real time from a published global *rate*
 *   (e.g. tonnes wasted per second, derived from an annual total).
 *
 * - Derived estimate — computed from published inputs via a documented
 *   formula (e.g. PoU × population, or waste mass ÷ meal size). Not a
 *   single reported live counter.
 */

const TONNES_PER_YEAR = 1_300_000_000; // UNEP / FAO cited global loss + waste total
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = TONNES_PER_YEAR / SECONDS_PER_YEAR;

/** ~450 g edible portion per meal (derived from FAO minimum dietary energy needs) */
const KG_PER_MEAL = 0.45;

/**
 * FAO SDG 2.1.1: Number of undernourished ≈ PoU × population.
 * PoU 8.2% globally in 2024 (FAO SOFI 2025).
 * Population: UN World Population Prospects 2024 medium variant (~71M/year).
 */
const POPULATION_REF_MS = new Date(2025, 0, 1).getTime();
const POPULATION_REF = 8_120_000_000;
const POPULATION_GROWTH_PER_YEAR = 71_000_000;
const POU_2024 = 0.082;

const SOURCES = {
  /** Annual ~1.3B t loss + waste figure */
  unepAnnualWaste:
    'https://www.unep.org/news-and-stories/story/no-time-waste-using-data-drive-down-food-waste',
  /** FAO custodian of global food loss measurement (SDG 12.3.1.a) */
  faoFoodLossPlatform: 'https://www.fao.org/platform-food-loss-waste/en/',
  /** FAO PoU methodology — NoU = prevalence × population (SDG 2.1.1) */
  faoPouMethod:
    'https://www.fao.org/3/cd6008en/online/state-food-security-and-nutrition-2025/food-security-nutrition-indicators.html',
  /** FAO food loss & waste data used for meal-equivalent derivation */
  faoFlwData: 'https://www.fao.org/platform-food-loss-waste/flw-data/en/',
} as const;

type CounterTier = 'live' | 'derived';

const TIER_LABEL: Record<CounterTier, string> = {
  live: 'Live projection',
  derived: 'Derived estimate',
};

function yearStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function worldPopulationAt(ms: number): number {
  const yearsElapsed = (ms - POPULATION_REF_MS) / (SECONDS_PER_YEAR * 1000);
  return POPULATION_REF + yearsElapsed * POPULATION_GROWTH_PER_YEAR;
}

/** FAO method: undernourished headcount = PoU × population (annual PoU applied to today's pop). */
function hungerToday(ms: number): number {
  return worldPopulationAt(ms) * POU_2024;
}

function formatTonnesFull(tonnes: number): string {
  return `${Math.floor(tonnes).toLocaleString('en-US')} t`;
}

function formatMillions(n: number): string {
  const millions = n / 1_000_000;
  return `${millions.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;
}

type CounterDef = {
  id: string;
  label: string;
  display: string;
  tier: CounterTier;
  sourceHref: string;
  sourceTitle: string;
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
  const hungerCount = hungerToday(now);
  const mealsFromTodayWaste = (wastedToday * 1000) / KG_PER_MEAL;

  const counters: CounterDef[] = [
    {
      id: 'year-waste',
      label: 'Food wasted this year',
      display: formatTonnesFull(wastedThisYear),
      tier: 'live',
      sourceHref: SOURCES.unepAnnualWaste,
      sourceTitle: 'UNEP: ~1.3 billion tonnes lost or wasted annually',
    },
    {
      id: 'today-waste',
      label: 'Food wasted today',
      display: formatTonnesFull(wastedToday),
      tier: 'live',
      sourceHref: SOURCES.faoFoodLossPlatform,
      sourceTitle: 'FAO Technical Platform on Food Loss and Waste (SDG 12.3)',
    },
    {
      id: 'hunger',
      label: 'People facing hunger today',
      display: formatMillions(hungerCount),
      tier: 'derived',
      sourceHref: SOURCES.faoPouMethod,
      sourceTitle: 'FAO SOFI 2025: PoU × population (SDG indicator 2.1.1)',
    },
    {
      id: 'meals',
      label: 'Meals lost from today\u2019s waste',
      display: formatMillions(mealsFromTodayWaste),
      tier: 'derived',
      sourceHref: SOURCES.faoFlwData,
      sourceTitle: 'FAO FLW data; meal size derived from dietary energy needs',
    },
  ];

  return (
    <div className="waste-counters">
      {counters.map((c) => (
        <div key={c.id} className="waste-counter-card">
          <p className="waste-counter-label">{c.label}</p>
          <p className="waste-counter-value">{c.display}</p>
          <a
            href={c.sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`waste-counter-tier waste-counter-tier--${c.tier}`}
            title={c.sourceTitle}
          >
            {TIER_LABEL[c.tier]}
          </a>
        </div>
      ))}
    </div>
  );
}
