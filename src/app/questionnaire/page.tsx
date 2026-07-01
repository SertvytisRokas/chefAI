"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import {
  type PersonalizationAnswers,
  DEFAULT_PERSONALIZATION,
  GENDERS,
  DIET_TYPES,
  ACTIVITY_LEVELS,
  DIETARY_LIFESTYLES,
  RELIGIOUS_RESTRICTIONS,
  PRIMARY_GOALS,
  MEAL_FREQUENCY_OPTIONS,
  CUISINE_OPTIONS,
  SPICE_LEVELS,
  FLAVOR_OPTIONS,
  PROTEIN_OPTIONS,
  COOKING_SKILL_LEVELS,
  TIME_TO_COOK_OPTIONS,
  APPLIANCE_OPTIONS,
  GROCERY_FREQUENCY_OPTIONS,
  BUDGET_OPTIONS
} from '../../lib/personalization';

const sectionStyles = {
  section: 'app-section',
  sectionTitle: 'app-section-title',
  sectionDesc: 'app-section-desc',
  field: 'app-field',
  label: 'app-label',
  row: 'app-row',
  unitToggle: 'app-segmented',
  unitBtn: (active: boolean) => `app-segmented-btn${active ? ' active' : ''}`,
  sliderRow: 'app-slider-row',
  slider: 'app-slider',
  inputSmall: 'app-input-sm',
  chipGrid: 'app-chip-grid',
  chip: (active: boolean) => `app-chip${active ? ' active' : ''}`,
  listItem: 'app-list-item',
  listInput: 'app-input-grow',
};

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

const HEIGHT_CM_MIN = 100;
const HEIGHT_CM_MAX = 250;
const WEIGHT_KG_MIN = 30;
const WEIGHT_KG_MAX = 200;
const KG_TO_LBS = 2.20462;
const CM_TO_IN = 0.393701;

function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cm * CM_TO_IN);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}
function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) / CM_TO_IN);
}
function kgToLbs(kg: number): number {
  return Math.round(kg * KG_TO_LBS);
}
function lbsToKg(lbs: number): number {
  return Math.round((lbs / KG_TO_LBS) * 10) / 10;
}

/** Smooth category slider: value 0–100 maps to category index; n = categories.length */
function valueToCategoryIndex(value: number, n: number): number {
  return Math.min(n - 1, Math.floor((value / 100) * n));
}
function categoryIndexToValue(index: number, n: number): number {
  return ((index + 0.5) / n) * 100;
}

/**
 * Personalization quiz page. Five sections: Physical & Body Profile,
 * Dietary Preferences & Restrictions, Health & Wellness Goals,
 * Taste & Cuisine Preferences, Cooking & Lifestyle Habits.
 * Loads/saves from user_personalization and syncs diet/allergens/preferences
 * for the recipe generator.
 */
export default function QuestionnairePage() {
  const { supabase } = useSupabase();
  const user = useUser();
  const [answers, setAnswers] = useState<PersonalizationAnswers>({ ...DEFAULT_PERSONALIZATION });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof PersonalizationAnswers>(key: K, value: PersonalizationAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleMulti = useCallback(
    (key: keyof PersonalizationAnswers, value: string, current: string[] | null | undefined) => {
      const arr = Array.isArray(current) ? [...current] : [];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      set(key, arr.length ? arr : null);
    },
    [set]
  );

  type ListKey = 'allergens' | 'favoriteIngredientsDishes' | 'kitchenAppliancesOther' | 'preferredProteins' | 'favoriteCuisinesOther' | 'cuisinesToLimitOther' | 'flavorPreferencesOther';
  const addToList = useCallback(
    (key: ListKey, newItem: string) => {
      const trimmed = newItem.trim();
      if (!trimmed) return;
      const current = answers[key];
      const arr = Array.isArray(current) ? [...current] : [];
      if (arr.includes(trimmed)) return;
      set(key, [...arr, trimmed]);
    },
    [answers, set]
  );

  const removeFromList = useCallback((key: ListKey, index: number) => {
    setAnswers((prev) => {
      const current = prev[key];
      const arr = Array.isArray(current) ? [...current] : [];
      if (index < 0 || index >= arr.length) return prev;
      const next = arr.slice(0, index).concat(arr.slice(index + 1));
      return { ...prev, [key]: next.length ? next : null };
    });
  }, []);

  const togglePrimaryGoal = useCallback(
    (goal: string) => {
      const current = Array.isArray(answers.primaryGoals) ? [...answers.primaryGoals] : [];
      const idx = current.indexOf(goal);
      if (idx >= 0) {
        set('primaryGoals', current.length === 1 ? null : current.filter((_, i) => i !== idx));
      } else if (current.length < 3) {
        set('primaryGoals', [...current, goal]);
      }
    },
    [answers.primaryGoals, set]
  );
  const addPrimaryGoalOther = useCallback(
    (custom: string) => {
      const trimmed = custom.trim();
      if (!trimmed) return;
      const current = Array.isArray(answers.primaryGoals) ? [...answers.primaryGoals] : [];
      if (current.length >= 3 || current.includes(trimmed)) return;
      set('primaryGoals', [...current, trimmed]);
    },
    [answers.primaryGoals, set]
  );
  const removePrimaryGoal = useCallback((index: number) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev.primaryGoals) ? [...prev.primaryGoals] : [];
      if (index < 0 || index >= current.length) return prev;
      const next = current.filter((_, i) => i !== index);
      return { ...prev, primaryGoals: next.length ? next : null };
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('user_personalization')
        .select('answers')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.answers && typeof data.answers === 'object') {
        const raw = data.answers as Record<string, unknown>;
        const migrated: Record<string, unknown> = { ...raw };
        if (migrated.heightValue == null && raw.heightFt != null && raw.heightIn != null) {
          migrated.heightValue = ftInToCm(Number(raw.heightFt), Number(raw.heightIn));
        }
        if (!Array.isArray(migrated.primaryGoals) && (raw.primaryGoal != null || raw.primaryGoalOther != null)) {
          const goals: string[] = [];
          if (raw.primaryGoal) goals.push(String(raw.primaryGoal));
          if (raw.primaryGoalOther) goals.push(String(raw.primaryGoalOther));
          migrated.primaryGoals = goals.length ? goals : null;
        }
        if (raw.favoriteCuisinesOther != null && !Array.isArray(raw.favoriteCuisinesOther)) {
          migrated.favoriteCuisinesOther = [String(raw.favoriteCuisinesOther)].filter(Boolean);
        }
        if (raw.cuisinesToLimitOther != null && !Array.isArray(raw.cuisinesToLimitOther)) {
          migrated.cuisinesToLimitOther = [String(raw.cuisinesToLimitOther)].filter(Boolean);
        }
        if (raw.flavorPreferencesOther != null && !Array.isArray(raw.flavorPreferencesOther)) {
          migrated.flavorPreferencesOther = [String(raw.flavorPreferencesOther)].filter(Boolean);
        }
        setAnswers((prev) => ({ ...prev, ...migrated } as PersonalizationAnswers));
      }
      setLoading(false);
    };
    load();
  }, [supabase, user]);

  const handleSave = async () => {
    if (!user) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const payload = { ...answers };
      const { error: upsertError } = await supabase
        .from('user_personalization')
        .upsert(
          {
          user_id: user.id,
            answers: payload,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
      if (upsertError) throw upsertError;

      // Sync profiles.diet_type_id
      if (payload.dietType) {
        const { data: dietRow } = await supabase
          .from('diet_types')
          .select('id')
          .eq('name', payload.dietType)
          .maybeSingle();
        if (dietRow?.id) {
          await supabase.from('profiles').upsert(
            { user_id: user.id, diet_type_id: dietRow.id, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        }
      }

      // Sync user_allergens: replace with personalization allergens
      await supabase.from('user_allergens').delete().eq('user_id', user.id);
      const allergens = Array.isArray(payload.allergens) ? payload.allergens.filter(Boolean) : [];
      if (allergens.length > 0) {
        await supabase.from('user_allergens').insert(allergens.map((name) => ({ user_id: user.id, name })));
      }

      // Sync user_preferences: likes from favorite ingredients + preferred proteins + favorite cuisines; dislikes from cuisines to limit
      await supabase.from('user_preferences').delete().eq('user_id', user.id);
      const likes: string[] = [
        ...(Array.isArray(payload.favoriteIngredientsDishes) ? payload.favoriteIngredientsDishes : []),
        ...(Array.isArray(payload.preferredProteins) ? payload.preferredProteins : []),
        ...(Array.isArray(payload.favoriteCuisines) ? payload.favoriteCuisines.filter((c) => c !== 'Other') : []),
        ...(Array.isArray(payload.favoriteCuisinesOther) ? payload.favoriteCuisinesOther : [])
      ].filter(Boolean);
      const dislikes = [
        ...(Array.isArray(payload.cuisinesToLimit) ? payload.cuisinesToLimit.filter(Boolean) : []),
        ...(Array.isArray(payload.cuisinesToLimitOther) ? payload.cuisinesToLimitOther : [])
      ].filter(Boolean);
      const toInsert: { user_id: string; name: string; preference_type: 'like' | 'dislike' }[] = [
        ...likes.map((name) => ({ user_id: user.id, name, preference_type: 'like' as const })),
        ...dislikes.map((name) => ({ user_id: user.id, name, preference_type: 'dislike' as const }))
      ];
      if (toInsert.length > 0) {
        await supabase.from('user_preferences').insert(toInsert);
      }

      setMessage('Saved. Your preferences will be used by the recipe generator.');
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="app-page">
        <p className="page-lead">
          Please <a href="/login">log in</a> to complete the personalization quiz.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-page">
        <p className="app-list-empty">Loading your saved answers…</p>
      </div>
    );
  }

  const ageVal = answers.age;
  const ageNumber = typeof ageVal === 'number' ? clamp(ageVal, 1, 120) : 30;
  const heightCm = answers.heightValue ?? 170;
  const weightKg = answers.weightValue ?? 70;
  const activityN = ACTIVITY_LEVELS.length;
  const activitySliderVal = answers.activityLevelValue ?? (answers.activityLevel != null
    ? categoryIndexToValue(ACTIVITY_LEVELS.indexOf(answers.activityLevel), activityN)
    : 50);
  const spiceN = SPICE_LEVELS.length;
  const spiceSliderVal = answers.spiceLevelValue ?? (answers.spiceLevel != null
    ? categoryIndexToValue(SPICE_LEVELS.indexOf(answers.spiceLevel), spiceN)
    : 50);
  const skillN = COOKING_SKILL_LEVELS.length;
  const skillSliderVal = answers.cookingSkillLevelValue ?? (answers.cookingSkillLevel != null
    ? categoryIndexToValue(COOKING_SKILL_LEVELS.indexOf(answers.cookingSkillLevel), skillN)
    : 25);
  const primaryGoalsList = Array.isArray(answers.primaryGoals) ? answers.primaryGoals : [];
  const weightGoalKg = answers.weightGoalValue ?? 70;

  return (
    <div className="app-page">
      <h1 className="page-title">Personalization</h1>
      <p className="page-lead">
        Your answers tailor portion sizes, diet, cuisines, and recipe suggestions. You can edit them anytime.
      </p>
      {error && <p className="app-message app-message--error">{error}</p>}
      {message && <p className="app-message app-message--success">{message}</p>}

      {/* 1. Physical & Body Profile */}
      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.sectionTitle}>1. Physical & Body Profile</h2>
        <p className={sectionStyles.sectionDesc}>
          Basic metrics to estimate nutritional needs and portion sizes (e.g. caloric needs for a larger or more active person).
        </p>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Age</label>
          <div className={sectionStyles.row}>
            <input
              type="range"
              min={1}
              max={120}
              value={ageVal === 'prefer not to say' || ageVal == null ? 30 : clamp(ageNumber, 1, 120)}
              onChange={(e) => set('age', parseInt(e.target.value, 10))}
              className={sectionStyles.slider}
            />
            <input
              type="text"
              inputMode="numeric"
              value={ageVal === 'prefer not to say' ? '' : (ageVal ?? '')}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') set('age', null);
                else set('age', parseInt(v, 10) || 0);
              }}
              onBlur={() => set('age', ageVal != null && ageVal !== 'prefer not to say' ? clamp(ageVal as number, 1, 120) : ageVal)}
              placeholder="Age"
              className={sectionStyles.inputSmall}
            />
            <button
              type="button"
              className={sectionStyles.unitBtn(ageVal === 'prefer not to say')}
              onClick={() => set('age', ageVal === 'prefer not to say' ? ageNumber : 'prefer not to say')}
            >
              Prefer not to say
            </button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Gender</label>
          <div className={sectionStyles.chipGrid}>
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                className={sectionStyles.chip(answers.gender === g)}
                onClick={() => set('gender', answers.gender === g ? null! : g)}
              >
                {g.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Height</label>
          <div className={sectionStyles.unitToggle}>
            <button
              type="button"
              className={sectionStyles.unitBtn(answers.heightUnit === 'cm')}
              onClick={() => set('heightUnit', 'cm')}
            >
              cm
            </button>
            <button
              type="button"
              className={sectionStyles.unitBtn(answers.heightUnit === 'ft')}
              onClick={() => set('heightUnit', 'ft')}
            >
              ft / in
            </button>
          </div>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={HEIGHT_CM_MIN}
              max={HEIGHT_CM_MAX}
              value={clamp(heightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX)}
              onChange={(e) => set('heightValue', parseInt(e.target.value, 10))}
              className={sectionStyles.slider}
            />
            {answers.heightUnit === 'ft' ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cmToFtIn(heightCm).ft}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    const ft = v === '' ? 0 : parseInt(v, 10);
                    set('heightValue', ftInToCm(ft, cmToFtIn(heightCm).in));
                  }}
                  onBlur={() => set('heightValue', answers.heightValue != null ? clamp(answers.heightValue, HEIGHT_CM_MIN, HEIGHT_CM_MAX) : heightCm)}
                  className={`${sectionStyles.inputSmall} app-input-sm--xs`}
                />
                <span className="app-slider-label">ft</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cmToFtIn(heightCm).in}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    const inVal = v === '' ? 0 : parseInt(v, 10);
                    set('heightValue', ftInToCm(cmToFtIn(heightCm).ft, isNaN(inVal) ? 0 : inVal));
                  }}
                  onBlur={() => set('heightValue', answers.heightValue != null ? clamp(answers.heightValue, HEIGHT_CM_MIN, HEIGHT_CM_MAX) : heightCm)}
                  className={`${sectionStyles.inputSmall} app-input-sm--xs`}
                />
                <span className="app-slider-label">in</span>
              </>
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={answers.heightValue ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  if (v === '') set('heightValue', null);
                  else set('heightValue', parseInt(v, 10) || 0);
                }}
                onBlur={() => set('heightValue', answers.heightValue != null ? clamp(answers.heightValue, HEIGHT_CM_MIN, HEIGHT_CM_MAX) : null)}
                className={sectionStyles.inputSmall}
              />
            )}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Weight</label>
          <div className={sectionStyles.unitToggle}>
            <button
              type="button"
              className={sectionStyles.unitBtn(answers.weightUnit === 'kg')}
              onClick={() => set('weightUnit', 'kg')}
            >
              kg
            </button>
            <button
              type="button"
              className={sectionStyles.unitBtn(answers.weightUnit === 'lbs')}
              onClick={() => set('weightUnit', 'lbs')}
            >
              lbs
            </button>
          </div>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={WEIGHT_KG_MIN}
              max={WEIGHT_KG_MAX}
              value={clamp(weightKg, WEIGHT_KG_MIN, WEIGHT_KG_MAX)}
              onChange={(e) => set('weightValue', parseFloat(e.target.value))}
              className={sectionStyles.slider}
            />
            {answers.weightUnit === 'lbs' ? (
              <input
                type="text"
                inputMode="numeric"
                value={kgToLbs(weightKg)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  if (v === '') set('weightValue', null);
                  else set('weightValue', lbsToKg(parseFloat(v) || 0));
                }}
                onBlur={() => set('weightValue', answers.weightValue != null ? clamp(answers.weightValue, WEIGHT_KG_MIN, WEIGHT_KG_MAX) : null)}
                className={sectionStyles.inputSmall}
              />
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={answers.weightValue ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  if (v === '') set('weightValue', null);
                  else set('weightValue', parseFloat(v) || 0);
                }}
                onBlur={() => set('weightValue', answers.weightValue != null ? clamp(answers.weightValue, WEIGHT_KG_MIN, WEIGHT_KG_MAX) : null)}
                className={sectionStyles.inputSmall}
              />
            )}
            <span className="app-slider-label app-slider-label--unit">{answers.weightUnit === 'lbs' ? 'lbs' : 'kg'}</span>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Activity level</label>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={activitySliderVal}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                set('activityLevelValue', v);
                set('activityLevel', ACTIVITY_LEVELS[valueToCategoryIndex(v, activityN)]);
              }}
              className={sectionStyles.slider}
            />
            <span className="app-slider-value">{ACTIVITY_LEVELS[valueToCategoryIndex(activitySliderVal, activityN)]}</span>
          </div>
        </div>
      </section>

      {/* 2. Dietary Preferences & Restrictions */}
      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.sectionTitle}>2. Dietary Preferences & Restrictions</h2>
        <p className={sectionStyles.sectionDesc}>
          Diet type, lifestyle diet, and religious/cultural guidelines so the AI suggests suitable recipes and omits unsuitable ones.
        </p>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Diet type</label>
          <div className={sectionStyles.chipGrid}>
            {DIET_TYPES.map((d) => (
              <button
                key={d}
                type="button"
                className={sectionStyles.chip(answers.dietType === d)}
                onClick={() => set('dietType', answers.dietType === d ? null! : d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Dietary lifestyle</label>
          <div className={sectionStyles.chipGrid}>
            {DIETARY_LIFESTYLES.filter((x) => x !== 'other').map((d) => (
              <button
                key={d}
                type="button"
                className={sectionStyles.chip((answers.dietaryLifestyle ?? []).includes(d))}
                onClick={() => toggleMulti('dietaryLifestyle', d, answers.dietaryLifestyle)}
              >
                {d}
              </button>
            ))}
          </div>
                <input
                  type="text"
            placeholder="Other (freeform)"
            value={answers.dietaryLifestyleOther ?? ''}
            onChange={(e) => set('dietaryLifestyleOther', e.target.value || null)}
            className="mt-2 app-input--max-sm"
                />
              </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Religious / cultural restrictions</label>
          <div className={sectionStyles.chipGrid}>
            {RELIGIOUS_RESTRICTIONS.filter((x) => x !== 'Other').map((r) => (
              <button
                key={r}
                type="button"
                className={sectionStyles.chip((answers.religiousRestrictions ?? []).includes(r))}
                onClick={() => toggleMulti('religiousRestrictions', r, answers.religiousRestrictions)}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Other (freeform)"
            value={answers.religiousRestrictionsOther ?? ''}
            onChange={(e) => set('religiousRestrictionsOther', e.target.value || null)}
            className="mt-2 app-input--max-sm"
          />
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Allergens (foods to avoid)</label>
          {(answers.allergens ?? []).map((a, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{a}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('allergens', i)}>
                Remove
              </button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input
              type="text"
              id="new-allergen"
              placeholder="Add allergen"
              className={sectionStyles.listInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const el = e.target as HTMLInputElement;
                  addToList('allergens', el.value);
                  el.value = '';
                }
              }}
            />
          <button
              type="button"
            className="btn btn-xs"
              onClick={() => {
                const el = document.getElementById('new-allergen') as HTMLInputElement | null;
                if (el) {
                  addToList('allergens', el.value);
                  el.value = '';
                }
              }}
            >
              Add
            </button>
          </div>
        </div>
      </section>

      {/* 3. Health & Wellness Goals */}
      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.sectionTitle}>3. Health & Wellness Goals</h2>
        <p className={sectionStyles.sectionDesc}>
          Goals so the AI can tailor recipes (e.g. calorie targets, high-protein for muscle gain, low-sodium for heart health).
        </p>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Primary goal (select up to 3) — {primaryGoalsList.length}/3 selected</label>
          <div className={sectionStyles.chipGrid}>
            {PRIMARY_GOALS.filter((g) => g !== 'other').map((g) => (
              <button
                key={g}
                type="button"
                className={sectionStyles.chip(primaryGoalsList.includes(g))}
                onClick={() => togglePrimaryGoal(g)}
                disabled={!primaryGoalsList.includes(g) && primaryGoalsList.length >= 3}
              >
                {g}
              </button>
            ))}
          </div>
          {primaryGoalsList.filter((g) => !(PRIMARY_GOALS as readonly string[]).includes(g)).map((g, i) => (
            <div key={`other-${i}`} className="app-list-item mt-2">
              <span className={sectionStyles.listInput}>{g}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removePrimaryGoal(primaryGoalsList.indexOf(g))}>
                Remove
              </button>
            </div>
          ))}
          {primaryGoalsList.length < 3 && (
            <div className={sectionStyles.listItem}>
              <input
                type="text"
                id="new-primary-goal"
                placeholder="Add other goal"
                className={sectionStyles.listInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const el = e.target as HTMLInputElement;
                    addPrimaryGoalOther(el.value);
                    el.value = '';
                  }
                }}
              />
              <button
                type="button"
              className="btn btn-xs"
                onClick={() => {
                  const el = document.getElementById('new-primary-goal') as HTMLInputElement | null;
                  if (el) {
                    addPrimaryGoalOther(el.value);
                    el.value = '';
                  }
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Target weight (if weight management is a goal)</label>
          <div className={sectionStyles.unitToggle}>
            <button type="button" className={sectionStyles.unitBtn(answers.weightGoalUnit === 'kg')} onClick={() => set('weightGoalUnit', 'kg')}>
              kg
            </button>
            <button type="button" className={sectionStyles.unitBtn(answers.weightGoalUnit === 'lbs')} onClick={() => set('weightGoalUnit', 'lbs')}>
              lbs
            </button>
          </div>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={WEIGHT_KG_MIN}
              max={WEIGHT_KG_MAX}
              value={weightGoalKg}
              onChange={(e) => set('weightGoalValue', parseFloat(e.target.value))}
              className={sectionStyles.slider}
            />
            {answers.weightGoalUnit === 'lbs' ? (
            <span className={`${sectionStyles.inputSmall} app-input-badge`}>
                {kgToLbs(weightGoalKg)} lbs
              </span>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={weightGoalKg}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  if (v === '') set('weightGoalValue', null);
                  else set('weightGoalValue', clamp(parseFloat(v) || 0, WEIGHT_KG_MIN, WEIGHT_KG_MAX));
                }}
                className={sectionStyles.inputSmall}
              />
            )}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Daily calorie target (kcal)</label>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={1000}
              max={4000}
              step={50}
              value={clamp(answers.dailyCalorieTarget ?? 2000, 1000, 4000)}
              onChange={(e) => set('dailyCalorieTarget', parseInt(e.target.value, 10))}
              className={sectionStyles.slider}
            />
            <input
              type="text"
              inputMode="numeric"
              value={answers.dailyCalorieTarget ?? ''}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') set('dailyCalorieTarget', null);
                else set('dailyCalorieTarget', parseInt(v, 10) || 0);
              }}
              onBlur={() => set('dailyCalorieTarget', answers.dailyCalorieTarget != null ? clamp(answers.dailyCalorieTarget, 1000, 4000) : null)}
              className={sectionStyles.inputSmall}
            />
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Meals per day</label>
          <div className={sectionStyles.chipGrid}>
            {MEAL_FREQUENCY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={sectionStyles.chip(answers.mealFrequency === n)}
                onClick={() => set('mealFrequency', answers.mealFrequency === n ? null! : n)}
              >
                {n === 5 ? '5+' : String(n)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Taste & Cuisine Preferences */}
      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.sectionTitle}>4. Taste & Cuisine Preferences</h2>
        <p className={sectionStyles.sectionDesc}>
          Cuisines and flavors you enjoy so recipe suggestions are more appealing.
        </p>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Favorite cuisines</label>
          <div className={sectionStyles.chipGrid}>
            {CUISINE_OPTIONS.filter((c) => c !== 'Other').map((c) => (
              <button
                key={c}
                type="button"
                className={sectionStyles.chip((answers.favoriteCuisines ?? []).includes(c))}
                onClick={() => toggleMulti('favoriteCuisines', c, answers.favoriteCuisines)}
              >
                {c}
              </button>
            ))}
          </div>
          {(answers.favoriteCuisinesOther ?? []).map((item, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{item}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('favoriteCuisinesOther', i)}>
                Remove
              </button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input type="text" id="new-favorite-cuisine" placeholder="Add other cuisine" className={sectionStyles.listInput} onKeyDown={(e) => { if (e.key === 'Enter') { const el = e.target as HTMLInputElement; addToList('favoriteCuisinesOther', el.value); el.value = ''; } }} />
            <button type="button" className="btn btn-xs" onClick={() => { const el = document.getElementById('new-favorite-cuisine') as HTMLInputElement | null; if (el) { addToList('favoriteCuisinesOther', el.value); el.value = ''; } }}>Add</button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Cuisines to limit</label>
          <div className={sectionStyles.chipGrid}>
            {CUISINE_OPTIONS.filter((c) => c !== 'Other').map((c) => (
              <button
                key={c}
                type="button"
                className={sectionStyles.chip((answers.cuisinesToLimit ?? []).includes(c))}
                onClick={() => toggleMulti('cuisinesToLimit', c, answers.cuisinesToLimit)}
              >
                {c}
              </button>
            ))}
          </div>
          {(answers.cuisinesToLimitOther ?? []).map((item, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{item}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('cuisinesToLimitOther', i)}>Remove</button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input type="text" id="new-cuisine-limit" placeholder="Add other cuisine to limit" className={sectionStyles.listInput} onKeyDown={(e) => { if (e.key === 'Enter') { const el = e.target as HTMLInputElement; addToList('cuisinesToLimitOther', el.value); el.value = ''; } }} />
            <button type="button" className="btn btn-xs" onClick={() => { const el = document.getElementById('new-cuisine-limit') as HTMLInputElement | null; if (el) { addToList('cuisinesToLimitOther', el.value); el.value = ''; } }}>Add</button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Spice level</label>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={spiceSliderVal}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                set('spiceLevelValue', v);
                set('spiceLevel', SPICE_LEVELS[valueToCategoryIndex(v, spiceN)]);
              }}
              className={sectionStyles.slider}
            />
            <span className="app-slider-value">{SPICE_LEVELS[valueToCategoryIndex(spiceSliderVal, spiceN)]}</span>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Flavor preferences</label>
          <div className={sectionStyles.chipGrid}>
            {FLAVOR_OPTIONS.filter((f) => f !== 'other').map((f) => (
              <button
                key={f}
                type="button"
                className={sectionStyles.chip((answers.flavorPreferences ?? []).includes(f))}
                onClick={() => toggleMulti('flavorPreferences', f, answers.flavorPreferences)}
              >
                {f}
              </button>
            ))}
          </div>
          {(answers.flavorPreferencesOther ?? []).map((item, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{item}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('flavorPreferencesOther', i)}>Remove</button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input type="text" id="new-flavor" placeholder="Add other flavor" className={sectionStyles.listInput} onKeyDown={(e) => { if (e.key === 'Enter') { const el = e.target as HTMLInputElement; addToList('flavorPreferencesOther', el.value); el.value = ''; } }} />
            <button type="button" className="btn btn-xs" onClick={() => { const el = document.getElementById('new-flavor') as HTMLInputElement | null; if (el) { addToList('flavorPreferencesOther', el.value); el.value = ''; } }}>Add</button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Preferred proteins</label>
          <div className={sectionStyles.chipGrid}>
            {PROTEIN_OPTIONS.filter((p) => p !== 'other').map((p) => (
              <button
                key={p}
                type="button"
                className={sectionStyles.chip((answers.preferredProteins ?? []).includes(p))}
                onClick={() => toggleMulti('preferredProteins', p, answers.preferredProteins)}
              >
                {p}
              </button>
            ))}
          </div>
          {(answers.preferredProteins ?? []).filter((p) => !PROTEIN_OPTIONS.includes(p as any)).map((p, i) => (
            <div key={`other-${i}`} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{p}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('preferredProteins', (answers.preferredProteins ?? []).indexOf(p))}>
                Remove
              </button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input
              type="text"
              id="new-protein"
              placeholder="Add other protein"
              className={sectionStyles.listInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const el = e.target as HTMLInputElement;
                  addToList('preferredProteins', el.value);
                  el.value = '';
                }
              }}
            />
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => {
                const el = document.getElementById('new-protein') as HTMLInputElement | null;
                if (el) {
                  addToList('preferredProteins', el.value);
                  el.value = '';
                }
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Favorite ingredients or dishes</label>
          {(answers.favoriteIngredientsDishes ?? []).map((item, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{item}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('favoriteIngredientsDishes', i)}>
                Remove
              </button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input
              type="text"
              id="new-favorite-ingredient"
              placeholder="Add ingredient or dish"
              className={sectionStyles.listInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const el = e.target as HTMLInputElement;
                  addToList('favoriteIngredientsDishes', el.value);
                  el.value = '';
                }
              }}
            />
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => {
                const el = document.getElementById('new-favorite-ingredient') as HTMLInputElement | null;
                if (el) {
                  addToList('favoriteIngredientsDishes', el.value);
                  el.value = '';
                }
              }}
            >
              Add
            </button>
          </div>
        </div>
      </section>

      {/* 5. Cooking & Lifestyle Habits */}
      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.sectionTitle}>5. Cooking & Lifestyle Habits</h2>
        <p className={sectionStyles.sectionDesc}>
          Cooking skill, time, and kitchen resources so suggestions are practical (e.g. simpler recipes for beginners, using available appliances).
        </p>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Cooking skill level</label>
          <div className={sectionStyles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={skillSliderVal}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                set('cookingSkillLevelValue', v);
                set('cookingSkillLevel', COOKING_SKILL_LEVELS[valueToCategoryIndex(v, skillN)]);
              }}
              className={sectionStyles.slider}
            />
            <span className="app-slider-value">{COOKING_SKILL_LEVELS[valueToCategoryIndex(skillSliderVal, skillN)]}</span>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Time to cook per meal</label>
          <div className={sectionStyles.chipGrid}>
            {TIME_TO_COOK_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={sectionStyles.chip(answers.timeToCook === t)}
                onClick={() => set('timeToCook', answers.timeToCook === t ? null! : t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Kitchen appliances available</label>
          <div className={sectionStyles.chipGrid}>
            {APPLIANCE_OPTIONS.filter((a) => a !== 'other').map((a) => (
              <button
                key={a}
                type="button"
                className={sectionStyles.chip((answers.kitchenAppliances ?? []).includes(a))}
                onClick={() => toggleMulti('kitchenAppliances', a, answers.kitchenAppliances)}
              >
                {a}
              </button>
            ))}
          </div>
          {(answers.kitchenAppliancesOther ?? []).map((a, i) => (
            <div key={i} className={sectionStyles.listItem}>
              <span className={sectionStyles.listInput}>{a}</span>
              <button type="button" className="btn-cancel btn-xs" onClick={() => removeFromList('kitchenAppliancesOther', i)}>
                Remove
              </button>
            </div>
          ))}
          <div className={sectionStyles.listItem}>
            <input
              type="text"
              id="new-appliance"
              placeholder="Add other appliance"
              className={sectionStyles.listInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const el = e.target as HTMLInputElement;
                  addToList('kitchenAppliancesOther', el.value);
                  el.value = '';
                }
              }}
            />
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => {
                const el = document.getElementById('new-appliance') as HTMLInputElement | null;
                if (el) {
                  addToList('kitchenAppliancesOther', el.value);
                  el.value = '';
                }
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Grocery shopping frequency</label>
          <div className={sectionStyles.chipGrid}>
            {GROCERY_FREQUENCY_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                className={sectionStyles.chip(answers.groceryFrequency === g)}
                onClick={() => set('groceryFrequency', answers.groceryFrequency === g ? null! : g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className={sectionStyles.field}>
          <label className={sectionStyles.label}>Budget sensitivity</label>
          <div className={sectionStyles.chipGrid}>
            {BUDGET_OPTIONS.map((b) => (
              <button
                key={b}
                type="button"
                className={sectionStyles.chip(answers.budgetSensitivity === b)}
                onClick={() => set('budgetSensitivity', answers.budgetSensitivity === b ? null! : b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="app-actions-row mt-4">
        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}
