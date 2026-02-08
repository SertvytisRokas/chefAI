"use client";

import { useState } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import Modal from '../../components/Modal';

interface FridgeItem {
  id: number;
  name: string;
  quantity: number;
  measurement_type_id: number;
  /**
   * Supabase returns measurement_types as either a single object or an array
   * when selecting a foreign table. We accept either form.
   */
  measurement_types?: { name: string } | { name: string }[];
  expiration_date: string | null;
}

interface MeasurementType {
  id: number;
  name: string;
}

interface Props {
  initialItems: FridgeItem[];
  measurementTypes: MeasurementType[];
}

/**
 * Client component for displaying and editing the fridge contents. It
 * allows users to add new items and delete existing ones. All
 * operations are performed via the Supabase browser client so that
 * changes are persisted immediately.
 */
export default function FridgeClient({
  initialItems,
  measurementTypes
}: Props) {
  const { supabase } = useSupabase();
  const user = useUser();
  const [items, setItems] = useState<FridgeItem[]>(initialItems);
  // State for adding a new item. These fields are used within the
  // "Add Item" modal. They are separate from editing fields so
  // they do not interfere with the main list.
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [measurementTypeId, setMeasurementTypeId] = useState<number>(
    measurementTypes[0]?.id || 1
  );
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  // Whether the "Add Item" modal is open. When true, a modal
  // containing the add item form is rendered.
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Search and sorting state for the table
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'quantity' | 'expiration_date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Editing state. When editingItemId is set, inputs for that row are
  // shown and can be saved or cancelled.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editMeasurementTypeId, setEditMeasurementTypeId] = useState<number>(measurementTypes[0]?.id || 1);
  const [editExpiration, setEditExpiration] = useState<string | null>(null);

  async function handleAdd() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fridge_items')
        .insert({
          user_id: user.id,
          name,
          quantity,
          measurement_type_id: measurementTypeId,
          expiration_date: expirationDate ? expirationDate : null
        })
        .select('id,name,quantity,measurement_type_id,measurement_types(name),expiration_date');
      if (error) throw error;
      if (data && data.length > 0) {
        setItems([...items, data[0] as any]);
        // Reset form fields after adding and close modal
        setName('');
        setQuantity(1);
        setMeasurementTypeId(measurementTypes[0]?.id || 1);
        setExpirationDate(null);
        setShowAddModal(false);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add item');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    setLoading(true);
    try {
      const { error } = await supabase.from('fridge_items').delete().eq('id', id);
      if (error) throw error;
      setItems(items.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete item');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('fridge_items')
        .update({
          name: editName,
          quantity: editQuantity,
          measurement_type_id: editMeasurementTypeId,
          expiration_date: editExpiration ? editExpiration : null
        })
        .eq('id', id);
      if (error) throw error;
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                name: editName,
                quantity: editQuantity,
                measurement_type_id: editMeasurementTypeId,
                expiration_date: editExpiration
              }
            : item
        )
      );
      setEditingItemId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  // Compute filtered and sorted items for display
  const displayedItems = [...items]
    .filter((item) => {
      if (!search) return true;
      return item.name.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'quantity') {
        cmp = a.quantity - b.quantity;
      } else if (sortKey === 'expiration_date') {
        const da = a.expiration_date ? new Date(a.expiration_date).getTime() : 0;
        const db = b.expiration_date ? new Date(b.expiration_date).getTime() : 0;
        cmp = da - db;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  // Handle sorting when clicking table headers
  function handleSort(key: 'name' | 'quantity' | 'expiration_date') {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="mt-8">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Fridge</h1>
      <div className="space-y-4">
        {/* Search box */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            style={{ width: '250px' }}
          />
        </div>
        {/* Add item button opens the add item modal */}
        <button
          onClick={() => setShowAddModal(true)}
          className="btn"
          style={{ alignSelf: 'flex-start' }}
        >
          Add Item
        </button>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                Name {sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('quantity')}>
                Quantity {sortKey === 'quantity' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Unit</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('expiration_date')}>
                Expiration {sortKey === 'expiration_date' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((item) => (
              <tr key={item.id}>
                {editingItemId === item.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(parseFloat(e.target.value))}
                      />
                    </td>
                    <td>
                      <select
                        value={editMeasurementTypeId}
                        onChange={(e) => setEditMeasurementTypeId(parseInt(e.target.value))}
                      >
                        {measurementTypes.map((mt) => (
                          <option key={mt.id} value={mt.id}>
                            {mt.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={editExpiration || ''}
                        onChange={(e) =>
                          setEditExpiration(e.target.value === '' ? null : e.target.value)
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn"
                        onClick={() => handleSaveEdit(item.id)}
                        disabled={loading}
                      >
                        Save
                      </button>
                      <button
                        className="btn"
                        style={{ marginLeft: '0.5rem' }}
                        onClick={() => setEditingItemId(null)}
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>
                      {(() => {
                        const mt = item.measurement_types;
                        if (mt) {
                          // If array, take the first element; if object, use directly
                          if (Array.isArray(mt)) {
                            return mt[0]?.name ?? '';
                          } else {
                            return mt.name;
                          }
                        }
                        const fallback = measurementTypes.find((mtOpt) => mtOpt.id === item.measurement_type_id);
                        return fallback?.name ?? '';
                      })()}
                    </td>
                    <td>{item.expiration_date || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditName(item.name);
                          setEditQuantity(item.quantity);
                          setEditMeasurementTypeId(item.measurement_type_id);
                          setEditExpiration(item.expiration_date);
                        }}
                        disabled={loading}
                        className="btn"
                        style={{ marginRight: '0.5rem' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={loading}
                        style={{ color: 'var(--error-color)', background: 'none', border: 'none' }}
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--muted-text-color)' }}>
                  Your fridge is empty. Add some items above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {/* Add Item Modal */}
        <Modal
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            // Reset fields when closing without adding
            setName('');
            setQuantity(1);
            setMeasurementTypeId(measurementTypes[0]?.id || 1);
            setExpirationDate(null);
          }}
          title="Add Item"
        >
          <div className="flex flex-col gap-4" style={{ minWidth: '280px', maxWidth: '320px' }}>
            <div className="flex flex-col">
              <label htmlFor="addName" className="mb-1">Item name</label>
              <input
                id="addName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="addQuantity" className="mb-1">Quantity</label>
              <input
                id="addQuantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value))}
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="addUnit" className="mb-1">Unit</label>
              <select
                id="addUnit"
                value={measurementTypeId}
                onChange={(e) => setMeasurementTypeId(parseInt(e.target.value))}
              >
                {measurementTypes.map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label htmlFor="addExpiration" className="mb-1">Expiration</label>
              <input
                id="addExpiration"
                type="date"
                value={expirationDate || ''}
                onChange={(e) =>
                  setExpirationDate(e.target.value === '' ? null : e.target.value)
                }
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                className="btn-cancel"
                onClick={() => {
                  // Close modal and reset fields
                  setShowAddModal(false);
                  setName('');
                  setQuantity(1);
                  setMeasurementTypeId(measurementTypes[0]?.id || 1);
                  setExpirationDate(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn"
                disabled={loading || !name.trim()}
                onClick={handleAdd}
              >
                Add
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}