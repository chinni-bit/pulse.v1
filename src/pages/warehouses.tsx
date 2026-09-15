'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { DetailModal, DetailField } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  wayfair_supplier_id: number | null;
  is_active: boolean;
}

interface WarehouseFormData {
  code: string;
  name: string;
  location: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  wayfair_supplier_id: string;
}

const EMPTY_FORM: WarehouseFormData = {
  code: '',
  name: '',
  location: '',
  address: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  wayfair_supplier_id: '',
};

export default function Warehouses() {
  const { tenantId } = useAuthStore();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WarehouseFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Warehouse | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const fetchWarehouses = async () => {
    if (!tenantId) return;

    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('warehouses')
      .select(
        'id, code, name, location, address, contact_name, contact_phone, contact_email, wayfair_supplier_id, is_active'
      )
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
      address: warehouse.address || '',
      contact_name: warehouse.contact_name || '',
      contact_phone: warehouse.contact_phone || '',
      contact_email: warehouse.contact_email || '',
      wayfair_supplier_id: warehouse.wayfair_supplier_id != null ? String(warehouse.wayfair_supplier_id) : '',
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
      address: formData.address.trim() || null,
      contact_name: formData.contact_name.trim() || null,
      contact_phone: formData.contact_phone.trim() || null,
      contact_email: formData.contact_email.trim() || null,
      wayfair_supplier_id: formData.wayfair_supplier_id.trim() ? Number(formData.wayfair_supplier_id) : null,
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

  const toggleActive = async (warehouse: Warehouse) => {
    const nextActive = !warehouse.is_active;
    if (
      !window.confirm(
        nextActive
          ? `Reactivate warehouse "${warehouse.name}" (${warehouse.code})?`
          : `Deactivate warehouse "${warehouse.name}" (${warehouse.code})? It'll be excluded from inventory totals and channel pushes, but nothing is deleted.`
      )
    ) {
      return;
    }

    const { error } = await supabase.from('warehouses').update({ is_active: nextActive }).eq('id', warehouse.id);

    if (error) {
      setListError(error.message);
      return;
    }

    setViewing(null);
    fetchWarehouses();
  };

  const visibleWarehouses = showInactive ? warehouses : warehouses.filter((w) => w.is_active);

  return (
    <ProtectedRoute>
      <Head>
        <title>Warehouses - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Warehouses" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-4">
              <p className="text-slate-600 text-sm">
                {visibleWarehouses.length} warehouse{visibleWarehouses.length === 1 ? '' : 's'}
              </p>
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Show deactivated
              </label>
            </div>
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Wayfair Supplier ID</label>
                  <input
                    type="number"
                    value={formData.wayfair_supplier_id}
                    onChange={(e) => setFormData({ ...formData, wayfair_supplier_id: e.target.value })}
                    disabled={saving}
                    placeholder="leave blank if this warehouse doesn't ship Wayfair orders"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    From Wayfair&apos;s Partner Home. Required for this warehouse&apos;s inventory to be
                    included in Wayfair pushes.
                  </p>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={saving}
                    placeholder="Street, city, state, ZIP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    disabled={saving}
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
            ) : visibleWarehouses.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No warehouses yet. Add your first one above.</div>
            ) : (
              <table className="min-w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-24">Code</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-36">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-36">Location</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-36">Contact</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-28">Wayfair ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-24">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleWarehouses.map((warehouse) => (
                    <tr key={warehouse.id} className="hover:bg-slate-50">
                      <td
                        className="px-6 py-4 text-sm font-medium text-blue-700 hover:underline truncate cursor-pointer"
                        onClick={() => setViewing(warehouse)}
                      >
                        {warehouse.code}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">{warehouse.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate" title={warehouse.address || ''}>
                        {warehouse.location || '—'}
                      </td>
                      <td
                        className="px-6 py-4 text-sm text-slate-600 truncate"
                        title={[warehouse.contact_phone, warehouse.contact_email].filter(Boolean).join(' / ')}
                      >
                        {warehouse.contact_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{warehouse.wayfair_supplier_id ?? '—'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            warehouse.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {warehouse.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right space-x-3">
                        <button
                          onClick={() => openEditForm(warehouse)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(warehouse)}
                          className={`hover:underline font-medium ${
                            warehouse.is_active ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {warehouse.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {viewing && (
          <DetailModal
            title={`${viewing.name} (${viewing.code})`}
            onClose={() => setViewing(null)}
            onEdit={() => {
              setViewing(null);
              openEditForm(viewing);
            }}
          >
            <DetailField
              label="Status"
              value={viewing.is_active ? 'Active' : 'Inactive'}
            />
            <DetailField label="Location" value={viewing.location} />
            <DetailField label="Address" value={viewing.address} />
            <DetailField label="Contact Name" value={viewing.contact_name} />
            <DetailField label="Contact Phone" value={viewing.contact_phone} />
            <DetailField label="Contact Email" value={viewing.contact_email} />
            <DetailField label="Wayfair Supplier ID" value={viewing.wayfair_supplier_id} />
          </DetailModal>
        )}
      </main>
    </ProtectedRoute>
  );
}
