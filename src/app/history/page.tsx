"use client";

import { useEffect, useState } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import Modal from '../../components/Modal';

interface RecipeRecord {
  id: number;
  title: string;
  created_at: string;
  rating: number | null;
  feedback: string | null;
  favorite: boolean;
  meal_type_id: number | null;
  diet_type_id: number | null;
  meal_types?: { name: string } | null;
  diet_types?: { name: string } | null;
  ingredients?: { name: string; quantity: string }[];
  steps?: string[];
}

/**
 * Recipe history page. Displays past recipes in a sortable, searchable
 * table. Users can mark favourites, filter by rating, meal type,
 * diet type or favourites, and search by recipe name. Clicking a
 * row opens a modal with the full recipe details (ingredients and
 * steps). Duplicate recipes (same title) are deduplicated at
 * insertion time, so the list shows only unique titles.
 */
export default function HistoryPage() {
  const { supabase } = useSupabase();
  const user = useUser();
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'title' | 'rating' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterRating, setFilterRating] = useState<number | 'any'>('any');
  const [filterMeal, setFilterMeal] = useState<number | 'any'>('any');
  const [filterDiet, setFilterDiet] = useState<number | 'any'>('any');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [mealTypes, setMealTypes] = useState<{ id: number; name: string }[]>([]);
  const [dietTypes, setDietTypes] = useState<{ id: number; name: string }[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load meal types, diet types and recipes on mount or user change
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      // Fetch meal types and diet types for filters
      const { data: mTypes } = await supabase.from('meal_types').select('id,name');
      const { data: dTypes } = await supabase.from('diet_types').select('id,name');
      setMealTypes(mTypes || []);
      setDietTypes(dTypes || []);
      // Fetch recipes with joins to meal_types and diet_types; limit to this user's recipes
      const { data, error } = await supabase
        .from('recipes')
        .select(
          'id,title,created_at,rating,feedback,favorite,meal_type_id,diet_type_id,ingredients,steps,meal_types(id,name),diet_types(id,name)'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading recipes:', error.message);
        setRecipes([]);
      } else {
        // Supabase returns nested arrays for meal_types and diet_types
        // (e.g., meal_types: [{ id, name }]). Flatten these to single objects.
        const mapped = (data ?? []).map((rec: any) => {
          const mealType = Array.isArray(rec.meal_types)
            ? rec.meal_types[0] || null
            : rec.meal_types || null;
          const dietType = Array.isArray(rec.diet_types)
            ? rec.diet_types[0] || null
            : rec.diet_types || null;
          return {
            ...rec,
            meal_types: mealType,
            diet_types: dietType
          } as RecipeRecord;
        });
        setRecipes(mapped as RecipeRecord[]);
      }
      setLoading(false);
    };
    load();
  }, [supabase, user]);

  // Toggle favourite status for a recipe
  async function toggleFavorite(rec: RecipeRecord) {
    if (!user) return;
    const newFav = !rec.favorite;
    setRecipes((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, favorite: newFav } : r))
    );
    const { error } = await supabase
      .from('recipes')
      .update({ favorite: newFav })
      .eq('id', rec.id);
    if (error) {
      console.error('Error updating favorite:', error.message);
    }
  }

  // Apply search and filters to recipes
  const filtered = recipes.filter((r) => {
    // Search by title
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Filter by rating
    if (filterRating !== 'any') {
      if (filterRating === 0) {
        // 0 means has no rating
        if (r.rating !== null) return false;
      } else {
        if (r.rating !== filterRating) return false;
      }
    }
    // Filter by meal type
    if (filterMeal !== 'any' && r.meal_type_id !== filterMeal) {
      return false;
    }
    // Filter by diet type
    if (filterDiet !== 'any' && r.diet_type_id !== filterDiet) {
      return false;
    }
    // Filter by favorites
    if (showFavoritesOnly && !r.favorite) {
      return false;
    }
    return true;
  });

  // Sort recipes by key and order
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortKey === 'rating') {
      // null ratings are treated as 0
      const ra = a.rating ?? 0;
      const rb = b.rating ?? 0;
      cmp = ra - rb;
    } else if (sortKey === 'created_at') {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      cmp = da - db;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Handle clicking on column headers to sort
  function handleSort(key: 'title' | 'rating' | 'created_at') {
    if (sortKey === key) {
      // Toggle order
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Default order: asc for title, desc for dates and rating
      setSortOrder(key === 'title' ? 'asc' : 'desc');
    }
  }

  if (!user) {
    return (
      <div className="mt-8">
        <p>
          Please <a href="/login">log in</a> to view your recipe history.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-8" style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        Recipe History
      </h1>
      {message && (
        <p style={{ color: 'var(--success-color)', marginBottom: '1rem' }}>{message}</p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* Search and filter controls */}
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}
          >
            <div>
              <label style={{ display: 'block' }}>Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title"
                style={{ width: '160px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block' }}>Filter by Rating</label>
              <select
                value={filterRating}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterRating(val === 'any' ? 'any' : parseInt(val));
                }}
              >
                <option value="any">Any</option>
                <option value="0">No rating</option>
                <option value="1">1⭐</option>
                <option value="2">2⭐</option>
                <option value="3">3⭐</option>
                <option value="4">4⭐</option>
                <option value="5">5⭐</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block' }}>Filter by Meal</label>
              <select
                value={filterMeal}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterMeal(val === 'any' ? 'any' : parseInt(val));
                }}
              >
                <option value="any">Any</option>
                {mealTypes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block' }}>Filter by Diet</label>
              <select
                value={filterDiet}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterDiet(val === 'any' ? 'any' : parseInt(val));
                }}
              >
                <option value="any">Any</option>
                {dietTypes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="favouritesOnly"
                checked={showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              />
              <label htmlFor="favouritesOnly" style={{ marginLeft: '0.5rem' }}>
                Favourites only
              </label>
            </div>
          </div>
          {/* Recipes table */}
          {sorted.length === 0 ? (
            <p>No recipes match your filters.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}
              >
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-color)' }}>
                    <th
                      style={{ cursor: 'pointer', padding: '0.5rem', textAlign: 'left' }}
                      onClick={() => handleSort('title')}
                    >
                      Name {sortKey === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      style={{ cursor: 'pointer', padding: '0.5rem', textAlign: 'left' }}
                      onClick={() => handleSort('rating')}
                    >
                      Rating {sortKey === 'rating' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      style={{ cursor: 'pointer', padding: '0.5rem', textAlign: 'left' }}
                      onClick={() => handleSort('created_at')}
                    >
                      Generated {sortKey === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Meal Type</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Diet</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Favourite</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((rec) => (
                    <tr
                      key={rec.id}
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                      onClick={() => setSelectedRecipe(rec)}
                    >
                      <td style={{ padding: '0.5rem' }}>{rec.title}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {rec.rating ? `${rec.rating}⭐` : '-'}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {new Date(rec.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {rec.meal_types?.name ?? '-'}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {rec.diet_types?.name ?? '-'}
                      </td>
                      <td style={{ padding: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn"
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: rec.favorite ? 'var(--accent-color)' : 'var(--surface-color)',
                            color: rec.favorite ? 'var(--background-color)' : 'var(--text-color)'
                          }}
                          onClick={() => toggleFavorite(rec)}
                        >
                          {rec.favorite ? '★' : '☆'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Modal for recipe details */}
          <Modal
            open={!!selectedRecipe}
            onClose={() => setSelectedRecipe(null)}
            title={selectedRecipe?.title || ''}
          >
            {selectedRecipe ? (
              <div>
                <p style={{ marginBottom: '0.5rem' }}>
                  Generated on {new Date(selectedRecipe.created_at).toLocaleDateString()}
                </p>
                {selectedRecipe.rating && (
                  <p style={{ marginBottom: '0.5rem' }}>Rating: {selectedRecipe.rating}⭐</p>
                )}
                {selectedRecipe.feedback && (
                  <p style={{ marginBottom: '0.5rem' }}>Your comment: {selectedRecipe.feedback}</p>
                )}
                <h3 style={{ marginTop: '0.5rem' }}>Ingredients</h3>
                <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
                  {selectedRecipe.ingredients?.map((ing, idx) => (
                    <li key={idx}>
                      {ing.quantity} {ing.name}
                    </li>
                  ))}
                </ul>
                <h3 style={{ marginTop: '0.5rem' }}>Steps</h3>
                <ol style={{ paddingLeft: '1.25rem' }}>
                  {selectedRecipe.steps?.map((step, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem' }}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </Modal>
        </>
      )}
    </div>
  );
}