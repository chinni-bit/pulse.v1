'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { DetailModal, DetailField } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

interface CustomerGroup {
  id: string;
  name: string;
  description: string | null;
}

interface Customer {
  id: string;
  name: string;
  customer_group_id: string | null;
  customer_groups: { name: string } | null;
  email: string | null;
  phone: string | null;
  inventory_update_email: string | null;
  support_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  is_active: boolean;
}

interface CustomerFormData {
  name: string;
  customer_group_id: string;
  email: string;
  phone: string;
  inventory_update_email: string;
  support_email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: '',
  customer_group_id: '',
  email: '',
  phone: '',
  inventory_update_email: '',
  support_email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  country: '',
};

interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
}

interface ExclusiveProduct {
  key: string;
  sku: string;
  title: string;
  via: 'This customer' | `Group: ${string}`;
}

interface TopProduct {
  productId: string;
  sku: string;
  title: string;
  revenue: number;
  units: number;
}

interface AnalyticsSummary {
  totalRevenue: number;
  totalProfit: number;
  orderCount: number;
  topProducts: TopProduct[];
}

const EMPTY_ANALYTICS: AnalyticsSummary = { totalRevenue: 0, totalProfit: 0, orderCount: 0, topProducts: [] };

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
type SortKey = 'name' | 'customer_group' | 'status';
type StatusFilter = 'ACTIVE' | 'ALL' | 'INACTIVE';

async function computeAnalytics(
  tenantId: string,
  filter: { customerId: string } | { customerIds: string[]; customerGroupId: string } | { all: true }
): Promise<AnalyticsSummary> {
  let orderQuery = supabase.from('orders').select('id, total_amount, status').eq('tenant_id', tenantId);
  let itemQuery = supabase
    .from('order_items')
    .select('product_id, quantity_ordered, unit_price, is_cancelled, products(sku, title, cost), orders!inner(customer_id, customer_group_id)')
    .eq('tenant_id', tenantId)
    .eq('is_cancelled', false);

  if ('customerId' in filter) {
    orderQuery = orderQuery.eq('customer_id', filter.customerId);
    itemQuery = itemQuery.eq('orders.customer_id', filter.customerId);
  } else if ('customerIds' in filter) {
    const orFilter =
      filter.customerIds.length > 0
        ? `customer_group_id.eq.${filter.customerGroupId},customer_id.in.(${filter.customerIds.join(',')})`
        : `customer_group_id.eq.${filter.customerGroupId}`;
    orderQuery = orderQuery.or(orFilter);
    itemQuery = itemQuery.or(
      filter.customerIds.length > 0
        ? `customer_group_id.eq.${filter.customerGroupId},customer_id.in.(${filter.customerIds.join(',')})`
        : `customer_group_id.eq.${filter.customerGroupId}`,
      { foreignTable: 'orders' }
    );
  }

  const [{ data: ordersData }, { data: itemsData }] = await Promise.all([orderQuery, itemQuery]);

  const activeOrders = (ordersData || []).filter((o) => o.status !== 'CANCELLED');
  const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const orderCount = activeOrders.length;

  const productTotals = new Map<string, TopProduct>();
  let totalProfit = 0;

  (itemsData as unknown as {
    product_id: string;
    quantity_ordered: number;
    unit_price: number;
    products: { sku: string; title: string; cost: number | null } | null;
  }[] || []).forEach((item) => {
    const revenue = Number(item.unit_price || 0) * Number(item.quantity_ordered || 0);
    const cost = Number(item.products?.cost || 0) * Number(item.quantity_ordered || 0);
    totalProfit += revenue - cost;

    const key = item.product_id;
    const existing = productTotals.get(key);
    if (existing) {
      existing.revenue += revenue;
      existing.units += item.quantity_ordered || 0;
    } else {
      productTotals.set(key, {
        productId: key,
        sku: item.products?.sku || '—',
        title: item.products?.title || '—',
        revenue,
        units: item.quantity_ordered || 0,
      });
    }
  });

  const topProducts = Array.from(productTotals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return { totalRevenue, totalProfit, orderCount, topProducts };
}

export default function Customers() {
  const { tenantId } = useAuthStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupDescDraft, setGroupDescDraft] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState('');
  const [viewingGroup, setViewingGroup] = useState<CustomerGroup | null>(null);
  const [groupAnalytics, setGroupAnalytics] = useState<AnalyticsSummary>(EMPTY_ANALYTICS);
  const [groupAnalyticsLoading, setGroupAnalyticsLoading] = useState(false);

  const [viewing, setViewing] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [exclusiveProducts, setExclusiveProducts] = useState<ExclusiveProduct[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(EMPTY_ANALYTICS);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);

  const [companyAnalytics, setCompanyAnalytics] = useState<AnalyticsSummary>(EMPTY_ANALYTICS);
  const [companyAnalyticsLoading, setCompanyAnalyticsLoading] = useState(true);

  const fetchCustomerGroups = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('customer_groups')
      .select('id, name, description')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    setCustomerGroups(data || []);
  };

  const fetchCustomers = async () => {
    if (!tenantId) return;
    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('customers')
      .select(
        'id, name, customer_group_id, customer_groups(name), email, phone, inventory_update_email, support_email, address, city, state, zip, country, is_active'
      )
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setCustomers((data as unknown as Customer[]) || []);
    }
    setLoading(false);
  };

  const fetchCompanyAnalytics = async () => {
    if (!tenantId) return;
    setCompanyAnalyticsLoading(true);
    const result = await computeAnalytics(tenantId, { all: true });
    setCompanyAnalytics(result);
    setCompanyAnalyticsLoading(false);
  };

  useEffect(() => {
    fetchCustomerGroups();
    fetchCustomers();
    fetchCompanyAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    setPage(1);
  }, [search, groupFilter, statusFilter, pageSize]);

  const openAddForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (customer: Customer) => {
    setEditingId(customer.id);
    setFormData({
      name: customer.name,
      customer_group_id: customer.customer_group_id || '',
      email: customer.email || '',
      phone: customer.phone || '',
      inventory_update_email: customer.inventory_update_email || '',
      support_email: customer.support_email || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      country: customer.country || '',
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

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      name: formData.name.trim(),
      customer_group_id: formData.customer_group_id || null,
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      inventory_update_email: formData.inventory_update_email.trim() || null,
      support_email: formData.support_email.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      state: formData.state.trim() || null,
      zip: formData.zip.trim() || null,
      country: formData.country.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('customers').update(payload).eq('id', editingId)
      : await supabase.from('customers').insert({ ...payload, tenant_id: tenantId });

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    closeForm();
    fetchCustomers();
  };

  const toggleActive = async (customer: Customer) => {
    const nextActive = !customer.is_active;
    if (
      !window.confirm(
        nextActive
          ? `Reactivate "${customer.name}"?`
          : `Deactivate "${customer.name}"? Existing orders and exclusivity rules stay intact - nothing is deleted.`
      )
    ) {
      return;
    }

    const { error } = await supabase.from('customers').update({ is_active: nextActive }).eq('id', customer.id);
    if (error) {
      setListError(error.message);
      return;
    }

    setViewing(null);
    fetchCustomers();
  };

  const addCustomerGroup = async () => {
    if (!tenantId || !groupNameDraft.trim()) return;
    setGroupError('');

    if (editingGroupId) {
      const { error } = await supabase
        .from('customer_groups')
        .update({ name: groupNameDraft.trim(), description: groupDescDraft.trim() || null })
        .eq('id', editingGroupId);
      if (error) {
        setGroupError(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('customer_groups')
        .insert({ tenant_id: tenantId, name: groupNameDraft.trim(), description: groupDescDraft.trim() || null });
      if (error) {
        setGroupError(error.message);
        return;
      }
    }

    setGroupNameDraft('');
    setGroupDescDraft('');
    setEditingGroupId(null);
    fetchCustomerGroups();
  };

  const startEditGroup = (group: CustomerGroup) => {
    setEditingGroupId(group.id);
    setGroupNameDraft(group.name);
    setGroupDescDraft(group.description || '');
    setGroupError('');
  };

  const cancelEditGroup = () => {
    setEditingGroupId(null);
    setGroupNameDraft('');
    setGroupDescDraft('');
    setGroupError('');
  };

  const openGroupDetail = async (group: CustomerGroup) => {
    if (!tenantId) return;
    setViewingGroup(group);
    setGroupAnalyticsLoading(true);
    const customerIds = customers.filter((c) => c.customer_group_id === group.id).map((c) => c.id);
    const result = await computeAnalytics(tenantId, { customerIds, customerGroupId: group.id });
    setGroupAnalytics(result);
    setGroupAnalyticsLoading(false);
  };

  const fetchContacts = async (customerId: string) => {
    const { data } = await supabase
      .from('customer_contacts')
      .select('id, customer_id, name, title, email, phone')
      .eq('customer_id', customerId)
      .order('name', { ascending: true });
    setContacts(data || []);
  };

  const fetchExclusiveProducts = async (customer: Customer) => {
    if (!tenantId) return;
    const orFilter = customer.customer_group_id
      ? `customer_id.eq.${customer.id},customer_group_id.eq.${customer.customer_group_id}`
      : `customer_id.eq.${customer.id}`;

    const { data } = await supabase
      .from('product_customer_exclusivity')
      .select('id, customer_id, customer_group_id, products(sku, title)')
      .eq('tenant_id', tenantId)
      .or(orFilter);

    const rows = (data as unknown as {
      id: string;
      customer_id: string | null;
      customer_group_id: string | null;
      products: { sku: string; title: string } | null;
    }[]) || [];

    setExclusiveProducts(
      rows.map((r) => ({
        key: r.id,
        sku: r.products?.sku || '—',
        title: r.products?.title || '—',
        via: r.customer_id
          ? ('This customer' as const)
          : (`Group: ${customer.customer_groups?.name || ''}` as const),
      }))
    );
  };

  const openCustomerDetail = async (customer: Customer) => {
    if (!tenantId) return;
    setViewing(customer);
    setDetailLoading(true);
    setNewContact({ name: '', title: '', email: '', phone: '' });

    await Promise.all([
      fetchContacts(customer.id),
      fetchExclusiveProducts(customer),
      computeAnalytics(tenantId, { customerId: customer.id }).then(setAnalytics),
    ]);

    setDetailLoading(false);
  };

  const addContact = async () => {
    if (!tenantId || !viewing || !newContact.name.trim()) return;
    setContactSaving(true);

    const { error } = await supabase.from('customer_contacts').insert({
      tenant_id: tenantId,
      customer_id: viewing.id,
      name: newContact.name.trim(),
      title: newContact.title.trim() || null,
      email: newContact.email.trim() || null,
      phone: newContact.phone.trim() || null,
    });

    setContactSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setNewContact({ name: '', title: '', email: '', phone: '' });
    fetchContacts(viewing.id);
  };

  const removeContact = async (contactId: string) => {
    if (!viewing) return;
    if (!window.confirm('Remove this contact?')) return;
    await supabase.from('customer_contacts').delete().eq('id', contactId);
    fetchContacts(viewing.id);
  };

  const filteredSorted = useMemo(() => {
    let filtered = customers;
    if (statusFilter === 'ACTIVE') filtered = filtered.filter((c) => c.is_active);
    else if (statusFilter === 'INACTIVE') filtered = filtered.filter((c) => !c.is_active);
    if (groupFilter !== 'ALL') filtered = filtered.filter((c) => c.customer_group_id === groupFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.customer_groups?.name || '').toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'customer_group') {
        cmp = (a.customer_groups?.name || '').localeCompare(b.customer_groups?.name || '');
      } else if (sortKey === 'status') {
        cmp = Number(a.is_active) - Number(b.is_active);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [customers, statusFilter, groupFilter, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = filteredSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const money = (n: number) => `$${n.toFixed(2)}`;

  const AnalyticsBlock = ({ data, loadingFlag }: { data: AnalyticsSummary; loadingFlag: boolean }) => (
    <div>
      {loadingFlag ? (
        <p className="text-sm text-slate-500">Loading analytics...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500 uppercase">Revenue</div>
              <div className="text-sm font-semibold text-slate-900">{money(data.totalRevenue)}</div>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500 uppercase">Profit</div>
              <div className="text-sm font-semibold text-slate-900">{money(data.totalProfit)}</div>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500 uppercase">Orders</div>
              <div className="text-sm font-semibold text-slate-900">{data.orderCount}</div>
            </div>
          </div>
          {data.topProducts.length > 0 && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-4">SKU</th>
                  <th className="py-1 pr-4">Title</th>
                  <th className="py-1 pr-4">Units</th>
                  <th className="py-1">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td className="py-1.5 pr-4 font-medium">{p.sku}</td>
                    <td className="py-1.5 pr-4">{p.title}</td>
                    <td className="py-1.5 pr-4">{p.units}</td>
                    <td className="py-1.5">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );

  return (
    <ProtectedRoute>
      <Head>
        <title>Customers - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Customers" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              Company-Wide Summary
            </h2>
            <AnalyticsBlock data={companyAnalytics} loadingFlag={companyAnalyticsLoading} />
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Customer Groups</h2>
            {customerGroups.length === 0 ? (
              <p className="text-sm text-slate-400 mb-3">No customer groups yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {customerGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => openGroupDetail(g)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-sm text-slate-700 flex items-center gap-2"
                  >
                    {g.name}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditGroup(g);
                      }}
                      className="text-slate-400 hover:text-blue-600 text-xs"
                    >
                      edit
                    </span>
                  </button>
                ))}
              </div>
            )}

            {groupError && <div className="mb-2 text-sm text-red-600">{groupError}</div>}

            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                placeholder="Group name, e.g. Wayfair"
                className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                value={groupDescDraft}
                onChange={(e) => setGroupDescDraft(e.target.value)}
                placeholder="Description (optional)"
                className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none flex-1 min-w-[200px]"
              />
              <button
                onClick={addCustomerGroup}
                disabled={!groupNameDraft.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
              >
                {editingGroupId ? 'Save' : '+ Add Group'}
              </button>
              {editingGroupId && (
                <button onClick={cancelEditGroup} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-slate-600 text-sm">
                {filteredSorted.length} of {customers.length} customer{customers.length === 1 ? '' : 's'}
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, group..."
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm w-64"
              />
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ALL">All groups</option>
                {customerGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ACTIVE">Active only</option>
                <option value="ALL">All statuses</option>
                <option value="INACTIVE">Inactive only</option>
              </select>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label htmlFor="pageSize">Rows per page</label>
                <select
                  id="pageSize"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={openAddForm}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Customer
            </button>
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{listError}</div>
          )}

          {showForm && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                {editingId ? 'Edit Customer' : 'Add Customer'}
              </h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Group</label>
                  <select
                    value={formData.customer_group_id}
                    onChange={(e) => setFormData({ ...formData, customer_group_id: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  >
                    <option value="">No group</option>
                    {customerGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Inventory Update Email</label>
                  <input
                    type="email"
                    value={formData.inventory_update_email}
                    onChange={(e) => setFormData({ ...formData, inventory_update_email: e.target.value })}
                    disabled={saving}
                    placeholder="Where to send stock/inventory updates"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Support Email</label>
                  <input
                    type="email"
                    value={formData.support_email}
                    onChange={(e) => setFormData({ ...formData, support_email: e.target.value })}
                    disabled={saving}
                    placeholder="Where to send tickets/queries"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={saving}
                    placeholder="Street"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Customer'}
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
                <p className="mt-4 text-slate-600">Loading customers...</p>
              </div>
            ) : filteredSorted.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {customers.length === 0 ? 'No customers yet. Add your first one above.' : 'No customers match this filter.'}
              </div>
            ) : (
              <table className="min-w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-48 cursor-pointer select-none hover:text-blue-700"
                      onClick={() => toggleSort('name')}
                    >
                      Name{sortKey === 'name' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-40 cursor-pointer select-none hover:text-blue-700"
                      onClick={() => toggleSort('customer_group')}
                    >
                      Group{sortKey === 'customer_group' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-32">Phone</th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-24 cursor-pointer select-none hover:text-blue-700"
                      onClick={() => toggleSort('status')}
                    >
                      Status{sortKey === 'status' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paged.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td
                        className="px-6 py-4 text-sm font-medium text-blue-700 hover:underline truncate cursor-pointer"
                        onClick={() => openCustomerDetail(customer)}
                      >
                        {customer.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">
                        {customer.customer_groups?.name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">{customer.email || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">{customer.phone || '—'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            customer.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right space-x-3">
                        <button
                          onClick={() => openEditForm(customer)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(customer)}
                          className={`hover:underline font-medium ${
                            customer.is_active ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {customer.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filteredSorted.length > 0 && (
            <div className="flex justify-between items-center mt-4 text-sm text-slate-600">
              <span>
                Page {currentPage} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {viewingGroup && (
          <DetailModal title={`${viewingGroup.name} (Group)`} onClose={() => setViewingGroup(null)}>
            <DetailField label="Description" value={viewingGroup.description} />
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Group Analytics (incl. member customers)
              </div>
              <AnalyticsBlock data={groupAnalytics} loadingFlag={groupAnalyticsLoading} />
            </div>
          </DetailModal>
        )}

        {viewing && (
          <DetailModal
            title={viewing.name}
            onClose={() => setViewing(null)}
            onEdit={() => {
              setViewing(null);
              openEditForm(viewing);
            }}
          >
            {detailLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <>
                <DetailField label="Status" value={viewing.is_active ? 'Active' : 'Inactive'} />
                <DetailField label="Customer Group" value={viewing.customer_groups?.name} />
                <DetailField label="Email" value={viewing.email} />
                <DetailField label="Phone" value={viewing.phone} />
                <DetailField label="Inventory Update Email" value={viewing.inventory_update_email} />
                <DetailField label="Support Email" value={viewing.support_email} />
                <DetailField
                  label="Address"
                  value={[viewing.address, viewing.city, viewing.state, viewing.zip, viewing.country]
                    .filter(Boolean)
                    .join(', ')}
                />

                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Contacts</div>
                  {contacts.length === 0 ? (
                    <p className="text-sm text-slate-500 mb-2">No contacts yet.</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {contacts.map((c) => (
                        <div key={c.id} className="flex justify-between items-center text-sm bg-slate-50 rounded px-2 py-1">
                          <span>
                            <span className="font-medium">{c.name}</span>
                            {c.title && <span className="text-slate-500"> — {c.title}</span>}
                            {(c.email || c.phone) && (
                              <span className="text-slate-500"> ({[c.email, c.phone].filter(Boolean).join(', ')})</span>
                            )}
                          </span>
                          <button onClick={() => removeContact(c.id)} className="text-red-500 hover:underline text-xs">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newContact.name}
                      onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                      placeholder="Name"
                      className="px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      value={newContact.title}
                      onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                      placeholder="Title (optional)"
                      className="px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                    <input
                      type="email"
                      value={newContact.email}
                      onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                      placeholder="Email"
                      className="px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                    <input
                      type="tel"
                      value={newContact.phone}
                      onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                      placeholder="Phone"
                      className="px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                  </div>
                  <button
                    onClick={addContact}
                    disabled={contactSaving || !newContact.name.trim()}
                    className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    + Add Contact
                  </button>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    Exclusive Products
                  </div>
                  {exclusiveProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No products are exclusive to this customer or their group.
                    </p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-1 pr-4">SKU</th>
                          <th className="py-1 pr-4">Title</th>
                          <th className="py-1">Via</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {exclusiveProducts.map((p) => (
                          <tr key={p.key}>
                            <td className="py-1.5 pr-4 font-medium">{p.sku}</td>
                            <td className="py-1.5 pr-4">{p.title}</td>
                            <td className="py-1.5 text-slate-500">{p.via}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Analytics</div>
                  <AnalyticsBlock data={analytics} loadingFlag={false} />
                </div>
              </>
            )}
          </DetailModal>
        )}
      </main>
    </ProtectedRoute>
  );
}
