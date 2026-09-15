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
const NEW_FINISH_GROUP_VALUE = '__new__';
const PAGE_SIZE_STORAGE_KEY = 'pulse.products.pageSize';

const COUNTRY_OPTIONS = [
  'USA',
  'China',
  'Vietnam',
  'Thailand',
  'Indonesia',
  'India',
  'Mexico',
  'Malaysia',
  'Cambodia',
  'Other',
];

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
  finish_group_id: string | null;
  finish_groups: { name: string } | null;
  country_of_origin: string | null;
  product_length: number | null;
  product_width: number | null;
  product_height: number | null;
  dimension_unit: string | null;
  product_weight: number | null;
  weight_unit: string | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  dimension_notes: string | null;
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
  finish_group_id: string;
  country_of_origin: string;
  product_length: string;
  product_width: string;
  product_height: string;
  dimension_unit: string;
  product_weight: string;
  weight_unit: string;
  carton_length: string;
  carton_width: string;
  carton_height: string;
  carton_weight: string;
  dimension_notes: string;
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
  finish_group_id: '',
  country_of_origin: '',
  product_length: '',
  product_width: '',
  product_height: '',
  dimension_unit: 'in',
  product_weight: '',
  weight_unit: 'lbs',
  carton_length: '',
  carton_width: '',
  carton_height: '',
  carton_weight: '',
  dimension_notes: '',
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

interface CustomerGroup {
  id: string;
  name: string;
}

interface CustomerRow {
  id: string;
  name: string;
  customer_group_id: string | null;
}

interface ExclusivityRow {
  id: string;
  customer_group_id: string | null;
  customer_id: string | null;
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

  const [finishGroups, setFinishGroups] = useState<CustomerGroup[]>([]);
  const [finishGroupMode, setFinishGroupMode] = useState<'select' | 'new'>('select');
  const [newFinishGroupName, setNewFinishGroupName] = useState('');
  const [countryMode, setCountryMode] = useState<'select' | 'other'>('select');

  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [exclusivityByProduct, setExclusivityByProduct] = useState<Record<string, ExclusivityRow[]>>({});
  const [exclusivitySaving, setExclusivitySaving] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');

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
        'id, sku, title, description, brand_name, cost, msrp, status, reorder_threshold, product_type, finish, finish_group_id, finish_groups(name), country_of_origin, product_length, product_width, product_height, dimension_unit, product_weight, weight_unit, carton_length, carton_width, carton_height, carton_weight, dimension_notes'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('title', { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setProducts((data as unknown as Product[]) || []);
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

  const fetchFinishGroups = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('finish_groups')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    setFinishGroups(data || []);
  };

  const fetchCustomerGroups = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('customer_groups')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    setCustomerGroups(data || []);
  };

  const fetchCustomers = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('customers')
      .select('id, name, customer_group_id')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    setCustomers(data || []);
  };

  useEffect(() => {
    fetchProducts();
    fetchChannelNames();
    fetchFinishGroups();
    fetchCustomerGroups();
    fetchCustomers();
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
          (p.finish_groups?.name || '').toLowerCase().includes(term)
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
    setFinishGroupMode('select');
    setCountryMode('select');
    setFormError('');
    setShowForm(true);
  };

  const productToFormData = (product: Product, overrides: Partial<ProductFormData> = {}): ProductFormData => ({
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
    finish_group_id: product.finish_group_id || '',
    country_of_origin: product.country_of_origin || '',
    product_length: product.product_length != null ? String(product.product_length) : '',
    product_width: product.product_width != null ? String(product.product_width) : '',
    product_height: product.product_height != null ? String(product.product_height) : '',
    dimension_unit: product.dimension_unit || 'in',
    product_weight: product.product_weight != null ? String(product.product_weight) : '',
    weight_unit: product.weight_unit || 'lbs',
    carton_length: product.carton_length != null ? String(product.carton_length) : '',
    carton_width: product.carton_width != null ? String(product.carton_width) : '',
    carton_height: product.carton_height != null ? String(product.carton_height) : '',
    carton_weight: product.carton_weight != null ? String(product.carton_weight) : '',
    dimension_notes: product.dimension_notes || '',
    ...overrides,
  });

  const openEditForm = (product: Product) => {
    setEditingId(product.id);
    setFormData(productToFormData(product));
    setBrandMode('select');
    setFinishGroupMode('select');
    setCountryMode(product.country_of_origin && !COUNTRY_OPTIONS.includes(product.country_of_origin) ? 'other' : 'select');
    setFormError('');
    setShowForm(true);
  };

  const openDuplicateForm = (product: Product) => {
    setEditingId(null);
    setFormData(productToFormData(product, { sku: '', title: `${product.title} (copy)` }));
    setBrandMode('select');
    setFinishGroupMode('select');
    setCountryMode(product.country_of_origin && !COUNTRY_OPTIONS.includes(product.country_of_origin) ? 'other' : 'select');
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

    const numOrNull = (v: string) => (v.trim() ? Number(v) : null);

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
      finish_group_id: formData.finish_group_id || null,
      country_of_origin: formData.country_of_origin.trim() || null,
      product_length: numOrNull(formData.product_length),
      product_width: numOrNull(formData.product_width),
      product_height: numOrNull(formData.product_height),
      dimension_unit: formData.dimension_unit || null,
      product_weight: numOrNull(formData.product_weight),
      weight_unit: formData.weight_unit || null,
      carton_length: numOrNull(formData.carton_length),
      carton_width: numOrNull(formData.carton_width),
      carton_height: numOrNull(formData.carton_height),
      carton_weight: numOrNull(formData.carton_weight),
      dimension_notes: formData.dimension_notes.trim() || null,
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

  // Products are never hard-deleted (or soft-deleted via deleted_at) -
  // only deactivated. A deleted product could still be referenced by
  // historical order_items, and removing it (even "softly", hidden from
  // every query) would break that link for sales history/reporting.
  // Deactivating just flips status, same field the Active/Inactive/
  // Future filter already uses - the row and every reference to it stay
  // fully intact.
  const toggleActive = async (product: Product) => {
    const nextStatus = product.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    if (
      !window.confirm(
        nextStatus === 'INACTIVE'
          ? `Deactivate "${product.title}" (${product.sku})? It'll stop being pushed/synced to channels, but all history stays intact.`
          : `Reactivate "${product.title}" (${product.sku})?`
      )
    ) {
      return;
    }

    const { error } = await supabase.from('products').update({ status: nextStatus }).eq('id', product.id);

    if (error) {
      setListError(error.message);
      return;
    }

    setViewingProduct(null);
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
    if (!exclusivityByProduct[product.id]) {
      fetchExclusivity(product.id);
    }
  };

  const createFinishGroup = async (name: string): Promise<string | null> => {
    if (!tenantId || !name.trim()) return null;
    const { data, error } = await supabase
      .from('finish_groups')
      .insert({ tenant_id: tenantId, name: name.trim() })
      .select('id, name')
      .single();

    if (error || !data) {
      setFormError(error?.message || 'Failed to create finish group');
      return null;
    }

    setFinishGroups((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data.id;
  };

  const fetchExclusivity = async (productId: string) => {
    const { data, error } = await supabase
      .from('product_customer_exclusivity')
      .select('id, customer_group_id, customer_id')
      .eq('product_id', productId);

    if (!error) {
      setExclusivityByProduct((prev) => ({ ...prev, [productId]: data || [] }));
    }
  };

  const toggleGroupExclusivity = async (productId: string, groupId: string, checked: boolean) => {
    if (!tenantId) return;
    setExclusivitySaving(true);

    if (checked) {
      await supabase.from('product_customer_exclusivity').insert({
        tenant_id: tenantId,
        product_id: productId,
        customer_group_id: groupId,
      });
    } else {
      const existing = exclusivityByProduct[productId]?.find((r) => r.customer_group_id === groupId);
      if (existing) await supabase.from('product_customer_exclusivity').delete().eq('id', existing.id);
    }

    setExclusivitySaving(false);
    fetchExclusivity(productId);
  };

  const toggleCustomerExclusivity = async (productId: string, customerId: string, checked: boolean) => {
    if (!tenantId) return;
    setExclusivitySaving(true);

    if (checked) {
      await supabase.from('product_customer_exclusivity').insert({
        tenant_id: tenantId,
        product_id: productId,
        customer_id: customerId,
      });
    } else {
      const existing = exclusivityByProduct[productId]?.find((r) => r.customer_id === customerId);
      if (existing) await supabase.from('product_customer_exclusivity').delete().eq('id', existing.id);
    }

    setExclusivitySaving(false);
    fetchExclusivity(productId);
  };

  const addNewCustomerGroup = async () => {
    if (!tenantId || !newGroupName.trim()) return;
    const { data, error } = await supabase
      .from('customer_groups')
      .insert({ tenant_id: tenantId, name: newGroupName.trim() })
      .select('id, name')
      .single();
    if (!error && data) {
      setCustomerGroups((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName('');
    }
  };

  const addNewCustomer = async () => {
    if (!tenantId || !newCustomerName.trim()) return;
    const { data, error } = await supabase
      .from('customers')
      .insert({ tenant_id: tenantId, name: newCustomerName.trim() })
      .select('id, name, customer_group_id')
      .single();
    if (!error && data) {
      setCustomers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCustomerName('');
    }
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
    if (!exclusivityByProduct[productId]) {
      fetchExclusivity(productId);
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
                  {finishGroupMode === 'select' ? (
                    <select
                      value={formData.finish_group_id}
                      onChange={async (e) => {
                        if (e.target.value === NEW_FINISH_GROUP_VALUE) {
                          setFinishGroupMode('new');
                        } else {
                          setFormData({ ...formData, finish_group_id: e.target.value });
                        }
                      }}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    >
                      <option value="">Select a finish group...</option>
                      {finishGroups.map((fg) => (
                        <option key={fg.id} value={fg.id}>
                          {fg.name}
                        </option>
                      ))}
                      <option value={NEW_FINISH_GROUP_VALUE}>+ Add new finish group...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={newFinishGroupName}
                        onChange={(e) => setNewFinishGroupName(e.target.value)}
                        disabled={saving}
                        placeholder="e.g. Brown, Red, Yellow"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const id = await createFinishGroup(newFinishGroupName);
                          if (id) {
                            setFormData({ ...formData, finish_group_id: id });
                            setNewFinishGroupName('');
                            setFinishGroupMode('select');
                          }
                        }}
                        disabled={saving || !newFinishGroupName.trim()}
                        className="px-3 text-sm text-blue-600 hover:underline whitespace-nowrap disabled:text-slate-300"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinishGroupMode('select')}
                        disabled={saving}
                        className="px-3 text-sm text-slate-600 hover:text-slate-900 whitespace-nowrap"
                      >
                        Use list
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country of Origin</label>
                  {countryMode === 'select' ? (
                    <select
                      value={COUNTRY_OPTIONS.includes(formData.country_of_origin) ? formData.country_of_origin : ''}
                      onChange={(e) => {
                        if (e.target.value === 'Other') {
                          setCountryMode('other');
                          setFormData({ ...formData, country_of_origin: '' });
                        } else {
                          setFormData({ ...formData, country_of_origin: e.target.value });
                        }
                      }}
                      disabled={saving}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    >
                      <option value="">Select a country...</option>
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={formData.country_of_origin}
                        onChange={(e) => setFormData({ ...formData, country_of_origin: e.target.value })}
                        disabled={saving}
                        placeholder="Country name"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCountryMode('select');
                          setFormData({ ...formData, country_of_origin: '' });
                        }}
                        disabled={saving}
                        className="px-3 text-sm text-slate-600 hover:text-slate-900 whitespace-nowrap"
                      >
                        Use list
                      </button>
                    </div>
                  )}
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

                <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-1">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Dimensions &amp; Weight</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Product L</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.product_length}
                        onChange={(e) => setFormData({ ...formData, product_length: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Product W</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.product_width}
                        onChange={(e) => setFormData({ ...formData, product_width: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Product H</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.product_height}
                        onChange={(e) => setFormData({ ...formData, product_height: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Dim Unit</label>
                      <select
                        value={formData.dimension_unit}
                        onChange={(e) => setFormData({ ...formData, dimension_unit: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      >
                        <option value="in">inches</option>
                        <option value="cm">cm</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Product Weight</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.product_weight}
                        onChange={(e) => setFormData({ ...formData, product_weight: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Weight Unit</label>
                      <select
                        value={formData.weight_unit}
                        onChange={(e) => setFormData({ ...formData, weight_unit: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      >
                        <option value="lbs">lbs</option>
                        <option value="kg">kg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Carton Weight</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.carton_weight}
                        onChange={(e) => setFormData({ ...formData, carton_weight: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div />

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Carton L</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.carton_length}
                        onChange={(e) => setFormData({ ...formData, carton_length: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Carton W</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.carton_width}
                        onChange={(e) => setFormData({ ...formData, carton_width: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Carton H</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.carton_height}
                        onChange={(e) => setFormData({ ...formData, carton_height: e.target.value })}
                        disabled={saving}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Dimension Notes <span className="text-slate-400">(e.g. seat cushion depth)</span>
                    </label>
                    <textarea
                      value={formData.dimension_notes}
                      onChange={(e) => setFormData({ ...formData, dimension_notes: e.target.value })}
                      disabled={saving}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                    />
                  </div>
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
                            onClick={() => toggleActive(product)}
                            className={`hover:underline font-medium ${
                              product.status === 'INACTIVE' ? 'text-green-700' : 'text-red-600'
                            }`}
                          >
                            {product.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
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

                            <h3 className="text-sm font-semibold text-slate-900 mt-6 mb-3">
                              Customer Exclusivity for {product.title}
                            </h3>
                            <p className="text-xs text-slate-500 mb-3">
                              Leave everything unchecked if this product isn&apos;t exclusive to anyone.
                              Check a customer group and/or specific customers to restrict it.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-white rounded border border-slate-200 p-3">
                                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                  Customer Groups
                                </p>
                                {customerGroups.length === 0 ? (
                                  <p className="text-xs text-slate-400 mb-2">No customer groups yet.</p>
                                ) : (
                                  <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
                                    {customerGroups.map((g) => {
                                      const checked = (exclusivityByProduct[product.id] || []).some(
                                        (r) => r.customer_group_id === g.id
                                      );
                                      return (
                                        <label key={g.id} className="flex items-center gap-2 text-sm text-slate-700">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={exclusivitySaving}
                                            onChange={(e) => toggleGroupExclusivity(product.id, g.id, e.target.checked)}
                                            className="rounded border-slate-300"
                                          />
                                          {g.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="New group name"
                                    className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                  <button
                                    onClick={addNewCustomerGroup}
                                    disabled={!newGroupName.trim()}
                                    className="text-xs text-blue-600 hover:underline font-medium disabled:text-slate-300"
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>

                              <div className="bg-white rounded border border-slate-200 p-3">
                                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                  Individual Customers
                                </p>
                                {customers.length === 0 ? (
                                  <p className="text-xs text-slate-400 mb-2">No customers yet.</p>
                                ) : (
                                  <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
                                    {customers.map((c) => {
                                      const checked = (exclusivityByProduct[product.id] || []).some(
                                        (r) => r.customer_id === c.id
                                      );
                                      return (
                                        <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={exclusivitySaving}
                                            onChange={(e) =>
                                              toggleCustomerExclusivity(product.id, c.id, e.target.checked)
                                            }
                                            className="rounded border-slate-300"
                                          />
                                          {c.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newCustomerName}
                                    onChange={(e) => setNewCustomerName(e.target.value)}
                                    placeholder="New customer name"
                                    className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                  <button
                                    onClick={addNewCustomer}
                                    disabled={!newCustomerName.trim()}
                                    className="text-xs text-blue-600 hover:underline font-medium disabled:text-slate-300"
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>
                            </div>
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
            <DetailField label="Finish Group" value={viewingProduct.finish_groups?.name} />
            <DetailField label="Status" value={viewingProduct.status} />
            <DetailField
              label="Cost / MSRP"
              value={`${viewingProduct.cost != null ? `$${viewingProduct.cost.toFixed(2)}` : '—'} / ${
                viewingProduct.msrp != null ? `$${viewingProduct.msrp.toFixed(2)}` : '—'
              }`}
            />
            <DetailField
              label="Product Dimensions"
              value={
                viewingProduct.product_length || viewingProduct.product_width || viewingProduct.product_height
                  ? `${viewingProduct.product_length ?? '—'} x ${viewingProduct.product_width ?? '—'} x ${
                      viewingProduct.product_height ?? '—'
                    } ${viewingProduct.dimension_unit || ''}`
                  : null
              }
            />
            <DetailField
              label="Product Weight"
              value={viewingProduct.product_weight != null ? `${viewingProduct.product_weight} ${viewingProduct.weight_unit || ''}` : null}
            />
            <DetailField
              label="Carton Dimensions"
              value={
                viewingProduct.carton_length || viewingProduct.carton_width || viewingProduct.carton_height
                  ? `${viewingProduct.carton_length ?? '—'} x ${viewingProduct.carton_width ?? '—'} x ${
                      viewingProduct.carton_height ?? '—'
                    } ${viewingProduct.dimension_unit || ''}`
                  : null
              }
            />
            <DetailField
              label="Carton Weight"
              value={viewingProduct.carton_weight != null ? `${viewingProduct.carton_weight} ${viewingProduct.weight_unit || ''}` : null}
            />
            <DetailField label="Dimension Notes" value={viewingProduct.dimension_notes} />
            <DetailField label="Country of Origin" value={viewingProduct.country_of_origin} />
            <DetailField
              label="Customer Exclusivity"
              value={
                (exclusivityByProduct[viewingProduct.id] || []).length === 0
                  ? null
                  : (exclusivityByProduct[viewingProduct.id] || [])
                      .map((r) => {
                        if (r.customer_group_id) return customerGroups.find((g) => g.id === r.customer_group_id)?.name;
                        return customers.find((c) => c.id === r.customer_id)?.name;
                      })
                      .filter(Boolean)
                      .join(', ')
              }
            />
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
