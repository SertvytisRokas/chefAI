"use client";

import { useEffect, useState } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import type { Database } from '../../lib/types';

type TabName = 'general' | 'allergens' | 'likes';

export default function ProfilePage() {
  const supabase = useSupabaseClient<Database>();
  const user = useUser();
  const [tab, setTab] = useState<TabName>('general');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [dietTypes, setDietTypes] = useState<Database['public']['Tables']['diet_types']['Row'][]>([]);
  const [selectedDiet, setSelectedDiet] = useState<number | null>(null);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergenInput, setAllergenInput] = useState('');
  const [likes, setLikes] = useState<{ name: string; type: 'like' | 'dislike' }[]>([]);
  const [likeInput, setLikeInput] = useState('');
  const [likeType, setLikeType] = useState<'like' | 'dislike'>('like');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Initialize email and fetch profile/diet
    setEmail(user.email || '');
    const load = async () => {
      // diet types
      const { data: dTypes } = await supabase.from('diet_types').select('*').order('id');
      if (dTypes) setDietTypes(dTypes);
      // profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('diet_type_id')
        .eq('user_id', user.id)
        .single();
      if (profile?.diet_type_id) setSelectedDiet(profile.diet_type_id);
      // allergens: fetch free-form names directly
      const { data: allergenRows } = await supabase
        .from('user_allergens')
        .select('name')
        .eq('user_id', user.id);
      if (allergenRows) {
        setAllergens(allergenRows.map((row) => row.name));
      }
      // likes/dislikes: fetch free-form names and types
      const { data: prefRows } = await supabase
        .from('user_preferences')
        .select('name, preference_type')
        .eq('user_id', user.id);
      if (prefRows) {
        const list: { name: string; type: 'like' | 'dislike' }[] = prefRows.map((p) => ({
          name: p.name,
          type: p.preference_type as 'like' | 'dislike'
        }));
        setLikes(list);
      }
    };
    load();
  }, [supabase, user]);

  const saveGeneral = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Update email/password via supabase auth
      if (isEditingEmail || isEditingPassword) {
        const updatePayload: { email?: string; password?: string } = {};
        if (isEditingEmail) updatePayload.email = email;
        if (isEditingPassword) updatePayload.password = password;
        const { error: authError } = await supabase.auth.updateUser(updatePayload);
        if (authError) throw authError;
      }
      // Update diet type
      await supabase
        .from('profiles')
        .upsert({ user_id: user.id, diet_type_id: selectedDiet }, { onConflict: 'user_id' });
      setIsEditingEmail(false);
      setIsEditingPassword(false);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    }
    setLoading(false);
  };

  const addAllergen = async () => {
    if (!user || !allergenInput.trim()) return;
    setLoading(true);
    setError(null);
    const name = allergenInput.trim();
    try {
      await supabase.from('user_allergens').insert({ user_id: user.id, name });
      setAllergens((prev) => [...prev, name]);
      setAllergenInput('');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAllergen = async (name: string) => {
    if (!user) return;
    await supabase
      .from('user_allergens')
      .delete()
      .eq('user_id', user.id)
      .eq('name', name);
    setAllergens((prev) => prev.filter((a) => a !== name));
  };

  const addPreference = async () => {
    if (!user || !likeInput.trim()) return;
    setLoading(true);
    setError(null);
    const name = likeInput.trim();
    try {
      // Upsert by (user_id, name) to either insert a new preference or update the type
      await supabase
        .from('user_preferences')
        .upsert(
          { user_id: user.id, name, preference_type: likeType },
          { onConflict: 'user_id,name' }
        );
      // Update local state: remove any existing entry for this name and add the new one
      setLikes((prev) => {
        const others = prev.filter((p) => p.name !== name);
        return [...others, { name, type: likeType }];
      });
      setLikeInput('');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deletePreference = async (name: string) => {
    if (!user) return;
    await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', user.id)
      .eq('name', name);
    setLikes((prev) => prev.filter((p) => p.name !== name));
  };

  return (
    <div>
      {!user ? (
        <p className="mt-4">
          Please{' '}
          <a href="/login" className="text-blue-600 underline">
            log in
          </a>{' '}
          to view and edit your profile.
        </p>
      ) : (
        <>
          <h1 className="text-xl font-semibold mb-4">Profile</h1>
          {error && <p className="text-red-600 mb-2">{error}</p>}
          <div className="flex space-x-4 border-b mb-4">
            <button
              className={`pb-2 ${tab === 'general' ? 'border-b-2 border-blue-600 font-medium' : ''}`}
              onClick={() => setTab('general')}
            >
              General
            </button>
            <button
              className={`pb-2 ${tab === 'allergens' ? 'border-b-2 border-blue-600 font-medium' : ''}`}
              onClick={() => setTab('allergens')}
            >
              Allergens
            </button>
            <button
              className={`pb-2 ${tab === 'likes' ? 'border-b-2 border-blue-600 font-medium' : ''}`}
              onClick={() => setTab('likes')}
            >
              Likes/Dislikes
            </button>
          </div>
          {tab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Email</label>
                <div className="flex space-x-2 items-center">
                  <input
                    className="border rounded px-2 py-1 flex-1"
                    type="email"
                    value={email}
                    readOnly={!isEditingEmail}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => setIsEditingEmail(!isEditingEmail)}
                  >
                    {isEditingEmail ? 'Cancel' : 'Change'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Password</label>
                <div className="flex space-x-2 items-center">
                  <input
                    className="border rounded px-2 py-1 flex-1"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    readOnly={!isEditingPassword}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => setIsEditingPassword(!isEditingPassword)}
                  >
                    {isEditingPassword ? 'Cancel' : 'Change'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Diet type</label>
                <select
                  className="border rounded px-2 py-1"
                  value={selectedDiet ?? ''}
                  onChange={(e) => setSelectedDiet(parseInt(e.target.value))}
                >
                  <option value="">None</option>
                  {dietTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={saveGeneral}
                className="bg-blue-600 text-white px-4 py-2 rounded mt-2"
                disabled={loading}
              >
                Save
              </button>
            </div>
          )}
          {tab === 'allergens' && (
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="Add new allergen"
                  value={allergenInput}
                  onChange={(e) => setAllergenInput(e.target.value)}
                />
                <button
                  onClick={addAllergen}
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                  disabled={loading}
                >
                  Add
                </button>
              </div>
              <ul className="space-y-1">
                {allergens.map((all) => (
                  <li key={all} className="flex justify-between items-center border px-2 py-1 rounded">
                    <span>{all}</span>
                    <button
                      onClick={() => deleteAllergen(all)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {allergens.length === 0 && <li className="text-gray-500">No allergens specified.</li>}
              </ul>
            </div>
          )}
          {tab === 'likes' && (
            <div className="space-y-4">
              <div className="flex space-x-2 items-center">
                <input
                  type="text"
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="Add new like/dislike"
                  value={likeInput}
                  onChange={(e) => setLikeInput(e.target.value)}
                />
                <select
                  value={likeType}
                  onChange={(e) => setLikeType(e.target.value as 'like' | 'dislike')}
                  className="border rounded px-2 py-1"
                >
                  <option value="like">Like</option>
                  <option value="dislike">Dislike</option>
                </select>
                <button
                  onClick={addPreference}
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                  disabled={loading}
                >
                  Add
                </button>
              </div>
              <ul className="space-y-1">
                {likes.map((p) => (
                  <li
                    key={p.name}
                    className="flex justify-between items-center border px-2 py-1 rounded"
                  >
                    <span>
                      {p.name} –{' '}
                      <span className={p.type === 'like' ? 'text-green-600' : 'text-red-600'}>
                        {p.type}
                      </span>
                    </span>
                    <button
                      onClick={() => deletePreference(p.name)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {likes.length === 0 && <li className="text-gray-500">No likes or dislikes.</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}