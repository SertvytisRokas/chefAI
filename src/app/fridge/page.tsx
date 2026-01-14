"use client";

import { useEffect, useState } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import type { Database } from '../../lib/types';

interface FridgeItemInput {
  name: string;
  quantity: number;
  measurement_type_id: number;
  expiration_date: string | null;
}

export default function FridgePage() {
  const supabase = useSupabaseClient<Database>();
  const user = useUser();
  const [items, setItems] = useState<Database['public']['Tables']['fridge_items']['Row'][]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<
    Database['public']['Tables']['measurement_types']['Row'][]
  >([]);
  const [form, setForm] = useState<FridgeItemInput>({
    name: '',
    quantity: 1,
    measurement_type_id: 1,
    expiration_date: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch measurement types and fridge items on mount
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: mTypes, error: mError } = await supabase
        .from('measurement_types')
        .select('*')
        .order('id');
      if (mError) {
        setError(mError.message);
        return;
      }
      setMeasurementTypes(mTypes || []);
      if (mTypes && mTypes.length > 0) {
        setForm((prev) => ({ ...prev, measurement_type_id: mTypes[0].id }));
      }
      const { data: fridgeItems, error: iError } = await supabase
        .from('fridge_items')
        .select('*')
        .eq('user_id', user.id)
        .order('expiration_date', { ascending: true });
      if (iError) {
        setError(iError.message);
      } else {
        setItems(fridgeItems || []);
      }
    };
    load();
  }, [supabase, user]);

  const addItem = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { error: insertError } = await supabase.from('fridge_items').insert({
      user_id: user.id,
      name: form.name,
      quantity: form.quantity,
      measurement_type_id: form.measurement_type_id,
      expiration_date: form.expiration_date
    });
    if (insertError) {
      setError(insertError.message);
    } else {
      setForm({ name: '', quantity: 1, measurement_type_id: form.measurement_type_id, expiration_date: null });
      // Refresh list
      const { data: fridgeItems, error: iError } = await supabase
        .from('fridge_items')
        .select('*')
        .eq('user_id', user.id)
        .order('expiration_date', { ascending: true });
      if (!iError) {
        setItems(fridgeItems || []);
      }
    }
    setLoading(false);
  };

  const deleteItem = async (id: string) => {
    if (!user) return;
    await supabase.from('fridge_items').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div>
      {!user ? (
        <p className="mt-4">Please{' '}
          <a href="/login" className="text-blue-600 underline">
            log in
          </a>{' '}
          to manage your fridge.
        </p>
      ) : (
        <>
          <h1 className="text-xl font-semibold mb-4">Your Fridge</h1>
          {error && <p className="text-red-600 mb-2">{error}</p>}
          {/* Add new item form */}
          <div className="mb-6 p-4 border rounded-md bg-white shadow-sm">
            <h2 className="font-medium mb-2">Add Item</h2>
            <div className="grid grid-cols-4 gap-2">
              <input
                className="border rounded px-2 py-1 col-span-2"
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="border rounded px-2 py-1"
                type="number"
                min="0"
                step="0.01"
                placeholder="Quantity"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) })}
              />
              <select
                className="border rounded px-2 py-1"
                value={form.measurement_type_id}
                onChange={(e) => setForm({ ...form, measurement_type_id: parseInt(e.target.value) })}
              >
                {measurementTypes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                className="border rounded px-2 py-1 col-span-2"
                type="date"
                value={form.expiration_date || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, expiration_date: val ? val : null });
                }}
              />
              <button
                onClick={addItem}
                disabled={loading || !form.name}
                className="bg-blue-600 text-white px-3 py-1 rounded disabled:bg-gray-300 col-span-2"
              >
                {loading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
          {/* Items list */}
          <div className="bg-white shadow-sm border rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{item.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {item.quantity}{' '}
                      {measurementTypes.find((m) => m.id === item.measurement_type_id)?.name}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>
                      No items in your fridge yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}