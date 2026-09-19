'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

const MAX_NAME_LENGTH = 150;

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona, no DST (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'UTC', label: 'UTC' },
];

interface Tenant {
  id: string;
  name: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  timezone: string;
}

interface TenantFormData {
  name: string;
  status: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  timezone: string;
}

export default function TenantInfo() {
  const { tenantId, role } = useAuthStore();
  const isSuperAdmin = role === 'super_admin';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<TenantFormData | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTenant = async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError('');

    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, status, contact_name, contact_phone, contact_email, address, timezone')
      .eq('id', tenantId)
      .single();

    if (error) {
      setLoadError(error.message);
    } else {
      setTenant(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const openEdit = () => {
    if (!tenant) return;
    setFormData({
      name: tenant.name,
      status: tenant.status,
      contact_name: tenant.contact_name || '',
      contact_phone: tenant.contact_phone || '',
      contact_email: tenant.contact_email || '',
      address: tenant.address || '',
      timezone: tenant.timezone,
    });
    setFormError('');
    setEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !formData) return;

    const name = formData.name.trim();
    if (!name) {
      setFormError('Tenant Name is required');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setFormError(`Tenant Name can't be longer than ${MAX_NAME_LENGTH} characters`);
      return;
    }

    setSaving(true);
    setFormError('');

    const { error } = await supabase
      .from('tenants')
      .update({
        name,
        status: formData.status,
        contact_name: formData.contact_name.trim() || null,
        contact_phone: formData.contact_phone.trim() || null,
        contact_email: formData.contact_email.trim() || null,
        address: formData.address.trim() || null,
        timezone: formData.timezone,
      })
      .eq('id', tenant.id);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setEditing(false);
    fetchTenant();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Tenant Info - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Tenant Info" />

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!isSuperAdmin && (
            <p className="text-slate-500 text-sm mb-4">
              View only - editing tenant info requires a super_admin role.
            </p>
          )}

          {loadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{loadError}</div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-slate-600">Loading tenant info...</p>
            </div>
          ) : !tenant ? (
            <div className="text-center py-12 text-slate-500">Tenant not found.</div>
          ) : editing && formData ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Edit Tenant Info</h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tenant ID</label>
                  <input
                    type="text"
                    value={tenant.id}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tenant Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={saving}
                    maxLength={MAX_NAME_LENGTH}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Time Zone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
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

                <div className="sm:col-span-2">
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

                <div className="sm:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-slate-900">{tenant.name}</h2>
                {isSuperAdmin && (
                  <button
                    onClick={openEdit}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tenant ID</div>
                  <div className="text-sm text-slate-900 mt-0.5 font-mono">{tenant.id}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</div>
                  <div className="mt-0.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tenant.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Time Zone</div>
                  <div className="text-sm text-slate-900 mt-0.5">
                    {TIMEZONE_OPTIONS.find((tz) => tz.value === tenant.timezone)?.label || tenant.timezone}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Contact Name</div>
                  <div className="text-sm text-slate-900 mt-0.5">{tenant.contact_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Contact Phone</div>
                  <div className="text-sm text-slate-900 mt-0.5">{tenant.contact_phone || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Contact Email</div>
                  <div className="text-sm text-slate-900 mt-0.5">{tenant.contact_email || '—'}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Address</div>
                  <div className="text-sm text-slate-900 mt-0.5">{tenant.address || '—'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
