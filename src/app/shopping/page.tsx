"use client";

import { useEffect, useState } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import Modal from '../../components/Modal';

interface ShoppingItem {
  id: number;
  name: string;
  quantity: number;
  measurement_type_id: number | null;
}

/**
 * Shopping List page. Displays all items in the user's shopping list.
 * Users can mark items as purchased (moving them into the fridge)
 * and remove items. Quantities are aggregated when adding from
 * recipes or weekly plans.
 */
export default function ShoppingPage() {
  const { supabase } = useSupabase();
  const user = useUser();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Modal state for purchasing an item
  const [purchaseItem, setPurchaseItem] = useState<ShoppingItem | null>(null);
  const [purchaseQty, setPurchaseQty] = useState<number>(0);
  const [purchaseUnit, setPurchaseUnit] = useState<string>('');
  const [purchaseExp, setPurchaseExp] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data: mTypes } = await supabase.from('measurement_types').select('*');
      setMeasurementTypes(mTypes || []);
      const { data: rows } = await supabase
        .from('shopping_list')
        .select('*')
        .eq('user_id', user.id);
      setItems((rows as ShoppingItem[]) || []);
      setLoading(false);
    };
    load();
  }, [supabase, user]);

  function getMeasurementName(id: number | null): string {
    if (id == null) return '';
    const mt = measurementTypes.find((m) => m.id === id);
    return mt ? mt.name : '';
  }

  async function handleDelete(itemId: number) {
    if (!user) return;
    await supabase.from('shopping_list').delete().eq('id', itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function openPurchaseModal(item: ShoppingItem) {
    setPurchaseItem(item);
    setPurchaseQty(item.quantity);
    const unitName = getMeasurementName(item.measurement_type_id);
    setPurchaseUnit(unitName || '');
    setPurchaseExp('');
  }

  async function confirmPurchase() {
    if (!user || !purchaseItem) return;
    // Validate quantity
    if (purchaseQty <= 0 || Number.isNaN(purchaseQty)) {
      setMessage('Invalid quantity');
      return;
    }
    // Find measurement type id
    const mtRecord = measurementTypes.find((m) => m.name.toLowerCase() === purchaseUnit.toLowerCase());
    if (!mtRecord) {
      setMessage('Unknown measurement unit');
      return;
    }
    // Insert into fridge_items
    await supabase.from('fridge_items').insert({
      user_id: user.id,
      name: purchaseItem.name,
      quantity: purchaseQty,
      measurement_type_id: mtRecord.id,
      expiration_date: purchaseExp && purchaseExp.trim() !== '' ? purchaseExp : null
    });
    // Remove from shopping list
    await supabase.from('shopping_list').delete().eq('id', purchaseItem.id);
    // Refresh list
    setItems((prev) => prev.filter((i) => i.id !== purchaseItem.id));
    setMessage(`${purchaseItem.name} added to fridge`);
    // Close modal
    setPurchaseItem(null);
  }

  function cancelPurchase() {
    setPurchaseItem(null);
  }

  if (!user) {
    return (
      <div className="mt-8">
        <p>
          Please <a href="/login">log in</a> to view your shopping list.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-8" style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        Shopping List
      </h1>
      {message && (
        <p style={{ color: 'var(--success-color)', marginBottom: '1rem' }}>{message}</p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>Your shopping list is empty.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '0.75rem',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px'
              }}
            >
              <strong>{item.name}</strong>: {item.quantity} {getMeasurementName(item.measurement_type_id)}
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  className="btn"
                  style={{ marginRight: '0.5rem' }}
                  onClick={() => openPurchaseModal(item)}
                >
                  Purchased
                </button>
                <button className="btn" onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {/* Purchase modal */}
          <Modal
            open={purchaseItem !== null}
            onClose={cancelPurchase}
            title={purchaseItem ? `Add ${purchaseItem.name} to fridge` : ''}
          >
            {purchaseItem && (
              <div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Measurement Unit
                  </label>
                  <select
                    value={purchaseUnit}
                    onChange={(e) => setPurchaseUnit(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {measurementTypes.map((mt) => (
                      <option key={mt.id} value={mt.name}>
                        {mt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Expiration Date (optional)
                  </label>
                  <input
                    type="date"
                    value={purchaseExp}
                    onChange={(e) => setPurchaseExp(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button className="btn" onClick={cancelPurchase}>
                    Cancel
                  </button>
                  <button className="btn" onClick={confirmPurchase}>
                    Add to Fridge
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}
    </div>
  );
}