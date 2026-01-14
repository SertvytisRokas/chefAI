"use client";

import { useState, useEffect } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import type { Database } from '../../lib/types';
import { generateRecipe, type RecipeResult } from '../../lib/llmProvider';

interface Option {
  id: number;
  name: string;
}

export default function GeniusPage() {
  const supabase = useSupabaseClient<Database>();
  const user = useUser();
  const [mealTypes, setMealTypes] = useState<Option[]>([]);
  const [fridgeItems, setFridgeItems] = useState<Database['public']['Tables']['fridge_items']['Row'][]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<
    Database['public']['Tables']['measurement_types']['Row'][]
  >([]);
  const [selectedMealType, setSelectedMealType] = useState<number | null>(null);
  const [portions, setPortions] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
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
      const { data: items, error: iError } = await supabase
        .from('fridge_items')
        .select('*')
        .eq('user_id', user.id);
      if (iError) {
        setError(iError.message);
      } else {
        setFridgeItems(items || []);
      }
      // Load measurement types for units mapping
      const { data: mt, error: mtError } = await supabase.from('measurement_types').select('*');
      if (mtError) {
        setError(mtError.message);
      } else {
        setMeasurementTypes(mt || []);
      }
    };
    load();
  }, [supabase, user]);

  const handleGenerate = async () => {
    if (!user || fridgeItems.length === 0) {
      setError('Your fridge is empty. Add items first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Build fridge array for LLM. Use measurementTypes to convert
      // measurement_type_id into human-readable unit name.
      const fridgePayload = fridgeItems.map((item) => {
        const measurementName = measurementTypes.find((m) => m.id === item.measurement_type_id)?.name || '';
        return {
          name: item.name,
          quantity: item.quantity,
          unit: measurementName,
          expires: item.expiration_date
        };
      });
      // Fetch user preferences (diet, allergens, likes, dislikes)
      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('diet_type_id')
        .eq('user_id', user.id)
        .single();
      if (pError) throw pError;
      // Get diet name from diet_types
      let dietName: string | undefined;
      if (profile?.diet_type_id) {
        const { data: dietType } = await supabase
          .from('diet_types')
          .select('name')
          .eq('id', profile.diet_type_id)
          .single();
        dietName = dietType?.name;
      }
      // Get allergens for user (free-form names)
      const { data: allergenRows } = await supabase
        .from('user_allergens')
        .select('name')
        .eq('user_id', user.id);
      const allergens: string[] = allergenRows ? allergenRows.map((row) => row.name) : [];
      // Get user preferences (free-form names and types)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('name, preference_type')
        .eq('user_id', user.id);
      let likes: string[] = [];
      let dislikes: string[] = [];
      if (prefs && prefs.length > 0) {
        prefs.forEach((p) => {
          if (p.preference_type === 'like') likes.push(p.name);
          else dislikes.push(p.name);
        });
      }
      // Compose preferences object
      const prefsObj = {
        diet: dietName,
        allergens,
        likes,
        dislikes
      };
      const mealName = mealTypes.find((m) => m.id === selectedMealType)?.name;
      const result = await generateRecipe(fridgePayload, prefsObj, {
        mealType: mealName,
        portions
      });
      setRecipe(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate recipe');
    }
    setLoading(false);
  };

  return (
    <div>
      {!user ? (
        <p className="mt-4">
          Please{' '}
          <a href="/login" className="text-blue-600 underline">
            log in
          </a>{' '}
          to generate recipes.
        </p>
      ) : (
        <>
          <h1 className="text-xl font-semibold mb-4">Genius Recipe Generator</h1>
          {error && <p className="text-red-600 mb-4">{error}</p>}
          <div className="mb-4 flex flex-col space-y-2">
            <label className="font-medium">Meal type</label>
            <select
              className="border rounded px-2 py-1 max-w-xs"
              value={selectedMealType ?? undefined}
              onChange={(e) => setSelectedMealType(parseInt(e.target.value))}
            >
              {mealTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <label className="font-medium mt-2">Number of portions</label>
            <input
              type="number"
              min="1"
              className="border rounded px-2 py-1 max-w-xs"
              value={portions}
              onChange={(e) => setPortions(parseInt(e.target.value))}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || fridgeItems.length === 0}
              className="mt-4 bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {recipe && (
            <div className="border rounded-md p-4 bg-white shadow-md">
              <h2 className="text-lg font-semibold mb-2">{recipe.title}</h2>
              <h3 className="font-medium mb-1">Ingredients</h3>
              <ul className="list-disc list-inside mb-2">
                {recipe.ingredients.map((ing, idx) => (
                  <li key={idx}>
                    {ing.quantity} {ing.name}
                  </li>
                ))}
              </ul>
              <h3 className="font-medium mb-1">Steps</h3>
              <ol className="list-decimal list-inside space-y-1">
                {recipe.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}