'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MobileLayout } from '@/components/MobileLayout';
import { supabase } from '@/lib/supabase';

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  brand_name: string | null;
  status: string;
}
interface Batch {
  id: string;
  product_id: string;
}
interface Location {
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}
interface WarehouseLite {
  id: string;
  code: string;
}

interface ProductStock {
  product: ProductRow;
  total: number;
  byWarehouse: { code: string; qty: number }[];
}

export default function MobileInventory() {
  const { tenantId } = useAuthStore();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fetchAll = async () => {
      setLoading(true);
      const [{ data: prodData }, { data: batchData }, { data: locData }, { data: whData }] = await Promise.all([
        supabase.from('products').select('id, sku, title, brand_name, status').eq('tenant_id', tenantId).is('deleted_at', null).eq('status', 'ACTIVE').order('sku'),
        supabase.from('inventory_batches').select('id, product_id').eq('tenant_id', tenantId),
        supabase.from('batch_locations').select('batch_id, warehouse_id, quantity').eq('tenant_id', tenantId),
        supabase.from('warehouses').select('id, code').eq('tenant_id', tenantId).eq('is_active', true),
      ]);
      setProducts((prodData as ProductRow[]) || []);
      setBatches((batchData as Batch[]) || []);
      setLocations((locData as Location[]) || []);
      setWarehouses((whData as WarehouseLite[]) || []);
      setLoading(false);
    };
    fetchAll();
  }, [tenantId]);

  const stock = useMemo<ProductStock[]>(() => {
    const batchToProduct = new Map(batches.map((b) => [b.id, b.product_id]));
    const warehouseCode = new Map(warehouses.map((w) => [w.id, w.code]));
    const byProductWarehouse = new Map<string, Map<string, number>>();
    locations.forEach((loc) => {
      const productId = batchToProduct.get(loc.batch_id);
      if (!productId) return;
      const code = warehouseCode.get(loc.warehouse_id);
      if (!code) return;
      const whMap = byProductWarehouse.get(productId) || new Map<string, number>();
      whMap.set(code, (whMap.get(code) || 0) + loc.quantity);
      byProductWarehouse.set(productId, whMap);
    });
    return products
      .map((p) => {
        const whMap = byProductWarehouse.get(p.id) || new Map<string, number>();
        const byWarehouse = Array.from(whMap.entries()).map(([code, qty]) => ({ code, qty })).sort((a, b) => a.code.localeCompare(b.code));
        const total = byWarehouse.reduce((s, w) => s + w.qty, 0);
        return { product: p, total, byWarehouse };
      })
      .filter((row) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return row.product.sku.toLowerCase().includes(q) || row.product.title.toLowerCase().includes(q);
      })
      .sort((a, b) => a.product.sku.localeCompare(b.product.sku));
  }, [products, batches, locations, warehouses, search]);

  return (
    <ProtectedRoute>
      <MobileLayout title="Inventory">
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or title..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : stock.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No products match.</p>
        ) : (
          <div className="space-y-2">
            {stock.map((row) => {
              const expanded = expandedId === row.product.id;
              return (
                <div key={row.product.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : row.product.id)}
                    className="w-full flex items-center justify-between p-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.product.sku}</p>
                      <p className="text-xs text-slate-500">{row.product.title}</p>
                      {row.product.brand_name && <p className="text-[11px] text-slate-400">{row.product.brand_name}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${row.total === 0 ? 'text-red-600' : 'text-slate-900'}`}>{row.total}</p>
                      <p className="text-[11px] text-slate-400">on-hand</p>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 border-t border-slate-100 pt-2">
                      {row.byWarehouse.length === 0 ? (
                        <p className="text-xs text-slate-400">No stock assigned to a warehouse.</p>
                      ) : (
                        <div className="space-y-1">
                          {row.byWarehouse.map((w) => (
                            <div key={w.code} className="flex justify-between text-sm">
                              <span className="text-slate-600">{w.code}</span>
                              <span className="font-medium text-slate-900">{w.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </MobileLayout>
    </ProtectedRoute>
  );
}
