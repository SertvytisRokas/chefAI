"use client";

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import { generateRecipe, type RecipeResult } from '../../lib/llmProvider';
import { preferencesFromPersonalization } from '../../lib/personalization';
import type { PersonalizationAnswers } from '../../lib/personalization';

interface Option {
  id: number;
  name: string;
}

/**
 * The Genius page allows users to generate recipes from their fridge
 * contents. It lets the user select a meal type and number of
 * portions, then calls a local LLM via the `/api/generate` route or
 * directly via the client to produce a recipe. Results are shown
 * below the form.
 */
export default function GeniusPage() {
  const { supabase } = useSupabase();
  const user = useUser();
  const [mealTypes, setMealTypes] = useState<Option[]>([]);
  // Local state for fridge items and measurement types. We avoid using
  // generated types here to reduce coupling to the database schema.
  const [fridgeItems, setFridgeItems] = useState<any[]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<any[]>([]);
  const [selectedMealType, setSelectedMealType] = useState<number | null>(null);
  const [portions, setPortions] = useState<number>(1);
  const [suggestMode, setSuggestMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [missing, setMissing] = useState<{ name: string; quantity: number; unit: string }[]>([]);
  const [addedToShopping, setAddedToShopping] = useState<boolean>(false);
  const [recipeId, setRecipeId] = useState<number | null>(null);
  const [rating, setRating] = useState<number | ''>('');
  const [feedback, setFeedback] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  // Indicates whether the currently displayed recipe was generated in
  // suggest mode. This is separate from the suggestMode state used
  // to generate new recipes.
  const [currentSuggest, setCurrentSuggest] = useState<boolean>(false);

  // Load meal types, fridge items and measurement types on mount.
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Meal types
      const { data: mTypes, error: mError } = await supabase
        .from('meal_types')
        .select('*')
        .order('id');
      if (mError) {
        setError(mError.message);
        return;
      }
      setMealTypes(mTypes || []);
      if (mTypes && mTypes.length > 0) {
        setSelectedMealType(mTypes[0].id);
      }
      // Fridge items
      const { data: items, error: iError } = await supabase
        .from('fridge_items')
        .select('*')
        .eq('user_id', user.id);
      if (iError) {
        setError(iError.message);
      } else {
        setFridgeItems(items || []);
      }
      // Measurement types
      const { data: mt, error: mtError } = await supabase
        .from('measurement_types')
        .select('*');
      if (mtError) {
        setError(mtError.message);
      } else {
        setMeasurementTypes(mt || []);
      }
    };
    load();
  }, [supabase, user]);

  // Load last generated recipe from localStorage when the user (and fridge
  // items) are available, so the recipe persists after refresh or navigation.
  // Uses a user-scoped key so each user sees their own last recipe.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const storageKey = `lastRecipe_${user.id}`;
    const saved = localStorage.getItem(storageKey) ?? localStorage.getItem('lastRecipe');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (!parsed || !parsed.recipe) return;
      const savedRecipe: RecipeResult = parsed.recipe;
      setRecipe(savedRecipe);
      setRecipeId(parsed.recipeId ?? null);
      setRating(parsed.rating ?? '');
      setFeedback(parsed.feedback ?? '');
      setCurrentSuggest(parsed.suggest === true);
      // Recompute missing ingredients only when recipe was in suggest mode and we have fridge data
      if (parsed.suggest === true && fridgeItems.length > 0) {
        const normalizeBase = (str: string) => {
          const lower = str.toLowerCase().trim();
          // Remove non letters and split into words
          const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
          let last = words[words.length - 1] || lower;
          // Convert plural forms to singular when simple (remove trailing s/es)
          if (last.endsWith('es') && last.length > 3) {
            last = last.slice(0, -2);
          } else if (last.endsWith('s') && last.length > 3) {
            last = last.slice(0, -1);
          }
          // Map common synonyms to their base forms
          const synonyms: Record<string, string> = {
            toast: 'bread',
            sliced: 'bread',
            baguette: 'bread',
            roll: 'bread',
            loaf: 'bread',
            arborio: 'rice',
            jasmine: 'rice',
            basmati: 'rice',
            brown: 'rice'
          };
          const base = synonyms[last] || last;
          return base;
        };
        const fridgeTokens = fridgeItems.map((i) => {
          const full = i.name.toLowerCase().trim();
          const base = normalizeBase(i.name);
          return { full, base };
        });
        const missingRecalc: { name: string; quantity: number; unit: string }[] = [];
        savedRecipe.ingredients.forEach((ing: any) => {
          const ingFull = ing.name.toLowerCase().trim();
          const ingBase = normalizeBase(ing.name);
          let found = false;
          for (const f of fridgeTokens) {
            if (
              f.full === ingFull ||
              f.base === ingBase ||
              f.full.includes(ingBase) ||
              ingBase.includes(f.base)
            ) {
              found = true;
              break;
            }
          }
          if (!found) {
            const parts = ing.quantity.trim().split(/\s+/);
            let qty = 1;
            let unit = '';
            if (parts.length >= 2) {
              const maybeNum = parseFloat(parts[0]);
              if (!Number.isNaN(maybeNum)) {
                qty = maybeNum;
                unit = parts[1].toLowerCase();
              }
            }
            missingRecalc.push({ name: ing.name, quantity: qty, unit });
          }
        });
        setMissing(missingRecalc);
      } else {
        setMissing([]);
      }
      setAddedToShopping(parsed.addedToShopping ?? false);
    } catch (e) {
      // ignore parse errors
    }
  }, [user, fridgeItems]);

  // Persist current recipe + rating/feedback to localStorage when they change so refresh/navigation keeps them.
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !recipe) return;
    try {
      const storageKey = `lastRecipe_${user.id}`;
      const payload = {
        recipe,
        suggest: currentSuggest,
        recipeId: recipeId ?? null,
        rating,
        feedback,
        addedToShopping
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }, [user, recipe, recipeId, rating, feedback, currentSuggest, addedToShopping]);

  const handleGenerate = async () => {
    if (!user || fridgeItems.length === 0) {
      setError('Your fridge is empty. Add items first.');
      return;
    }
    setLoading(true);
    setError(null);
    let savedRecipeId: number | null = null;
    let result: RecipeResult | null = null;
    try {
      // Build fridge array for LLM. Use measurementTypes to convert
      // measurement_type_id into human‑readable unit name.
      const fridgePayload = fridgeItems.map((item) => {
        const measurementName =
          measurementTypes.find((m) => m.id === item.measurement_type_id)?.name || '';
        return {
          name: item.name,
          quantity: item.quantity,
          unit: measurementName,
          expires: item.expiration_date
        };
      });
      // Prefer user_personalization (quiz) for preferences; fall back to profiles + user_allergens + user_preferences
      let prefsObj: { diet?: string; allergens: string[]; likes: string[]; dislikes: string[] };
      let personalization: PersonalizationAnswers | null = null;
      const { data: personalizationRow } = await supabase
        .from('user_personalization')
        .select('answers')
        .eq('user_id', user.id)
        .maybeSingle();
      if (personalizationRow?.answers && typeof personalizationRow.answers === 'object') {
        personalization = personalizationRow.answers as PersonalizationAnswers;
        prefsObj = preferencesFromPersonalization(personalization);
      } else {
        const { data: profileData, error: pError } = await supabase
          .from('profiles')
          .select('diet_type_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (pError) throw pError;
        const profile = profileData as { diet_type_id?: number } | null;
        let dietName: string | undefined;
        if (profile?.diet_type_id) {
          const { data: dietType } = await supabase
            .from('diet_types')
            .select('name')
            .eq('id', profile.diet_type_id)
            .single();
          dietName = (dietType as any)?.name;
        }
        const { data: allergenRows } = await supabase
          .from('user_allergens')
          .select('name')
          .eq('user_id', user.id);
        const allergens: string[] = allergenRows
          ? (allergenRows as { name: string }[]).map((row) => row.name)
          : [];
        const { data: prefsData } = await supabase
          .from('user_preferences')
          .select('name, preference_type')
          .eq('user_id', user.id);
        const prefs = prefsData as { name: string; preference_type: string }[] | null;
        let likes: string[] = [];
        let dislikes: string[] = [];
        if (prefs && prefs.length > 0) {
          prefs.forEach((p) => {
            if (p.preference_type === 'like') likes.push(p.name);
            else dislikes.push(p.name);
          });
        }
        prefsObj = { diet: dietName, allergens, likes, dislikes };
      }
      const mealName = mealTypes.find((m) => m.id === selectedMealType)?.name;
      result = await generateRecipe(fridgePayload, prefsObj, {
        mealType: mealName,
        portions,
        suggestMode
      }, personalization);
      setRecipe(result);
      // Record whether this recipe was generated in suggest mode
      setCurrentSuggest(suggestMode);
      // Compute missing ingredients when suggestMode is enabled.  We
      // treat an ingredient as missing if its name does not match any
      // fridge item name (case-insensitive).  Quantities and units are
      // parsed from the ingredient.quantity string when possible.
      if (suggestMode) {
        // Normalise fridge item names to support partial, singular/plural and synonyms.
        const normalizeBase = (str: string) => {
          const lower = str.toLowerCase().trim();
          // Remove non letters and split into words
          const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
          let last = words[words.length - 1] || lower;
          // Convert plural forms to singular when simple (remove trailing s/es)
          if (last.endsWith('es') && last.length > 3) {
            last = last.slice(0, -2);
          } else if (last.endsWith('s') && last.length > 3) {
            last = last.slice(0, -1);
          }
          // Synonyms mapping to normalise variants
          const synonyms: Record<string, string> = {
            toast: 'bread',
            sliced: 'bread',
            baguette: 'bread',
            roll: 'bread',
            loaf: 'bread',
            arborio: 'rice',
            jasmine: 'rice',
            basmati: 'rice',
            brown: 'rice'
          };
          const base = synonyms[last] || last;
          return base;
        };
        const fridgeTokens = fridgeItems.map((i) => {
          const full = i.name.toLowerCase().trim();
          const base = normalizeBase(i.name);
          return { full, base };
        });
        const missingItems: { name: string; quantity: number; unit: string }[] = [];
        result.ingredients.forEach((ing) => {
          const ingFull = ing.name.toLowerCase().trim();
          const ingBase = normalizeBase(ing.name);
          // Determine if ingredient is available by comparing base tokens or full names
          let found = false;
          for (const f of fridgeTokens) {
            if (
              f.full === ingFull ||
              f.base === ingBase ||
              f.full.includes(ingBase) ||
              ingBase.includes(f.base)
            ) {
              found = true;
              break;
            }
          }
          if (!found) {
            // Parse quantity and unit from quantity string
            const parts = ing.quantity.trim().split(/\s+/);
            let qty = 1;
            let unit = '';
            if (parts.length >= 2) {
              const maybeNum = parseFloat(parts[0]);
              if (!Number.isNaN(maybeNum)) {
                qty = maybeNum;
                unit = parts[1].toLowerCase();
              }
            }
            missingItems.push({ name: ing.name, quantity: qty, unit });
          }
        });
        setMissing(missingItems);
      } else {
        setMissing([]);
      }
      // When generating a new recipe, reset addedToShopping state
      setAddedToShopping(false);
      // Insert the generated recipe into the recipes table.  Avoid
      // creating duplicate entries by checking if a recipe with the
      // same title already exists for this user.  If it exists we
      // reuse its ID instead of inserting a new row.  We also
      // persist the diet_type_id to enable filtering in history.
      if (user) {
        // Find existing recipe (case-insensitive match on title)
        const { data: existingRec } = await supabase
          .from('recipes')
          .select('id')
          .eq('user_id', user.id)
          .ilike('title', result.title)
          .maybeSingle();
        let recId: number | null = null;
        if (existingRec && 'id' in existingRec) {
          recId = (existingRec as any).id;
        }
        // Use diet type from the same LLM that generated the recipe
        const knownDiets = ['vegan', 'vegetarian', 'pescatarian', 'omnivore'];
        const dietNameRaw =
          result.dietType && typeof result.dietType === 'string'
            ? result.dietType.trim().toLowerCase()
            : '';
        const validDietName = knownDiets.includes(dietNameRaw) ? dietNameRaw : null;
        let classifiedDietId: number | null = null;
        if (validDietName) {
          const { data: dtRow } = await supabase
            .from('diet_types')
            .select('id')
            .eq('name', validDietName)
            .maybeSingle();
          if (dtRow && 'id' in dtRow) {
            classifiedDietId = (dtRow as any).id;
          }
        }
        if (recId) {
          savedRecipeId = recId;
          setRecipeId(recId);
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from('recipes')
            .insert({
              user_id: user.id,
              title: result.title,
              meal_type_id: selectedMealType,
              ingredients: result.ingredients,
              steps: result.steps,
              diet_type_id: classifiedDietId
            })
            .select('id');
          if (!insertError && inserted && inserted.length > 0) {
            recId = inserted[0].id as number;
            savedRecipeId = recId;
            setRecipeId(recId);
          } else {
            console.error('Error inserting recipe:', insertError?.message);
            setRecipeId(null);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate recipe');
    }
    setLoading(false);

    // Persist the generated recipe to localStorage so it survives refresh and navigation.
    if (typeof window !== 'undefined' && result) {
      try {
        const storageKey = user ? `lastRecipe_${user.id}` : 'lastRecipe';
        const payload: any = {
          recipe: result,
          suggest: suggestMode,
          recipeId: savedRecipeId ?? null,
          rating: rating,
          feedback: feedback,
          addedToShopping: false
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (e) {
        // ignore localStorage errors
      }
    }
  };

  // Add missing ingredients to shopping list. Aggregates quantities
  // across existing entries and disables the button after adding.
  async function handleAddToShopping() {
    if (!user || missing.length === 0) return;
    setAddedToShopping(true);
    // Fetch measurement types to resolve IDs
    const { data: mtData } = await supabase.from('measurement_types').select('*');
    const mtList = mtData || [];
    for (const item of missing) {
      // Find measurement_type_id for unit; fallback to 'pieces' if
      // unknown
      const mt = mtList.find((m) => m.name.toLowerCase() === item.unit);
      const fallback = mtList.find((m) => m.name.toLowerCase() === 'pieces');
      const mtId = mt ? mt.id : fallback?.id;
      if (!mtId) continue;
      // Check if item already exists in shopping list
      const { data: existing } = await supabase
        .from('shopping_list')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('name', item.name)
        .eq('measurement_type_id', mtId)
        .maybeSingle();
      if (existing && 'id' in existing) {
        // Update quantity
        await supabase
          .from('shopping_list')
          .update({ quantity: (existing as any).quantity + item.quantity })
          .eq('id', (existing as any).id);
      } else {
        // Insert new
        await supabase.from('shopping_list').insert({
          user_id: user.id,
          name: item.name,
          quantity: item.quantity,
          measurement_type_id: mtId
        });
      }
    }
  }

  // Save feedback for a single recipe generated on this page
  async function handleSaveFeedback() {
    if (!user || !recipeId) return;
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ rating: rating || null, feedback: feedback || null })
      .eq('id', recipeId);
    if (updateError) {
      setError(updateError.message || 'Failed to save feedback');
    } else {
      setError('Feedback saved!');
    }
  }

  return (
    <div className="mt-8">
      {!user ? (
        <p className="mt-4">
          Please <a href="/login">log in</a> to generate recipes.
        </p>
      ) : (
        <>
          <h1
            style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}
          >
            Genius Recipe Generator
          </h1>
          {error && (
            <p style={{ color: 'var(--error-color)', marginBottom: '1rem' }}>{error}</p>
          )}
          <div style={{ maxWidth: '320px', display: 'flex', flexDirection: 'column' }}>
            <label className="mb-1">Suggest mode</label>
            <div style={{ marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                id="suggestMode"
                checked={suggestMode}
                onChange={(e) => {
                  // Only update suggestMode for the next generation. Do not
                  // alter the current recipe or its missing items. Do not
                  // reset addedToShopping here.
                  setSuggestMode(e.target.checked);
                }}
              />
              <label htmlFor="suggestMode" style={{ marginLeft: '0.5rem' }}>
                Suggest recipes even if you need to buy extra ingredients
              </label>
            </div>
            <label className="mb-1">Meal type</label>
            <select
              value={selectedMealType ?? undefined}
              onChange={(e) => setSelectedMealType(parseInt(e.target.value))}
            >
              {mealTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <label className="mb-1 mt-2">Number of portions</label>
            <input
              type="text"
              inputMode="numeric"
              value={portions}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') setPortions(1);
                else setPortions(Math.max(1, parseInt(v, 10) || 1));
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || fridgeItems.length === 0}
              className="btn"
              style={{ marginTop: '1rem' }}
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {recipe && (
            <div
              style={{
                marginTop: '1.5rem',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '1rem'
              }}
            >
              <h2
                style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}
              >
                {recipe.title}
              </h2>
              <h3 style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Ingredients</h3>
              <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
                {recipe.ingredients.map((ing, idx) => (
                  <li key={idx}>
                    <span
                      style={{
                        color:
                          currentSuggest &&
                          missing.find((m) => m.name.toLowerCase() === ing.name.toLowerCase())
                            ? 'var(--error-color)'
                            : undefined
                      }}
                    >
                      {ing.quantity} {ing.name}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Steps</h3>
              <ol style={{ paddingLeft: '1.25rem' }}>
                {recipe.steps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem' }}>
                    {step}
                  </li>
                ))}
              </ol>
              {currentSuggest && missing.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.25rem' }}>Missing ingredients</h4>
                  <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
                    {missing.map((m, idx) => (
                      <li key={idx}>
                        {m.quantity} {m.unit} {m.name}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn"
                    onClick={handleAddToShopping}
                    disabled={addedToShopping}
                  >
                    {addedToShopping ? 'Added to Shopping List' : 'Add Missing Ingredients to Shopping List'}
                  </button>
                </div>
              )}
              {recipeId && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.25rem' }}>Leave Feedback</h4>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ marginRight: '0.5rem' }}>Rating:</label>
                    <select
                      value={rating}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRating(val ? parseInt(val) : '');
                      }}
                    >
                      <option value="">--</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}⭐
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem' }}>Feedback:</label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={3}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <button className="btn" onClick={handleSaveFeedback}>
                    Save Feedback
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}