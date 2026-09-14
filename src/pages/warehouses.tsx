'use client';

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
}

interface WarehouseFormData {
  code: string;
  name: string;
  location: string;
}

const EMPTY_FORM: WarehouseFormData = { code: '', name: '', location: '' };

export default function Warehouses() {
  const router = useRouter();
  const { user, tenantId, logout } = useAuthStore();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WarehouseFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchWarehouses = async () => {
    if (!tenantId) return;

    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('warehouses')
      .select('id, code, name, location')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setWarehouses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (warehouse: Warehouse) => {
    setEditingId(warehouse.id);
    setFormData({
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Code and Name are required');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      location: formData.location.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('warehouses').update(payload).eq('id', editingId)
      : await supabase.from('warehouses').insert({ ...payload, tenant_id: tenantId });

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    closeForm();
    fetchWarehouses();
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!window.confirm(`Delete warehouse "${warehouse.name}" (${warehouse.code})?`)) {
      return;
    }

    const { error } = await supabase.from('warehouses').delete().eq('id', warehouse.id);

    if (error) {
      setListError(
        error.message.includes('foreign key')
          ? `Can't delete "${warehouse.name}" — it still has inventory located there.`
          : error.message
      );
      return;
    }

    fetchWarehouses();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Warehouses - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Warehouses</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/products" className="text-blue-600 hover:underline font-medium">
                Products
              </Link>
              <span className="text-slate-600">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-4">
            <p className="text-slate-600 text-sm">
              {warehouses.length} warehouse{warehouses.length === 1 ? '' : 's'}
            </p>
            <button
              onClick={openAddForm}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Warehouse
            </button>
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {listError}
            </div>
          )}

          {showForm && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                {editingId ? 'Edit Warehouse' : 'Add Warehouse'}
              </h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    disabled={saving}
                    placeholder="e.g. Newark, NJ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div className="md:col-span-3 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Warehouse'}
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-slate-600">Loading warehouses...</p>
              </div>
            ) : warehouses.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No warehouses yet. Add your first one above.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Code</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Location</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {warehouses.map((warehouse) => (
                    <tr key={warehouse.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{warehouse.code}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{warehouse.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{warehouse.location || '—'}</td>
                      <td className="px-6 py-4 text-sm text-right space-x-3">
                        <button
                          onClick={() => openEditForm(warehouse)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(warehouse)}
                          className="text-red-600 hover:underline font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
