'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

const MAX_NAME_LENGTH = 60;

interface ProductType {
  id: string;
  name: string;
  product_count: number;
}

export default function ProductTypes() {
  const { tenantId } = useAuthStore();

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProductTypes = async () => {
    if (!tenantId) return;
    setLoading(true);
    setListError('');

    const [{ data: typesData, error }, { data: productsData }] = await Promise.all([
      supabase.from('product_types').select('id, name').eq('tenant_id', tenantId).order('name', { ascending: true }),
      supabase.from('products').select('product_type_id').eq('tenant_id', tenantId).not('product_type_id', 'is', null),
    ]);

    if (error) {
      setListError(error.message);
      setLoading(false);
      return;
    }

    const counts = new Map<string, number>();
    (productsData || []).forEach((p) => {
      if (p.product_type_id) counts.set(p.product_type_id, (counts.get(p.product_type_id) || 0) + 1);
    });

    setProductTypes((typesData || []).map((t) => ({ ...t, product_count: counts.get(t.id) || 0 })));
    setLoading(false);
  };

  useEffect(() => {
    fetchProductTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const name = newName.trim();
    if (!name) {
      setAddError('Name is required');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setAddError(`Name can't be longer than ${MAX_NAME_LENGTH} characters`);
      return;
    }

    setAdding(true);
    setAddError('');

    const { error } = await supabase.from('product_types').insert({ tenant_id: tenantId, name });

    setAdding(false);

    if (error) {
      setAddError(error.message);
      return;
    }

    setNewName('');
    fetchProductTypes();
  };

  const openEdit = (t: ProductType) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditError('');
  };

  const handleEditSave = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const name = editName.trim();
    if (!name) {
      setEditError('Name is required');
      return;
    }

    setSaving(true);
    setEditError('');

    const { error } = await supabase.from('product_types').update({ name }).eq('id', id);

    setSaving(false);

    if (error) {
      setEditError(error.message);
      return;
    }

    setEditingId(null);
    fetchProductTypes();
  };

  const handleDelete = async (t: ProductType) => {
    if (t.product_count > 0) {
      window.alert(
        `"${t.name}" is used by ${t.product_count} product${t.product_count === 1 ? '' : 's'} - reassign ${
          t.product_count === 1 ? 'it' : 'them'
        } to a different type before deleting this one.`
      );
      return;
    }

    if (!window.confirm(`Delete product type "${t.name}"? This can't be undone.`)) return;

    const { error } = await supabase.from('product_types').delete().eq('id', t.id);

    if (error) {
      setListError(error.message);
      return;
    }

    fetchProductTypes();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Product Types - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Product Types" />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-slate-600 text-sm mb-4">
            {productTypes.length} product type{productTypes.length === 1 ? '' : 's'} - used to categorize products
            (e.g. Crib, Dresser, Desk) on the Products page.
          </p>

          <div className="bg-white rounded-lg shadow p-4 mb-6">
            {addError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{addError}</div>
            )}
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={adding}
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Crib, Dresser, Desk"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
              />
              <button
                type="submit"
                disabled={adding || !newName.trim()}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
              >
                {adding ? 'Adding...' : '+ Add'}
              </button>
            </form>
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{listError}</div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-slate-600">Loading product types...</p>
              </div>
            ) : productTypes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No product types yet. Add your first one above.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-32">Products</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {productTypes.map((t) =>
                    editingId === t.id ? (
                      <tr key={t.id} className="bg-slate-50">
                        <td className="px-6 py-3" colSpan={3}>
                          {editError && <p className="text-red-700 text-sm mb-2">{editError}</p>}
                          <form onSubmit={(e) => handleEditSave(e, t.id)} className="flex gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              disabled={saving}
                              autoFocus
                              maxLength={MAX_NAME_LENGTH}
                              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                            />
                            <button
                              type="submit"
                              disabled={saving}
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={saving}
                              className="px-3 py-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm text-slate-900 font-medium">{t.name}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{t.product_count}</td>
                        <td className="px-6 py-3 text-sm text-right space-x-3">
                          <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline font-medium">
                            Rename
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="text-red-600 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
