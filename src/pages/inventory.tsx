'use client';

import Head from 'next/head';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  brand_name: string | null;
  status: string;
  reorder_threshold: number;
}

interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  cost_per_unit: number | null;
  original_landed_date: string | null;
  quantity_available: number;
}

interface Location {
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

interface BatchDetail {
  batch: Batch;
  locations: { warehouseId: string; warehouseName: string; qty: number }[];
  unassigned: number;
}

interface ProductInventory {
  product: ProductRow;
  byWarehouse: Record<string, number>;
  valueByWarehouse: Record<string, number>;
  totalQty: number;
  totalValue: number;
  unassignedQty: number;
  unassignedValue: number;
  batches: BatchDetail[];
}

type StatusFilter = 'ACTIVE' | 'ALL' | 'INACTIVE';

export default function Inventory() {
  const { tenantId } = useAuthStore();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<ProductInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [showValue, setShowValue] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchInventory = async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError('');

    const { data: warehouseData, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id, code, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (warehouseError) {
      setLoadError(warehouseError.message);
      setLoading(false);
      return;
    }

    setWarehouses(warehouseData || []);
    setSelectedWarehouseIds((prev) => (prev.size === 0 ? new Set((warehouseData || []).map((w) => w.id)) : prev));

    const { data: productsDataRaw, error: productsError } = await supabase
      .from('products')
      .select('id, sku, title, brand_id, brands(name), status, reorder_threshold')
      .eq('tenant_id', tenantId)
      .is('deactivated_at', null)
      .order('sku', { ascending: true });

    if (productsError) {
      setLoadError(productsError.message);
      setLoading(false);
      return;
    }

    const productsData: ProductRow[] = (productsDataRaw || []).map((p: any) => ({
      id: p.id,
      sku: p.sku,
      title: p.title,
      status: p.status,
      reorder_threshold: p.reorder_threshold,
      brand_name: p.brands?.name ?? null,
    }));

    const productIds = productsData.map((p) => p.id);

    const { data: batchesData, error: batchesError } = await supabase
      .from('inventory_batches')
      .select('id, product_id, batch_number, cost_per_unit, original_landed_date, quantity_available')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000']);

    if (batchesError) {
      setLoadError(batchesError.message);
      setLoading(false);
      return;
    }

    const batchIds = (batchesData || []).map((b) => b.id);

    const { data: locationsData, error: locationsError } = await supabase
      .from('batch_locations')
      .select('batch_id, warehouse_id, quantity')
      .eq('tenant_id', tenantId)
      .in('batch_id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000']);

    if (locationsError) {
      setLoadError(locationsError.message);
      setLoading(false);
      return;
    }

    const activeWarehouseIds = new Set((warehouseData || []).map((w) => w.id));
    const warehouseNameById = new Map((warehouseData || []).map((w) => [w.id, `${w.name} (${w.code})`]));

    const locationsByBatch = new Map<string, Location[]>();
    (locationsData || []).forEach((loc) => {
      (locationsByBatch.get(loc.batch_id) || locationsByBatch.set(loc.batch_id, []).get(loc.batch_id)!).push(loc);
    });

    const batchesByProduct = new Map<string, Batch[]>();
    (batchesData || []).forEach((b) => {
      (batchesByProduct.get(b.product_id) || batchesByProduct.set(b.product_id, []).get(b.product_id)!).push(b);
    });

    const inventory: ProductInventory[] = (productsData || []).map((product) => {
      const byWarehouse: Record<string, number> = {};
      const valueByWarehouse: Record<string, number> = {};
      let totalQty = 0;
      let totalValue = 0;
      let unassignedQty = 0;
      let unassignedValue = 0;

      const batchDetails: BatchDetail[] = (batchesByProduct.get(product.id) || []).map((batch) => {
        const cost = Number(batch.cost_per_unit || 0);
        const locs = locationsByBatch.get(batch.id) || [];
        let assignedInBatch = 0;

        const locationDetail = locs
          .filter((loc) => activeWarehouseIds.has(loc.warehouse_id))
          .map((loc) => {
            assignedInBatch += loc.quantity;
            byWarehouse[loc.warehouse_id] = (byWarehouse[loc.warehouse_id] || 0) + loc.quantity;
            valueByWarehouse[loc.warehouse_id] = (valueByWarehouse[loc.warehouse_id] || 0) + loc.quantity * cost;
            totalQty += loc.quantity;
            totalValue += loc.quantity * cost;
            return {
              warehouseId: loc.warehouse_id,
              warehouseName: warehouseNameById.get(loc.warehouse_id) || 'Unknown',
              qty: loc.quantity,
            };
          });

        const batchUnassigned = Math.max(0, batch.quantity_available - assignedInBatch);
        unassignedQty += batchUnassigned;
        unassignedValue += batchUnassigned * cost;

        return { batch, locations: locationDetail, unassigned: batchUnassigned };
      });

      return {
        product,
        byWarehouse,
        valueByWarehouse,
        totalQty,
        totalValue,
        unassignedQty,
        unassignedValue,
        batches: batchDetails,
      };
    });

    setRows(inventory);
    setLoading(false);
  };

  useEffect(() => {
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const toggleWarehouse = (id: string) => {
    setSelectedWarehouseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWarehouses = () => setSelectedWarehouseIds(new Set(warehouses.map((w) => w.id)));
  const selectNoWarehouses = () => setSelectedWarehouseIds(new Set());

  const visibleWarehouses = warehouses.filter((w) => selectedWarehouseIds.has(w.id));

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (statusFilter === 'ACTIVE') filtered = filtered.filter((r) => r.product.status === 'ACTIVE');
    else if (statusFilter === 'INACTIVE') filtered = filtered.filter((r) => r.product.status === 'INACTIVE');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.product.sku.toLowerCase().includes(q) ||
          r.product.title.toLowerCase().includes(q) ||
          (r.product.brand_name || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [rows, statusFilter, search]);

  const companyTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.totalUnits += r.totalQty;
        acc.totalValue += r.totalValue;
        acc.unassignedUnits += r.unassignedQty;
        acc.unassignedValue += r.unassignedValue;
        if (r.totalQty <= 0) acc.outOfStock += 1;
        else if (r.totalQty < r.product.reorder_threshold) acc.lowStock += 1;
        return acc;
      },
      { totalUnits: 0, totalValue: 0, unassignedUnits: 0, unassignedValue: 0, lowStock: 0, outOfStock: 0 }
    );
  }, [filteredRows]);

  const money = (n: number) => `$${n.toFixed(2)}`;

  const stockBadge = (row: ProductInventory) => {
    if (row.totalQty <= 0) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Out of Stock</span>;
    }
    if (row.totalQty < row.product.reorder_threshold) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Low</span>;
    }
    return null;
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Inventory - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Inventory" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{loadError}</div>
          )}

          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              Company-Wide Summary (active warehouses)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500 uppercase">Total Units</div>
                <div className="text-lg font-semibold text-slate-900">{companyTotals.totalUnits}</div>
              </div>
              {showValue && (
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500 uppercase">Total Value</div>
                  <div className="text-lg font-semibold text-slate-900">{money(companyTotals.totalValue)}</div>
                </div>
              )}
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500 uppercase">Low Stock SKUs</div>
                <div className="text-lg font-semibold text-orange-600">{companyTotals.lowStock}</div>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500 uppercase">Out of Stock SKUs</div>
                <div className="text-lg font-semibold text-red-600">{companyTotals.outOfStock}</div>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <div className="text-xs text-slate-500 uppercase">Unassigned Units</div>
                <div className="text-lg font-semibold text-slate-900">{companyTotals.unassignedUnits}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Received but not yet placed in a warehouse</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Warehouses Shown</h2>
            <div className="flex flex-wrap gap-3 items-center mb-2">
              {warehouses.map((w) => (
                <label key={w.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedWarehouseIds.has(w.id)}
                    onChange={() => toggleWarehouse(w.id)}
                    className="rounded border-slate-300"
                  />
                  {w.name} ({w.code})
                </label>
              ))}
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={selectAllWarehouses} className="text-blue-600 hover:underline">
                Select all
              </button>
              <button onClick={selectNoWarehouses} className="text-blue-600 hover:underline">
                Select none
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              The Total column always reflects every active warehouse, regardless of which are shown here.
            </p>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-slate-600 text-sm">
                {filteredRows.length} of {rows.length} SKU{rows.length === 1 ? '' : 's'}
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, title, brand..."
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm w-64"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ACTIVE">Active only</option>
                <option value="ALL">All statuses</option>
                <option value="INACTIVE">Inactive only</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showValue}
                  onChange={(e) => setShowValue(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Show $ value
              </label>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-slate-600">Loading inventory...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No SKUs match this filter.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">SKU</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Brand</th>
                    {visibleWarehouses.map((w) => (
                      <th key={w.id} className="px-4 py-3 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                        {w.code}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Unassigned</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Flag</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map((row) => (
                    <Fragment key={row.product.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{row.product.sku}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{row.product.title}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{row.product.brand_name || '—'}</td>
                        {visibleWarehouses.map((w) => (
                          <td key={w.id} className="px-4 py-3 text-sm text-slate-600 text-right whitespace-nowrap">
                            {row.byWarehouse[w.id] || 0}
                            {showValue && (
                              <span className="text-slate-400"> ({money(row.valueByWarehouse[w.id] || 0)})</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm text-slate-500 text-right whitespace-nowrap">
                          {row.unassignedQty}
                          {showValue && <span className="text-slate-400"> ({money(row.unassignedValue)})</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right whitespace-nowrap">
                          {row.totalQty}
                          {showValue && <span className="text-slate-500 font-normal"> ({money(row.totalValue)})</span>}
                        </td>
                        <td className="px-4 py-3">{stockBadge(row)}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.batches.length > 0 && (
                            <button
                              onClick={() => setExpandedId(expandedId === row.product.id ? null : row.product.id)}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {expandedId === row.product.id ? 'Hide' : 'Batches'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === row.product.id && (
                        <tr>
                          <td colSpan={7 + visibleWarehouses.length} className="px-4 py-4 bg-slate-50">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                              Batches for {row.product.sku}
                            </div>
                            <table className="min-w-full text-sm bg-white rounded border border-slate-200">
                              <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-200">
                                  <th className="py-1.5 px-3">Batch #</th>
                                  <th className="py-1.5 px-3">Landed Date</th>
                                  <th className="py-1.5 px-3">Cost/Unit</th>
                                  <th className="py-1.5 px-3">Available</th>
                                  <th className="py-1.5 px-3">Location Breakdown</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {row.batches.map((bd) => (
                                  <tr key={bd.batch.id}>
                                    <td className="py-1.5 px-3 font-medium">{bd.batch.batch_number}</td>
                                    <td className="py-1.5 px-3">{bd.batch.original_landed_date || '—'}</td>
                                    <td className="py-1.5 px-3">{money(Number(bd.batch.cost_per_unit || 0))}</td>
                                    <td className="py-1.5 px-3">{bd.batch.quantity_available}</td>
                                    <td className="py-1.5 px-3">
                                      {bd.locations.length === 0 ? (
                                        <span className="text-slate-400 italic">
                                          Not assigned to a warehouse yet{bd.unassigned > 0 ? ` (${bd.unassigned} units)` : ''}
                                        </span>
                                      ) : (
                                        <>
                                          {bd.locations.map((l) => `${l.warehouseName}: ${l.qty}`).join(', ')}
                                          {bd.unassigned > 0 && (
                                            <span className="text-slate-400"> + {bd.unassigned} unassigned</span>
                                          )}
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
