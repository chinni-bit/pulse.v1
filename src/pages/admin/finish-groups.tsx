'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

const MAX_NAME_LENGTH = 60;

interface FinishGroup {
  id: string;
  name: string;
  is_active: boolean;
  product_count: number;
}

export default function FinishGroups() {
  const { tenantId, user } = useAuthStore();

  const [groups, setGroups] = useState<FinishGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchGroups = async () => {
    if (!tenantId) return;
    setLoading(true);
    setListError('');

    const [{ data: groupsData, error }, { data: productsData }] = await Promise.all([
      supabase.from('finish_groups').select('id, name, is_active').eq('tenant_id', tenantId).order('name', { ascending: true }),
      supabase.from('products').select('finish_group_id').eq('tenant_id', tenantId).not('finish_group_id', 'is', null),
    ]);

    if (error) {
      setListError(error.message);
      setLoading(false);
      return;
    }

    const counts = new Map<string, number>();
    (productsData || []).forEach((p) => {
      if (p.finish_group_id) counts.set(p.finish_group_id, (counts.get(p.finish_group_id) || 0) + 1);
    });

    setGroups((groupsData || []).map((g) => ({ ...g, product_count: counts.get(g.id) || 0 })));
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
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

    const { error } = await supabase.from('finish_groups').insert({ tenant_id: tenantId, name, created_by: user?.id || null });

    setAdding(false);

    if (error) {
      setAddError(error.message);
      return;
    }

    setNewName('');
    fetchGroups();
  };

  const openEdit = (g: FinishGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
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

    const { error } = await supabase.from('finish_groups').update({ name }).eq('id', id);

    setSaving(false);

    if (error) {
      setEditError(error.message);
      return;
    }

    setEditingId(null);
    fetchGroups();
  };

  const toggleActive = async (g: FinishGroup) => {
    const nextActive = !g.is_active;
    if (
      !window.confirm(
        nextActive
          ? `Reactivate finish group "${g.name}"?`
          : `Deactivate finish group "${g.name}"? It'll no longer be selectable for new products, but the ${g.product_count} product(s) already using it stay linked to it.`
      )
    ) {
      return;
    }

    const { error } = await supabase.from('finish_groups').update({ is_active: nextActive }).eq('id', g.id);

    if (error) {
      setListError(error.message);
      return;
    }

    fetchGroups();
  };

  const visibleGroups = showInactive ? groups : groups.filter((g) => g.is_active);

  return (
    <ProtectedRoute>
      <Head>
        <title>Finish Groups - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Finish Groups" />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <p className="text-slate-600 text-sm">
              {visibleGroups.length} finish group{visibleGroups.length === 1 ? '' : 's'} - color/finish families
              (e.g. Brown, Red, Yellow) used on the Products page. Deactivating one removes it from new
              products' options without touching products already using it.
            </p>
            <label className="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300"
              />
              Show deactivated
            </label>
          </div>

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
                placeholder="e.g. Brown, Red, Yellow"
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
                <p className="mt-4 text-slate-600">Loading finish groups...</p>
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No finish groups yet. Add your first one above.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-28">Products</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-24">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleGroups.map((g) =>
                    editingId === g.id ? (
                      <tr key={g.id} className="bg-slate-50">
                        <td className="px-6 py-3" colSpan={4}>
                          {editError && <p className="text-red-700 text-sm mb-2">{editError}</p>}
                          <form onSubmit={(e) => handleEditSave(e, g.id)} className="flex gap-2">
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
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm text-slate-900 font-medium">{g.name}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{g.product_count}</td>
                        <td className="px-6 py-3 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              g.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {g.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-right space-x-3">
                          <button onClick={() => openEdit(g)} className="text-blue-600 hover:underline font-medium">
                            Rename
                          </button>
                          <button
                            onClick={() => toggleActive(g)}
                            className={`hover:underline font-medium ${
                              g.is_active ? 'text-red-600' : 'text-green-700'
                            }`}
                          >
                            {g.is_active ? 'Deactivate' : 'Activate'}
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
