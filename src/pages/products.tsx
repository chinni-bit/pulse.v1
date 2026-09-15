'use client';

import Head from 'next/head';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { DetailModal, DetailField } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

const MAX_SKU_LENGTH = 40;
const MAX_TITLE_LENGTH = 200;
const MAX_BRAND_LENGTH = 100;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const NEW_BRAND_VALUE = '__new__';
const PAGE_SIZE_STORAGE_KEY = 'pulse.products.pageSize';

type SortKey = 'sku' | 'title' | 'brand_name' | 'product_type' | 'cost' | 'msrp' | 'status';
type StatusFilter = 'ACTIVE' | 'ALL' | 'INACTIVE' | 'FUTURE';

interface Product {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  brand_name: string | null;
  cost: number | null;
  msrp: number | null;
  status: string;
  reorder_threshold: number;
  product_type: string | null;
  finish: string | null;
  finish_group: string | null;
  dimensions: string | null;
  country_of_origin: string | null;
  customer_exclusivity: string | null;
}

interface ProductFormData {
  sku: string;
  title: string;
  description: string;
  brand_name: string;
  cost: string;
  msrp: string;
  status: string;
  reorder_threshold: string;
  product_type: string;
  finish: string;
  finish_group: string;
  dimensions: string;
  country_of_origin: string;
  customer_exclusivity: string;
}

const EMPTY_FORM: ProductFormData = {
  sku: '',
  title: '',
  description: '',
  brand_name: '',
  cost: '',
  msrp: '',
  status: 'ACTIVE',
  reorder_threshold: '10',
  product_type: '',
  finish: '',
  finish_group: '',
  dimensions: '',
  country_of_origin: '',
  customer_exclusivity: '',
};

interface Variant {
  id: string;
  variant_type: string | null;
  related_product_id: string;
  quantity_in_bundle: number | null;
  related_product?: { sku: string; title: string };
}

interface VariantFormData {
  variant_type: string;
  related_product_id: string;
  quantity_in_bundle: string;
}

const EMPTY_VARIANT_FORM: VariantFormData = {
  variant_type: '',
  related_product_id: '',
  quantity_in_bundle: '1',
};

interface ChannelListing {
  id: string;
  channel_sku: string;
  listing_name: string | null;
}

interface WarehouseInventoryRow {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  quantity: number;
}

export default function Products() {
  const { tenantId } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [listingsByProduct, setListingsByProduct] = useState<Record<string, Record<string, ChannelListing[]>>>({});
  const [listingLoading, setListingLoading] = useState(false);
  const [listingDraftName, setListingDraftName] = useState<Record<string, string>>({});
  const [listingDraftSku, setListingDraftSku] = useState<Record<string, string>>({});
  const [listingSaving, setListingSaving] = useState<string | null>(null);
  const [listingError, setListingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [viewingInventory, setViewingInventory] = useState<WarehouseInventoryRow[] | null>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem(PAGE_SIZE_STORAGE_KEY) : null;
    if (stored) setPageSize(Number(stored));
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [brandMode, setBrandMode] = useState<'select' | 'new'>('select');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantForm, setVariantForm] = useState<VariantFormData>(EMPTY_VARIANT_FORM);
  const [variantFormError, setVariantFormError] = useState('');
  const [variantSaving, setVariantSaving] = useState(false);

  const fetchProducts = async () => {
    if (!tenantId) return;

    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('products')
      .select(
        'id, sku, title, description, brand_name, cost, msrp, status, reorder_threshold, product_type, finish, finish_group, dimensions, country_of_origin, customer_exclusivity'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('title', { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const fetchChannelNames = async () => {
    if (!tenantId) return;

    const { data } = await supabase
      .from('channels')
      .select('channel_name')
      .eq('tenant_id', tenantId)
      .order('channel_name', { ascending: true });

    setChannelNames((data || []).map((c) => c.channel_name));
  };

  useEffect(() => {
    fetchProducts();
    fetchChannelNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, statusFilter]);

  const changePageSize = (size: number) => {
    setPageSize(size);
    if (typeof window !== 'undefined') sessionStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  };

  const brandOptions = useMemo(() => {
    const names = new Set<string>();
    products.forEach((p) => {
      if (p.brand_name) names.add(p.brand_name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredSortedProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    let filtered = statusFilter === 'ALL' ? products : products.filter((p) => p.status === statusFilter);

    if (term) {
      filtered = filtered.filter(
        (p) =>
          p.sku.toLowerCase().includes(term) ||
          p.title.toLowerCase().includes(term) ||
          (p.brand_name || '').toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term) ||
          (p.product_type || '').toLowerCase().includes(term) ||
          (p.finish || '').toLowerCase().includes(term) ||
          (p.finish_group || '').toLowerCase().includes(term)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'cost' || sortKey === 'msrp') {
        cmp = (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity);
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [products, search, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filteredSortedProducts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedProducts = filteredSortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setBrandMode('select');
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      sku: product.sku,
      title: product.title,
      description: product.description || '',
      brand_name: product.brand_name || '',
      cost: product.cost != null ? String(product.cost) : '',
      msrp: product.msrp != null ? String(product.msrp) : '',
      status: product.status,
      reorder_threshold: String(product.reorder_threshold),
      product_type: product.product_type || '',
      finish: product.finish || '',
      finish_group: product.finish_group || '',
      dimensions: product.dimensions || '',
      country_of_origin: product.country_of_origin || '',
      customer_exclusivity: product.customer_exclusivity || '',
    });
    setBrandMode('select');
    setFormError('');
    setShowForm(true);
  };

  const openDuplicateForm = (product: Product) => {
    setEditingId(null);
    setFormData({
      sku: '',
      title: `${product.title} (copy)`,
      description: product.description || '',
      brand_name: product.brand_name || '',
      cost: product.cost != null ? String(product.cost) : '',
      msrp: product.msrp != null ? String(product.msrp) : '',
      status: product.status,
      reorder_threshold: String(product.reorder_threshold),
      product_type: product.product_type || '',
      finish: product.finish || '',
      finish_group: product.finish_group || '',
      dimensions: product.dimensions || '',
      country_of_origin: product.country_of_origin || '',
      customer_exclusivity: product.customer_exclusivity || '',
    });
    setBrandMode('select');
    setFormError(`Enter a new SKU for this product - everything else was copied from ${product.sku}`);
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

    const sku = formData.sku.trim();
    const title = formData.title.trim();
    const brand = formData.brand_name.trim();

    if (!sku || !title) {
      setFormError('SKU and Title are required');
      return;
    }
    if (sku.length > MAX_SKU_LENGTH) {
      setFormError(`SKU can't be longer than ${MAX_SKU_LENGTH} characters`);
      return;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      setFormError(`Title can't be longer than ${MAX_TITLE_LENGTH} characters`);
      return;
    }
    if (brand.length > MAX_BRAND_LENGTH) {
      setFormError(`Brand can't be longer than ${MAX_BRAND_LENGTH} characters`);
      return;
    }
    const cost = formData.cost ? Number(formData.cost) : null;
    const msrp = formData.msrp ? Number(formData.msrp) : null;
    if (cost != null && cost < 0) {
      setFormError('Cost cannot be negative');
      return;
    }
    if (msrp != null && msrp < 0) {
      setFormError('MSRP cannot be negative');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      sku,
      title,
      description: formData.description.trim() || null,
      brand_name: brand || null,
      cost,
      msrp,
      status: formData.status,
      reorder_threshold: formData.reorder_threshold ? Number(formData.reorder_threshold) : 10,
      product_type: formData.product_type.trim() || null,
      finish: formData.finish.trim() || null,
      finish_group: formData.finish_group.trim() || null,
      dimensions: formData.dimensions.trim() || null,
      country_of_origin: formData.country_of_origin.trim() || null,
      customer_exclusivity: formData.customer_exclusivity.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId)
      : await supabase.from('products').insert({ ...payload, tenant_id: tenantId });

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    closeForm();
    fetchProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete "${product.title}" (${product.sku})? This can't be undone from here.`)) {
      return;
    }

    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', product.id);

    if (error) {
      setListError(error.message);
      return;
    }

    fetchProducts();
  };

  const fetchVariants = async (productId: string) => {
    setVariantLoading(true);

    const { data, error } = await supabase
      .from('product_variants')
      .select('id, variant_type, related_product_id, quantity_in_bundle, related_product:products!product_variants_related_product_id_fkey(sku, title)')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });

    if (!error) {
      setVariantsByProduct((prev) => ({ ...prev, [productId]: (data as unknown as Variant[]) || [] }));
    }
    setVariantLoading(false);
  };

  const fetchListings = async (productId: string) => {
    setListingLoading(true);

    const { data, error } = await supabase
      .from('product_mappings')
      .select('id, channel, channel_sku, listing_name')
      .eq('product_id', productId);

    if (!error) {
      const byChannel: Record<string, ChannelListing[]> = {};
      (data || []).forEach((row) => {
        if (row.channel_sku) {
          (byChannel[row.channel] ||= []).push({
            id: row.id,
            channel_sku: row.channel_sku,
            listing_name: row.listing_name,
          });
        }
      });
      setListingsByProduct((prev) => ({ ...prev, [productId]: byChannel }));
    }
    setListingLoading(false);
  };

  const fetchInventoryForProduct = async (productId: string) => {
    const { data: batches } = await supabase
      .from('inventory_batches')
      .select('id')
      .eq('product_id', productId);

    const batchIds = (batches || []).map((b) => b.id);
    if (batchIds.length === 0) {
      setViewingInventory([]);
      return;
    }

    const { data: locations } = await supabase
      .from('batch_locations')
      .select('warehouse_id, quantity, warehouses(name, code)')
      .in('batch_id', batchIds);

    const byWarehouse = new Map<string, WarehouseInventoryRow>();
    (locations as unknown as { warehouse_id: string; quantity: number; warehouses: { name: string; code: string } | null }[] || []).forEach(
      (loc) => {
        const existing = byWarehouse.get(loc.warehouse_id);
        if (existing) {
          existing.quantity += loc.quantity || 0;
        } else {
          byWarehouse.set(loc.warehouse_id, {
            warehouse_id: loc.warehouse_id,
            warehouse_name: loc.warehouses?.name || loc.warehouse_id,
            warehouse_code: loc.warehouses?.code || '',
            quantity: loc.quantity || 0,
          });
        }
      }
    );
    setViewingInventory(Array.from(byWarehouse.values()));
  };

  const openProductDetail = (product: Product) => {
    setViewingProduct(product);
    setViewingInventory(null);
    fetchInventoryForProduct(product.id);
  };

  const toggleVariants = (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    setVariantForm(EMPTY_VARIANT_FORM);
    setVariantFormError('');
    setListingDraftName({});
    setListingDraftSku({});
    setListingError('');
    if (!variantsByProduct[productId]) {
      fetchVariants(productId);
    }
    if (!listingsByProduct[productId]) {
      fetchListings(productId);
    }
  };

  const removeListing = async (productId: string, channel: string, listingId: string) => {
    if (!window.confirm(`Remove this ${channel} listing?`)) {
      return;
    }

    setListingSaving(channel);
    setListingError('');

    const { error } = await supabase.from('product_mappings').delete().eq('id', listingId);

    setListingSaving(null);
    if (error) {
      setListingError(error.message);
      return;
    }

    fetchListings(productId);
  };

  // Multiple listings per channel are allowed - a product can be sold
  // under several different names/SKUs on the same channel (owner
  // feedback 2026-09-15). listing_name is just a label to tell them
  // apart; leaving it blank is fine if there's only one.
  const addListing = async (productId: string, channel: string) => {
    if (!tenantId) return;

    const draftSku = (listingDraftSku[channel] ?? '').trim();
    if (!draftSku) return;
    const draftName = (listingDraftName[channel] ?? '').trim();

    setListingSaving(channel);
    setListingError('');

    const { error } = await supabase.from('product_mappings').insert({
      tenant_id: tenantId,
      product_id: productId,
      channel,
      channel_sku: draftSku,
      listing_name: draftName || null,
    });

    setListingSaving(null);
    if (error) {
      setListingError(error.message);
      return;
    }

    setListingDraftSku((prev) => ({ ...prev, [channel]: '' }));
    setListingDraftName((prev) => ({ ...prev, [channel]: '' }));
    fetchListings(productId);
  };

  const handleVariantSubmit = async (e: React.FormEvent, productId: string) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!variantForm.related_product_id) {
      setVariantFormError('Pick a related product');
      return;
    }

    setVariantSaving(true);
    setVariantFormError('');

    const { error } = await supabase.from('product_variants').insert({
      tenant_id: tenantId,
      product_id: productId,
      variant_type: variantForm.variant_type.trim() || null,
      related_product_id: variantForm.related_product_id,
      quantity_in_bundle: variantForm.quantity_in_bundle ? Number(variantForm.quantity_in_bundle) : null,
    });

    setVariantSaving(false);

    if (error) {
      setVariantFormError(error.message);
      return;
    }

    setVariantForm(EMPTY_VARIANT_FORM);
    fetchVariants(productId);
  };

  const handleVariantDelete = async (productId: string, variantId: string) => {
    if (!window.confirm('Remove this variant link?')) return;

    const { error } = await supabase.from('product_variants').delete().eq('id', variantId);

    if (error) {
      setVariantFormError(error.message);
      return;
    }

    fetchVariants(productId);
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Products - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Products" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <p className="text-slate-600 text-sm">
              {filteredSortedProducts.length} of {products.length} product{products.length === 1 ? '' : 's'}
            </p>
            <button
              onClick={openAddForm}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Product
            </button>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, title, brand, type, finish, description..."
              className="w-full sm:w-80 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ACTIVE">Active only</option>
                <option value="ALL">All statuses</option>
                <option value="INACTIVE">Inactive only</option>
                <option value="FUTURE">Future only</option>
              </select>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label htmlFor="pageSize">Rows per page</label>
                <select
                  id="pageSize"
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
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
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {listError}
            </div>
          )}

          {showForm && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                {editingId ? 'Edit Product' : 'Add Product'}
              </h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    disabled={saving}
                    maxLength={MAX_SKU_LENGTH}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    disabled={saving}
                    maxLength={MAX_TITLE_LENGTH}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  {brandMode === 'select' ? (
                    <select
                      value={brandOptions.includes(formData.brand_name) ? formData.brand_name : ''}
                      onChange={(e) => {
                        if (e.target.value === NEW_BRAND_VALUE) {
                          setBrandMode('new');
                          setFormData({ ...formData, brand_name: '' });
                        } else {
                          setFormData({ ...formData, brand_name: e.target.value });
                        }
                      }}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    >
                      <option value="">Select a brand...</option>
                      {brandOptions.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                      <option value={NEW_BRAND_VALUE}>+ Add new brand...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={formData.brand_name}
                        onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                        disabled={saving}
                        maxLength={MAX_BRAND_LENGTH}
                        placeholder="New brand name"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBrandMode('select');
                          setFormData({ ...formData, brand_name: '' });
                        }}
                        disabled={saving}
                        className="px-3 text-sm text-slate-600 hover:text-slate-900 whitespace-nowrap"
                      >
                        Use list
                      </button>
                    </div>
                  )}
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
                    <option value="FUTURE">Future</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">MSRP ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.msrp}
                    onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reorder_threshold}
                    onChange={(e) => setFormData({ ...formData, reorder_threshold: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                  <p className="text-xs text-slate-500 mt-1">Flagged as low stock below this quantity</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product Type</label>
                  <input
                    type="text"
                    value={formData.product_type}
                    onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                    disabled={saving}
                    placeholder="e.g. Crib, Dresser, Desk"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Finish</label>
                  <input
                    type="text"
                    value={formData.finish}
                    onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                    disabled={saving}
                    placeholder="e.g. Weathered White"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Finish Group</label>
                  <input
                    type="text"
                    value={formData.finish_group}
                    onChange={(e) => setFormData({ ...formData, finish_group: e.target.value })}
                    disabled={saving}
                    placeholder="e.g. Whites, Espressos"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dimensions</label>
                  <input
                    type="text"
                    value={formData.dimensions}
                    onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                    disabled={saving}
                    placeholder={'e.g. 54"W x 20"D x 34"H'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country of Origin</label>
                  <input
                    type="text"
                    value={formData.country_of_origin}
                    onChange={(e) => setFormData({ ...formData, country_of_origin: e.target.value })}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Exclusivity</label>
                  <input
                    type="text"
                    value={formData.customer_exclusivity}
                    onChange={(e) => setFormData({ ...formData, customer_exclusivity: e.target.value })}
                    disabled={saving}
                    placeholder="leave blank if not exclusive to one customer"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={saving}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Product'}
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
                <p className="mt-4 text-slate-600">Loading products...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No products yet. Add your first one above.</div>
            ) : filteredSortedProducts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No products match &quot;{search}&quot;.</div>
            ) : (
              <table className="min-w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {(
                      [
                        ['sku', 'SKU', 'w-36'],
                        ['title', 'Title', 'w-48'],
                        ['brand_name', 'Brand', 'w-28'],
                        ['product_type', 'Type', 'w-28'],
                        ['cost', 'Cost', 'w-20'],
                        ['msrp', 'MSRP', 'w-20'],
                        ['status', 'Status', 'w-24'],
                      ] as [SortKey, string, string][]
                    ).map(([key, label, width]) => (
                      <th
                        key={key}
                        className={`px-6 py-3 text-left text-sm font-semibold text-slate-900 ${width} cursor-pointer select-none hover:text-blue-700`}
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sortKey === key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 w-56">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pagedProducts.map((product) => (
                    <Fragment key={product.id}>
                      <tr className="hover:bg-slate-50">
                        <td
                          className="px-6 py-4 text-sm font-medium text-blue-700 hover:underline truncate cursor-pointer"
                          title={product.sku}
                          onClick={() => openProductDetail(product)}
                        >
                          {product.sku}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 truncate" title={product.title}>
                          {product.title}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 truncate" title={product.brand_name || ''}>
                          {product.brand_name || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 truncate" title={product.product_type || ''}>
                          {product.product_type || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {product.cost != null ? `$${product.cost.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {product.msrp != null ? `$${product.msrp.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              product.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-800'
                                : product.status === 'FUTURE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {product.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => toggleVariants(product.id)}
                            className="text-slate-600 hover:underline font-medium"
                          >
                            {expandedProductId === product.id ? 'Hide' : 'Listings'}
                          </button>
                          <button
                            onClick={() => openEditForm(product)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDuplicateForm(product)}
                            className="text-slate-600 hover:underline font-medium"
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            className="text-red-600 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {expandedProductId === product.id && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 bg-slate-50 border-t border-b border-slate-200">
                            <h3 className="text-sm font-semibold text-slate-900 mb-3">
                              Variants / bundle components for {product.title}
                            </h3>

                            {variantFormError && (
                              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                                {variantFormError}
                              </div>
                            )}

                            {variantLoading ? (
                              <p className="text-sm text-slate-500">Loading...</p>
                            ) : (
                              <>
                                {(variantsByProduct[product.id] || []).length === 0 ? (
                                  <p className="text-sm text-slate-500 mb-3">No variants linked yet.</p>
                                ) : (
                                  <table className="min-w-full mb-3 bg-white rounded border border-slate-200">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Type</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Related Product</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Qty in Bundle</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {(variantsByProduct[product.id] || []).map((variant) => (
                                        <tr key={variant.id}>
                                          <td className="px-4 py-2 text-sm text-slate-700">{variant.variant_type || '—'}</td>
                                          <td className="px-4 py-2 text-sm text-slate-700">
                                            {variant.related_product
                                              ? `${variant.related_product.sku} — ${variant.related_product.title}`
                                              : variant.related_product_id}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-slate-700">{variant.quantity_in_bundle ?? '—'}</td>
                                          <td className="px-4 py-2 text-sm text-right">
                                            <button
                                              onClick={() => handleVariantDelete(product.id, variant.id)}
                                              className="text-red-600 hover:underline font-medium"
                                            >
                                              Remove
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}

                                <form
                                  onSubmit={(e) => handleVariantSubmit(e, product.id)}
                                  className="flex flex-wrap items-end gap-3"
                                >
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                                    <input
                                      type="text"
                                      value={variantForm.variant_type}
                                      onChange={(e) => setVariantForm({ ...variantForm, variant_type: e.target.value })}
                                      placeholder="e.g. bundle_component, color"
                                      disabled={variantSaving}
                                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Related Product</label>
                                    <select
                                      value={variantForm.related_product_id}
                                      onChange={(e) =>
                                        setVariantForm({ ...variantForm, related_product_id: e.target.value })
                                      }
                                      disabled={variantSaving}
                                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 min-w-[220px]"
                                    >
                                      <option value="">Select a product...</option>
                                      {products
                                        .filter((p) => p.id !== product.id)
                                        .map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.sku} — {p.title}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Qty in Bundle</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={variantForm.quantity_in_bundle}
                                      onChange={(e) =>
                                        setVariantForm({ ...variantForm, quantity_in_bundle: e.target.value })
                                      }
                                      disabled={variantSaving}
                                      className="w-24 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    disabled={variantSaving}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
                                  >
                                    {variantSaving ? 'Adding...' : '+ Add Variant'}
                                  </button>
                                </form>
                              </>
                            )}

                            <h3 className="text-sm font-semibold text-slate-900 mt-6 mb-3">
                              Channel Listings for {product.title}
                            </h3>
                            <p className="text-xs text-slate-500 mb-3">
                              By default every channel uses this product&apos;s own SKU (
                              <strong>{product.sku}</strong>). Add a listing below if a channel lists this
                              product under a different code - add more than one if it&apos;s sold under
                              several names/SKUs on the same channel.
                            </p>

                            {listingError && (
                              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                                {listingError}
                              </div>
                            )}

                            {listingLoading ? (
                              <p className="text-sm text-slate-500">Loading...</p>
                            ) : channelNames.length === 0 ? (
                              <p className="text-sm text-slate-500">No channels configured yet.</p>
                            ) : (
                              <div className="space-y-4">
                                {channelNames.map((channel) => {
                                  const listings = listingsByProduct[product.id]?.[channel] || [];
                                  const draftSku = listingDraftSku[channel] ?? '';
                                  const draftName = listingDraftName[channel] ?? '';
                                  return (
                                    <div key={channel} className="bg-white rounded border border-slate-200 p-3">
                                      <p className="text-sm font-semibold text-slate-800 mb-2">{channel}</p>
                                      {listings.length === 0 ? (
                                        <p className="text-xs text-slate-400 mb-2">
                                          Using product SKU ({product.sku}) - no listings added.
                                        </p>
                                      ) : (
                                        <table className="min-w-full mb-2">
                                          <tbody className="divide-y divide-slate-100">
                                            {listings.map((listing) => (
                                              <tr key={listing.id}>
                                                <td className="py-1 pr-3 text-sm text-slate-700">
                                                  {listing.listing_name || <span className="text-slate-400">(unnamed)</span>}
                                                </td>
                                                <td className="py-1 pr-3 text-sm font-medium text-slate-900">
                                                  {listing.channel_sku}
                                                </td>
                                                <td className="py-1 text-right">
                                                  <button
                                                    onClick={() => removeListing(product.id, channel, listing.id)}
                                                    disabled={listingSaving === channel}
                                                    className="text-red-600 hover:underline font-medium text-xs"
                                                  >
                                                    Remove
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <div className="flex flex-wrap items-end gap-2">
                                        <div>
                                          <label className="block text-xs font-medium text-slate-700 mb-1">
                                            Listing name (optional)
                                          </label>
                                          <input
                                            type="text"
                                            value={draftName}
                                            onChange={(e) =>
                                              setListingDraftName((prev) => ({ ...prev, [channel]: e.target.value }))
                                            }
                                            placeholder="e.g. Farmhouse Dresser"
                                            disabled={listingSaving === channel}
                                            className="w-44 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-slate-700 mb-1">
                                            Channel SKU
                                          </label>
                                          <input
                                            type="text"
                                            value={draftSku}
                                            onChange={(e) =>
                                              setListingDraftSku((prev) => ({ ...prev, [channel]: e.target.value }))
                                            }
                                            placeholder="required"
                                            disabled={listingSaving === channel}
                                            className="w-40 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                          />
                                        </div>
                                        <button
                                          onClick={() => addListing(product.id, channel)}
                                          disabled={listingSaving === channel || !draftSku.trim()}
                                          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
                                        >
                                          {listingSaving === channel ? 'Saving...' : '+ Add Listing'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filteredSortedProducts.length > 0 && (
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

        {viewingProduct && (
          <DetailModal
            title={`${viewingProduct.title} (${viewingProduct.sku})`}
            onClose={() => setViewingProduct(null)}
            onEdit={() => {
              setViewingProduct(null);
              openEditForm(viewingProduct);
            }}
          >
            <DetailField label="Brand" value={viewingProduct.brand_name} />
            <DetailField label="Product Type" value={viewingProduct.product_type} />
            <DetailField label="Finish" value={viewingProduct.finish} />
            <DetailField label="Finish Group" value={viewingProduct.finish_group} />
            <DetailField label="Status" value={viewingProduct.status} />
            <DetailField
              label="Cost / MSRP"
              value={`${viewingProduct.cost != null ? `$${viewingProduct.cost.toFixed(2)}` : '—'} / ${
                viewingProduct.msrp != null ? `$${viewingProduct.msrp.toFixed(2)}` : '—'
              }`}
            />
            <DetailField label="Dimensions" value={viewingProduct.dimensions} />
            <DetailField label="Country of Origin" value={viewingProduct.country_of_origin} />
            <DetailField label="Customer Exclusivity" value={viewingProduct.customer_exclusivity} />
            <DetailField label="Description" value={viewingProduct.description} />

            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Inventory by Warehouse
              </div>
              {viewingInventory === null ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : viewingInventory.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No per-warehouse breakdown recorded for this product yet.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {viewingInventory.map((row) => (
                      <tr key={row.warehouse_id}>
                        <td className="py-1 pr-4 font-medium">
                          {row.warehouse_name} ({row.warehouse_code})
                        </td>
                        <td className="py-1">{row.quantity} units</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </DetailModal>
        )}
      </main>
    </ProtectedRoute>
  );
}
