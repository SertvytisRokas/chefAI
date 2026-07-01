"use client";

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';

interface DietType {
  id: number;
  name: string;
}
interface Allergen {
  id: number;
  name: string;
}
interface Preference {
  id: number;
  name: string;
  preference_type: 'like' | 'dislike';
}

/**
 * Profile page for managing account details, allergens and preferences.
 * It consists of three tabs: General, Allergens and Preferences. Users
 * can update their email and password, select a diet type, manage
 * allergens, and add or remove likes and dislikes. All updates are
 * persisted via the Supabase client.
 */
export default function ProfilePage() {
  const { supabase } = useSupabase();
  const user = useUser();
  const [activeTab, setActiveTab] = useState<'general' | 'allergens' | 'preferences'>(
    'general'
  );
  const [dietTypes, setDietTypes] = useState<DietType[]>([]);
  const [selectedDietId, setSelectedDietId] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [newAllergen, setNewAllergen] = useState('');
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [newPrefName, setNewPrefName] = useState('');
  const [newPrefType, setNewPrefType] = useState<'like' | 'dislike'>('like');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Load email from auth user
      setEmail(user.email ?? '');
      // Load diet types
      const { data: dtData, error: dtError } = await supabase
        .from('diet_types')
        .select('*')
        .order('id');
      if (dtError) {
        console.error(dtError);
      } else {
        setDietTypes(dtData || []);
      }
      // Load profile to get selected diet id.  Cast to avoid `never`.
      const { data: profileData } = await supabase
        .from('profiles')
        .select('diet_type_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const profile = profileData as { diet_type_id?: number } | null;
      if (profile?.diet_type_id) {
        setSelectedDietId(profile.diet_type_id);
      }
      // Load allergens
      const { data: allergenRows } = await supabase
        .from('user_allergens')
        .select('id,name')
        .eq('user_id', user.id);
      setAllergens((allergenRows as any[]) || []);
      // Load preferences
      const { data: prefRows } = await supabase
        .from('user_preferences')
        .select('id,name,preference_type')
        .eq('user_id', user.id);
      setPreferences((prefRows as any[]) || []);
    };
    load();
  }, [supabase, user]);

  // General update handler (email, password, diet)
  async function handleSaveGeneral() {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      // Update email/password via auth API
      const updates: { email?: string; password?: string } = {};
      if (email && email !== user.email) updates.email = email;
      if (password) updates.password = password;
      if (Object.keys(updates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(updates);
        if (authError) throw authError;
      }
      // Update diet
      if (selectedDietId) {
        await supabase
          .from('profiles')
          .upsert({ user_id: user.id, diet_type_id: selectedDietId });
      }
      setPassword('');
      setMessage('Profile updated');
    } catch (err: any) {
      setMessage(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }

  // Add allergen
  async function handleAddAllergen() {
    if (!user || !newAllergen.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_allergens')
        .insert({ user_id: user.id, name: newAllergen.trim() })
        .select('id,name');
      if (error) throw error;
      if (data) {
        setAllergens([...allergens, data[0] as Allergen]);
        setNewAllergen('');
      }
    } catch (err: any) {
      setMessage(err.message || 'Failed to add allergen');
    } finally {
      setLoading(false);
    }
  }

  // Delete allergen
  async function handleDeleteAllergen(id: number) {
    setLoading(true);
    try {
      const { error } = await supabase.from('user_allergens').delete().eq('id', id);
      if (error) throw error;
      setAllergens(allergens.filter((a) => a.id !== id));
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete allergen');
    } finally {
      setLoading(false);
    }
  }

  // Add preference
  async function handleAddPreference() {
    if (!user || !newPrefName.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .insert({
          user_id: user.id,
          name: newPrefName.trim(),
          preference_type: newPrefType
        })
        .select('id,name,preference_type');
      if (error) throw error;
      if (data) {
        setPreferences([...preferences, data[0] as Preference]);
        setNewPrefName('');
        setNewPrefType('like');
      }
    } catch (err: any) {
      setMessage(err.message || 'Failed to add preference');
    } finally {
      setLoading(false);
    }
  }

  // Delete preference
  async function handleDeletePreference(id: number) {
    setLoading(true);
    try {
      const { error } = await supabase.from('user_preferences').delete().eq('id', id);
      if (error) throw error;
      setPreferences(preferences.filter((p) => p.id !== id));
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete preference');
    } finally {
      setLoading(false);
    }
  }

  // Toggle preference type
  async function handleTogglePreference(pref: Preference) {
    setLoading(true);
    try {
      const newType: 'like' | 'dislike' = pref.preference_type === 'like' ? 'dislike' : 'like';
      // Cast the update payload to `any` to avoid TS inferring `never`.
      const { error } = await supabase
        .from('user_preferences')
        .update({ preference_type: newType } as any)
        .eq('id', pref.id);
      if (error) throw error;
      setPreferences(
        preferences.map((p) => (p.id === pref.id ? { ...p, preference_type: newType } : p))
      );
    } catch (err: any) {
      setMessage(err.message || 'Failed to update preference');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page">
      <h1 className="page-title">Profile</h1>
      <p className="page-lead">Account settings, allergens, and taste preferences.</p>
      <div className="tab-row">
        <button
          onClick={() => setActiveTab('general')}
          className={activeTab === 'general' ? 'active' : ''}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('allergens')}
          className={activeTab === 'allergens' ? 'active' : ''}
        >
          Allergens
        </button>
        <button
          onClick={() => setActiveTab('preferences')}
          className={activeTab === 'preferences' ? 'active' : ''}
        >
          Likes & Dislikes
        </button>
      </div>
      {message && <p className="app-message app-message--success">{message}</p>}
      {activeTab === 'general' && (
        <div className="app-section space-y-4">
          <div className="app-field">
            <label className="app-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="app-field">
            <label className="app-label">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="app-field">
            <label className="app-label">Diet</label>
            <select
              value={selectedDietId ?? ''}
              onChange={(e) => setSelectedDietId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">None</option>
              {dietTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleSaveGeneral} disabled={loading} className="btn">
            Save
          </button>
        </div>
      )}
      {activeTab === 'allergens' && (
        <div className="app-section space-y-4">
          <div className="app-toolbar">
            <div className="app-field app-field--grow">
              <label className="app-label">Add allergen</label>
              <input
                type="text"
                value={newAllergen}
                onChange={(e) => setNewAllergen(e.target.value)}
              />
            </div>
            <button
              onClick={handleAddAllergen}
              disabled={loading || !newAllergen.trim()}
              className="btn"
            >
              Add
            </button>
          </div>
          <ul className="app-list space-y-2">
            {allergens.map((a) => (
              <li key={a.id} className="app-list-row">
                <span>{a.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteAllergen(a.id)}
                  disabled={loading}
                  className="btn-text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
            {allergens.length === 0 && (
              <li className="app-list-empty">No allergens set.</li>
            )}
          </ul>
        </div>
      )}
      {activeTab === 'preferences' && (
        <div className="app-section space-y-4">
          <div className="app-toolbar">
            <div className="app-field app-field--grow">
              <label className="app-label">Add like/dislike</label>
              <input
                type="text"
                value={newPrefName}
                onChange={(e) => setNewPrefName(e.target.value)}
              />
            </div>
            <select
              value={newPrefType}
              onChange={(e) => setNewPrefType(e.target.value as 'like' | 'dislike')}
            >
              <option value="like">Like</option>
              <option value="dislike">Dislike</option>
            </select>
            <button
              onClick={handleAddPreference}
              disabled={loading || !newPrefName.trim()}
              className="btn"
            >
              Add
            </button>
          </div>
          <ul className="app-list space-y-2">
            {preferences.map((p) => (
              <li key={p.id} className="app-list-row">
                <span>
                  {p.name} ({p.preference_type})
                </span>
                <div className="app-card-actions">
                  <button
                    type="button"
                    onClick={() => handleTogglePreference(p)}
                    disabled={loading}
                    className="btn-ghost btn-sm"
                  >
                    Toggle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreference(p.id)}
                    disabled={loading}
                    className="btn-text-danger"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {preferences.length === 0 && (
              <li className="app-list-empty">No preferences set.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}