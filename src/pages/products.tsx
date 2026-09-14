'use client';

import Head from 'next/head';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  brand_name: string | null;
  cost: number | null;
  msrp: number | null;
  status: string;
}

interface ProductFormData {
  sku: string;
  title: string;
  description: string;
  brand_name: string;
  cost: string;
  msrp: string;
  status: string;
}

const EMPTY_FORM: ProductFormData = {
  sku: '',
  title: '',
  description: '',
  brand_name: '',
  cost: '',
  msrp: '',
  status: 'ACTIVE',
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

export default function Products() {
  const router = useRouter();
  const { user, tenantId, logout } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
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
      .select('id, sku, title, description, brand_name, cost, msrp, status')
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

  useEffect(() => {
    fetchProducts();
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

    if (!formData.sku.trim() || !formData.title.trim()) {
      setFormError('SKU and Title are required');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      sku: formData.sku.trim(),
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      brand_name: formData.brand_name.trim() || null,
      cost: formData.cost ? Number(formData.cost) : null,
      msrp: formData.msrp ? Number(formData.msrp) : null,
      status: formData.status,
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

  const toggleVariants = (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    setVariantForm(EMPTY_VARIANT_FORM);
    setVariantFormError('');
    if (!variantsByProduct[productId]) {
      fetchVariants(productId);
    }
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
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Products</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/warehouses" className="text-blue-600 hover:underline font-medium">
                Warehouses
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
            <p className="text-slate-600 text-sm">{products.length} product{products.length === 1 ? '' : 's'}</p>
            <button
              onClick={openAddForm}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Product
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={formData.brand_name}
                    onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                    disabled={saving}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
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
                    value={formData.msrp}
                    onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                    disabled={saving}
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
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">SKU</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Brand</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Cost</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">MSRP</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((product) => (
                    <Fragment key={product.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{product.sku}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{product.title}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{product.brand_name || '—'}</td>
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
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {product.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right space-x-3">
                          <button
                            onClick={() => toggleVariants(product.id)}
                            className="text-slate-600 hover:underline font-medium"
                          >
                            {expandedProductId === product.id ? 'Hide Variants' : 'Variants'}
                          </button>
                          <button
                            onClick={() => openEditForm(product)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Edit
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
                          <td colSpan={7} className="px-6 py-4 bg-slate-50 border-t border-b border-slate-200">
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
