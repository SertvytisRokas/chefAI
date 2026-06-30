"use client";

import { useEffect, useState } from 'react';

/**
 * Live-style counters projected from published FAO / UNEP annual figures.
 * Click a value to cycle through 4 display scales (default + 3 drill-downs).
 */

const TONNES_PER_YEAR = 1_300_000_000;
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = TONNES_PER_YEAR / SECONDS_PER_YEAR;
const KG_PER_MEAL = 0.45;
const HUNGER_COUNT = 735_000_000;

type CounterTier = 'live' | 'official' | 'estimated';
type DrillLevel = 0 | 1 | 2 | 3;
type CounterKind = 'mass' | 'count-million' | 'count-billion';

const TIER_LABEL: Record<CounterTier, string> = {
  live: 'Live projection',
  official: 'Official estimate',
  estimated: 'Derived estimate',
};

const DRILL_HINT = 'Click value to change scale';

function yearStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function nextLevel(level: DrillLevel): DrillLevel {
  return ((level + 1) % 4) as DrillLevel;
}

/** Tonnes: M t → ×100K t → K t → t / kg if &lt; 1 t */
function formatMass(tonnes: number, level: DrillLevel): string {
  const kg = tonnes * 1000;

  if (tonnes < 1) {
    return `${Math.round(kg).toLocaleString()} kg`;
  }

  switch (level) {
    case 0:
      return `${(tonnes / 1_000_000).toFixed(2)}M t`;
    case 1:
      return `${(tonnes / 100_000).toFixed(1)}×100K t`;
    case 2:
      return `${(tonnes / 1_000).toFixed(1)}K t`;
    case 3:
      return `${Math.round(tonnes).toLocaleString()} t`;
    default:
      return `${(tonnes / 1_000_000).toFixed(2)}M t`;
  }
}

/** People (M default) or meals (B default): max unit → ×100K → K → raw */
function formatCount(n: number, level: DrillLevel, kind: 'count-million' | 'count-billion'): string {
  switch (level) {
    case 0:
      if (kind === 'count-billion') {
        return `${(n / 1_000_000_000).toFixed(2)}B`;
      }
      return `${(n / 1_000_000).toFixed(1)}M`;
    case 1:
      return `${(n / 100_000).toFixed(1)}×100K`;
    case 2:
      return `${(n / 1_000).toFixed(1)}K`;
    case 3:
      return Math.round(n).toLocaleString();
    default:
      return kind === 'count-billion'
        ? `${(n / 1_000_000_000).toFixed(2)}B`
        : `${(n / 1_000_000).toFixed(1)}M`;
  }
}

function formatValue(raw: number, kind: CounterKind, level: DrillLevel): string {
  if (kind === 'mass') return formatMass(raw, level);
  return formatCount(raw, level, kind);
}

type CounterDef = {
  id: string;
  label: string;
  raw: number;
  kind: CounterKind;
  sub: string;
  tier: CounterTier;
};

export default function FoodWasteCounters() {
  const [now, setNow] = useState(() => Date.now());
  const [drillLevels, setDrillLevels] = useState<Record<string, DrillLevel>>({});

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const yearElapsedSec = (now - yearStartMs()) / 1000;
  const todayElapsedSec = (now - todayStartMs()) / 1000;

  const wastedThisYear = yearElapsedSec * TONNES_PER_SECOND;
  const wastedToday = todayElapsedSec * TONNES_PER_SECOND;
  const mealsFromTodayWaste = (wastedToday * 1000) / KG_PER_MEAL;

  const counters: CounterDef[] = [
    {
      id: 'year-waste',
      label: 'Food wasted this year',
      raw: wastedThisYear,
      kind: 'mass',
      sub: '1.3B t/year rate (FAO / UNEP)',
      tier: 'live',
    },
    {
      id: 'today-waste',
      label: 'Food wasted today',
      raw: wastedToday,
      kind: 'mass',
      sub: '~41 tonnes per second globally',
      tier: 'live',
    },
    {
      id: 'hunger',
      label: 'People facing hunger',
      raw: HUNGER_COUNT,
      kind: 'count-million',
      sub: 'FAO SOFI 2023 (2022 data)',
      tier: 'official',
    },
    {
      id: 'meals',
      label: 'Meals lost from today\u2019s waste',
      raw: mealsFromTodayWaste,
      kind: 'count-billion',
      sub: 'At ~450 g per meal — illustrative',
      tier: 'estimated',
    },
  ];

  const cycleDrill = (id: string) => {
    setDrillLevels((prev) => ({
      ...prev,
      [id]: nextLevel(prev[id] ?? 0),
    }));
  };

  return (
    <div className="waste-counters">
      {counters.map((c) => {
        const level = drillLevels[c.id] ?? 0;
        const display = formatValue(c.raw, c.kind, level);

        return (
          <div key={c.id} className="waste-counter-card">
            <p className="waste-counter-label">{c.label}</p>
            <button
              type="button"
              className="waste-counter-value"
              onClick={() => cycleDrill(c.id)}
              title={DRILL_HINT}
              aria-label={`${c.label}: ${display}. ${DRILL_HINT}`}
            >
              {display}
            </button>
            <span className={`waste-counter-tier waste-counter-tier--${c.tier}`}>
              {TIER_LABEL[c.tier]}
            </span>
            <p className="waste-counter-sub">{c.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
