"use client";

import { useEffect, useState } from 'react';

/**
 * Live projections from published FAO / UNEP annual figures.
 * Sources linked on each card tag.
 */

const TONNES_PER_YEAR = 1_300_000_000; // UNEP / FAO global food waste estimate
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = TONNES_PER_YEAR / SECONDS_PER_YEAR;
const KG_PER_MEAL = 0.45;

/**
 * FAO SOFI 2025: ~673M undernourished in 2024, down ~15M from 733M in 2023.
 * Linearized: year-start baseline + annual change spread across the year.
 * @see https://www.fao.org/newsroom/detail/global-hunger-declines--but-rises-in-africa-and-western-asia--un-report/en
 */
const HUNGER_YEAR_START = 658_000_000;
const HUNGER_ANNUAL_CHANGE = -15_000_000;
const HUNGER_PER_SECOND = HUNGER_ANNUAL_CHANGE / SECONDS_PER_YEAR;

const SOURCES = {
  unepFoodWaste:
    'https://www.unep.org/resources/publication/food-waste-index-report-2024',
  faoFoodLoss:
    'https://www.fao.org/interactive/state-of-food-loss-and-waste/en/',
  faoSofi:
    'https://www.fao.org/newsroom/detail/global-hunger-declines--but-rises-in-africa-and-western-asia--un-report/en',
} as const;

type CounterTier = 'live' | 'estimated';

const TIER_LABEL: Record<CounterTier, string> = {
  live: 'Live projection',
  estimated: 'Derived estimate',
};

function yearStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
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
  const hungerCount = HUNGER_YEAR_START + yearElapsedSec * HUNGER_PER_SECOND;
  const mealsFromTodayWaste = (wastedToday * 1000) / KG_PER_MEAL;

  const counters: CounterDef[] = [
    {
      id: 'year-waste',
      label: 'Food wasted this year',
      display: formatTonnesFull(wastedThisYear),
      tier: 'live',
      sourceHref: SOURCES.unepFoodWaste,
    },
    {
      id: 'today-waste',
      label: 'Food wasted today',
      display: formatTonnesFull(wastedToday),
      tier: 'live',
      sourceHref: SOURCES.faoFoodLoss,
    },
    {
      id: 'hunger',
      label: 'People facing hunger',
      display: formatMillions(hungerCount),
      tier: 'live',
      sourceHref: SOURCES.faoSofi,
    },
    {
      id: 'meals',
      label: 'Meals lost from today\u2019s waste',
      display: formatMillions(mealsFromTodayWaste),
      tier: 'estimated',
      sourceHref: SOURCES.unepFoodWaste,
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
          >
            {TIER_LABEL[c.tier]}
          </a>
        </div>
      ))}
    </div>
  );
}
