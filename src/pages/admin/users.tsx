'use client';

import Head from 'next/head';
import { Fragment, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: string;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface CreateFormData {
  email: string;
  password: string;
  full_name: string;
  role: string;
  tenant_id: string;
}

interface EditFormData {
  full_name: string;
  role: string;
  tenant_id: string;
}

export default function AdminUsers() {
  const { user, tenantId, role: myRole } = useAuthStore();
  const isSuperAdmin = myRole === 'super_admin';

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CreateFormData>({
    email: '',
    password: '',
    full_name: '',
    role: 'user',
    tenant_id: tenantId || '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({ full_name: '', role: 'user', tenant_id: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name || id;

  const fetchTenants = async () => {
    if (!isSuperAdmin) return;
    const { data } = await supabase.from('tenants').select('id, name').order('name', { ascending: true });
    setTenants(data || []);
  };

  const fetchUsers = async () => {
    if (!tenantId) return;

    setLoading(true);
    setListError('');

    let query = supabase
      .from('users')
      .select('id, email, full_name, role, tenant_id, created_at')
      .order('created_at', { ascending: true });

    if (isSuperAdmin) {
      if (tenantFilter !== 'ALL') query = query.eq('tenant_id', tenantFilter);
    } else {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantFilter, isSuperAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email.trim() || !formData.password || !formData.full_name.trim()) {
      setFormError('Email, password, and full name are required');
      return;
    }

    setSaving(true);
    setFormError('');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFormError('Your session has expired - please log in again');
      setSaving(false);
      return;
    }

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(formData),
    });

    const result = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFormError(result.error || 'Failed to create user');
      return;
    }

    setShowForm(false);
    setFormData({ email: '', password: '', full_name: '', role: 'user', tenant_id: tenantId || '' });
    fetchUsers();
  };

  const openEditForm = (u: TenantUser) => {
    setEditingId(u.id);
    setEditForm({ full_name: u.full_name || '', role: u.role, tenant_id: u.tenant_id });
    setEditError('');
  };

  const handleEditSubmit = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setEditError('Your session has expired - please log in again');
      setEditSaving(false);
      return;
    }

    const res = await fetch('/api/admin/edit-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId, ...editForm }),
    });

    const result = await res.json();
    setEditSaving(false);

    if (!res.ok) {
      setEditError(result.error || 'Failed to update user');
      return;
    }

    setEditingId(null);
    fetchUsers();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Users - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Users" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <p className="text-slate-600 text-sm">
              {users.length} user{users.length === 1 ? '' : 's'} - accounts are admin-created only, no
              self-service signup
            </p>
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <select
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="ALL">All tenants</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => {
                  setShowForm(true);
                  setFormError('');
                  setFormData((f) => ({ ...f, tenant_id: tenantId || '' }));
                }}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Create User
              </button>
            </div>
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {listError}
            </div>
          )}

          {showForm && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create User</h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm whitespace-pre-wrap">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password *</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={saving}
                    placeholder="min. 8 characters"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>

                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tenant</label>
                    <select
                      value={formData.tenant_id}
                      onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    {saving ? 'Creating...' : 'Create User'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
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
                <p className="mt-4 text-slate-600">Loading users...</p>
              </div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Role</th>
                    {isSuperAdmin && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Tenant</th>
                    )}
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Created</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => (
                    <Fragment key={u.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{u.full_name || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              u.role === 'super_admin'
                                ? 'bg-purple-100 text-purple-800'
                                : u.role === 'admin'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-6 py-4 text-sm text-slate-600">{tenantName(u.tenant_id)}</td>
                        )}
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          <button
                            onClick={() => (editingId === u.id ? setEditingId(null) : openEditForm(u))}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {editingId === u.id ? 'Cancel' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                      {editingId === u.id && (
                        <tr>
                          <td colSpan={isSuperAdmin ? 6 : 5} className="px-6 py-4 bg-slate-50 border-t border-b border-slate-200">
                            {editError && (
                              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                                {editError}
                              </div>
                            )}
                            <form
                              onSubmit={(e) => handleEditSubmit(e, u.id)}
                              className="flex flex-wrap items-end gap-3"
                            >
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                                <input
                                  type="text"
                                  value={editForm.full_name}
                                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                                  disabled={editSaving}
                                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                                <select
                                  value={editForm.role}
                                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                  disabled={editSaving || (u.id === user?.id && !isSuperAdmin)}
                                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                >
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                                  {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                                </select>
                              </div>
                              {isSuperAdmin && (
                                <div>
                                  <label className="block text-xs font-medium text-slate-700 mb-1">Tenant</label>
                                  <select
                                    value={editForm.tenant_id}
                                    onChange={(e) => setEditForm({ ...editForm, tenant_id: e.target.value })}
                                    disabled={editSaving}
                                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                  >
                                    {tenants.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <button
                                type="submit"
                                disabled={editSaving}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
                              >
                                {editSaving ? 'Saving...' : 'Save'}
                              </button>
                            </form>
                            <p className="text-xs text-slate-500 mt-2">
                              You can&apos;t demote or move the last admin/super admin of a tenant - promote
                              someone else first.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
