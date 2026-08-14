"use client";

import { useEffect, useState } from 'react';
import { useSupabase, useUser } from '../../components/SupabaseProvider';
import Modal from '../../components/Modal';
import { purgeExpiredDepletedItems, removalNotice } from '../../lib/fridgeMaintenance';

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
  favorite?: boolean | null;
  /** Set by a database trigger when quantity hits zero; cleared on restock. */
  depleted_at?: string | null;
}

interface MeasurementType {
  id: number;
  name: string;
  abbreviation?: string | null;
  dimension?: string | null;
}

interface Props {
  initialItems: FridgeItem[];
  measurementTypes: MeasurementType[];
}

type SortKey = 'name' | 'quantity' | 'expiration_date';

/**
 * The fridge, in three groups.
 *
 *   ⭐ Favourites  — pinned staples, never auto-removed when they run out
 *      Everything else
 *   ○  Empty       — hit zero, counting down to removal after 7 days
 *
 * Each group sorts independently by whichever column is active, so pinning
 * something never costs you the ordering you chose.
 */
export default function FridgeClient({ initialItems, measurementTypes }: Props) {
  const { supabase } = useSupabase();
  const user = useUser();
  const [items, setItems] = useState<FridgeItem[]>(initialItems);

  // State for adding a new item, used only inside the "Add Item" modal.
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [measurementTypeId, setMeasurementTypeId] = useState<number>(
    measurementTypes[0]?.id || 1
  );
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Search and sorting state for the table
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Editing state. When editingItemId is set, inputs for that row are shown.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editMeasurementTypeId, setEditMeasurementTypeId] = useState<number>(
    measurementTypes[0]?.id || 1
  );
  const [editExpiration, setEditExpiration] = useState<string | null>(null);

  // Housekeeping on open: remove emptied items whose week has elapsed, and let
  // the server standardise any ingredient names it has not seen before. Both
  // are best-effort and must never block the page.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const removedIds = await purgeExpiredDepletedItems(supabase, user.id);
      if (!cancelled && removedIds.length > 0) {
        setItems((prev) => prev.filter((item) => !removedIds.includes(String(item.id))));
      }
      // Fire-and-forget: fills ingredient_standards so future cooks need the
      // model less. Nothing here depends on the result.
      fetch('/api/fridge/normalize', { method: 'POST' }).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally runs once per mount for this user.
  }, [supabase, user]);

  function unitNameFor(item: FridgeItem): string {
    const mt = item.measurement_types;
    if (mt) {
      if (Array.isArray(mt)) return mt[0]?.name ?? '';
      return mt.name;
    }
    const fallback = measurementTypes.find((option) => option.id === item.measurement_type_id);
    return fallback?.name ?? '';
  }

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
        .select(
          'id,name,quantity,measurement_type_id,measurement_types(name),expiration_date,favorite,depleted_at'
        );
      if (error) throw error;
      if (data && data.length > 0) {
        setItems([...items, data[0] as any]);
        setName('');
        setQuantity(1);
        setMeasurementTypeId(measurementTypes[0]?.id || 1);
        setExpirationDate(null);
        setShowAddModal(false);
        // A new name may be one the standards table has never seen.
        fetch('/api/fridge/normalize', { method: 'POST' }).catch(() => {});
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

  /** Pin or unpin. Pinned items survive hitting zero. */
  async function handleToggleFavorite(item: FridgeItem) {
    const next = !item.favorite;
    // Optimistic: pinning should feel instant.
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, favorite: next } : row)));
    const { error } = await supabase
      .from('fridge_items')
      .update({ favorite: next })
      .eq('id', item.id);
    if (error) {
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, favorite: !next } : row))
      );
      alert(error.message || 'Failed to update favourite');
    }
  }

  async function handleSaveEdit(id: number) {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fridge_items')
        .update({
          name: editName,
          quantity: editQuantity,
          measurement_type_id: editMeasurementTypeId,
          expiration_date: editExpiration ? editExpiration : null
        })
        .eq('id', id)
        .select('id,quantity,depleted_at');
      if (error) throw error;

      // depleted_at is maintained by a trigger, so read it back rather than
      // guessing whether this edit emptied or restocked the item.
      const updated = data && data.length > 0 ? (data[0] as any) : null;
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                name: editName,
                quantity: editQuantity,
                measurement_type_id: editMeasurementTypeId,
                measurement_types: undefined,
                expiration_date: editExpiration,
                depleted_at: updated ? updated.depleted_at : item.depleted_at
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

  function compareItems(a: FridgeItem, b: FridgeItem): number {
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
  }

  const visibleItems = items.filter((item) =>
    search ? item.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  // Three groups, each sorted independently by the active column.
  const favorites = visibleItems.filter((item) => item.favorite).sort(compareItems);
  const stocked = visibleItems
    .filter((item) => !item.favorite && item.quantity > 0)
    .sort(compareItems);
  const empty = visibleItems
    .filter((item) => !item.favorite && item.quantity <= 0)
    .sort(compareItems);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' ? 'asc' : 'desc');
    }
  }

  function sortArrow(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortOrder === 'asc' ? '▲' : '▼';
  }

  function renderRow(item: FridgeItem, variant: 'favorite' | 'stocked' | 'empty') {
    const isEditing = editingItemId === item.id;
    const notice = variant === 'empty' ? removalNotice(item.depleted_at) : null;

    if (isEditing) {
      return (
        <tr key={item.id}>
          <td>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
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
              onChange={(e) => setEditExpiration(e.target.value === '' ? null : e.target.value)}
            />
          </td>
          <td className="app-actions-row app-actions-row--table">
            <button
              className="btn btn-sm"
              onClick={() => handleSaveEdit(item.id)}
              disabled={loading}
            >
              Save
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setEditingItemId(null)}>
              Cancel
            </button>
          </td>
        </tr>
      );
    }

    return (
      <tr key={item.id} className={variant === 'empty' ? 'fridge-row--empty' : undefined}>
        <td>
          <button
            type="button"
            className={`fridge-star${item.favorite ? ' is-active' : ''}`}
            onClick={() => handleToggleFavorite(item)}
            aria-pressed={Boolean(item.favorite)}
            aria-label={
              item.favorite ? `Unpin ${item.name}` : `Pin ${item.name} as a favourite`
            }
            title={
              item.favorite
                ? 'Pinned. Kept even when it runs out.'
                : 'Pin this staple so it is kept when it runs out.'
            }
          >
            {item.favorite ? '★' : '☆'}
          </button>
          <span>{item.name}</span>
          {notice && <div className="fridge-removal-notice">{notice}</div>}
        </td>
        <td>{item.quantity}</td>
        <td>{unitNameFor(item)}</td>
        <td>{item.expiration_date || '—'}</td>
        <td>
          <div className="app-card-actions">
            <button
              onClick={() => {
                setEditingItemId(item.id);
                setEditName(item.name);
                setEditQuantity(item.quantity);
                setEditMeasurementTypeId(item.measurement_type_id);
                setEditExpiration(item.expiration_date);
              }}
              disabled={loading}
              className="btn btn-sm"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              disabled={loading}
              className="btn-text-danger"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderGroupHeader(label: string, hint?: string) {
    return (
      <tr className="fridge-group-header">
        <td colSpan={5}>
          <span className="fridge-group-label">{label}</span>
          {hint && <span className="fridge-group-hint"> {hint}</span>}
        </td>
      </tr>
    );
  }

  return (
    <div className="app-page">
      <h1 className="page-title">Fridge</h1>
      <p className="page-lead">Track what you have on hand and when it expires.</p>
      <div className="app-toolbar">
        <div className="app-field app-field--inline">
          <label className="app-label" htmlFor="fridge-search">
            Search
          </label>
          <input
            id="fridge-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
          />
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn">
          Add item
        </button>
      </div>
      <div className="app-table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>
                Name {sortArrow('name')}
              </th>
              <th className="sortable" onClick={() => handleSort('quantity')}>
                Quantity {sortArrow('quantity')}
              </th>
              <th>Unit</th>
              <th className="sortable" onClick={() => handleSort('expiration_date')}>
                Expiration {sortArrow('expiration_date')}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {favorites.length > 0 && renderGroupHeader('★ Favourites', '— kept even when they run out')}
            {favorites.map((item) => renderRow(item, 'favorite'))}

            {favorites.length > 0 && stocked.length > 0 && renderGroupHeader('In your fridge')}
            {stocked.map((item) => renderRow(item, 'stocked'))}

            {empty.length > 0 &&
              renderGroupHeader('Empty', '— removed after 7 days unless you pin them')}
            {empty.map((item) => renderRow(item, 'empty'))}

            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="app-empty">
                  Your fridge is empty. Add some items to get started.
                </td>
              </tr>
            )}
            {items.length > 0 && visibleItems.length === 0 && (
              <tr>
                <td colSpan={5} className="app-empty">
                  Nothing matches “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setName('');
          setQuantity(1);
          setMeasurementTypeId(measurementTypes[0]?.id || 1);
          setExpirationDate(null);
        }}
        title="Add Item"
      >
        <div className="app-modal-fields">
          <div className="app-field">
            <label htmlFor="addName" className="app-label">
              Item name
            </label>
            <input
              id="addName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="app-field">
            <label htmlFor="addQuantity" className="app-label">
              Quantity
            </label>
            <input
              id="addQuantity"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value))}
            />
          </div>
          <div className="app-field">
            <label htmlFor="addUnit" className="app-label">
              Unit
            </label>
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
          <div className="app-field">
            <label htmlFor="addExpiration" className="app-label">
              Expiration
            </label>
            <input
              id="addExpiration"
              type="date"
              value={expirationDate || ''}
              onChange={(e) => setExpirationDate(e.target.value === '' ? null : e.target.value)}
            />
          </div>
          <div className="app-actions-row">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
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
              type="button"
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
  );
}
