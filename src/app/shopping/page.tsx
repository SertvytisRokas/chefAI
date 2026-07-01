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
      <div className="app-page">
        <p className="page-lead">
          Please <a href="/login">log in</a> to view your shopping list.
        </p>
      </div>
    );
  }
  return (
    <div className="app-page">
      <h1 className="page-title">Shopping list</h1>
      <p className="page-lead">Items to buy — mark purchased to move them into your fridge.</p>
      {message && <p className="app-message app-message--success">{message}</p>}
      {loading ? (
        <p className="app-list-empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="app-empty">Your shopping list is empty.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="app-card">
              <div className="app-card-row">
                <div>
                  <strong>{item.name}</strong>
                  <span className="text-muted">
                    {' '}
                    · {item.quantity} {getMeasurementName(item.measurement_type_id)}
                  </span>
                </div>
                <div className="app-card-actions">
                  <button type="button" className="btn btn-sm" onClick={() => openPurchaseModal(item)}>
                    Purchased
                  </button>
                  <button type="button" className="btn-text-danger" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          <Modal
            open={purchaseItem !== null}
            onClose={cancelPurchase}
            title={purchaseItem ? `Add ${purchaseItem.name} to fridge` : ''}
          >
            {purchaseItem && (
              <div className="app-modal-fields">
                <div className="app-field">
                  <label className="app-label">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(parseFloat(e.target.value))}
                  />
                </div>
                <div className="app-field">
                  <label className="app-label">Measurement unit</label>
                  <select value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)}>
                    {measurementTypes.map((mt) => (
                      <option key={mt.id} value={mt.name}>
                        {mt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="app-field">
                  <label className="app-label">Expiration date (optional)</label>
                  <input
                    type="date"
                    value={purchaseExp}
                    onChange={(e) => setPurchaseExp(e.target.value)}
                  />
                </div>
                <div className="app-actions-row">
                  <button type="button" className="btn-ghost" onClick={cancelPurchase}>
                    Cancel
                  </button>
                  <button type="button" className="btn" onClick={confirmPurchase}>
                    Add to fridge
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