'use client';

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  sku: string;
  title: string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface LocationRow {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  cost_per_unit: number | null;
  original_landed_date: string | null;
}

interface WorklistRow {
  product: Product;
  quantity: number;
  value: number;
  oldestLandedDate: string | null;
}

interface CountRecord {
  id: string;
  product_id: string;
  warehouse_id: string;
  counted_quantity: number;
  system_quantity_at_count: number;
  variance: number;
  counted_at: string;
  notes: string | null;
  sku?: string;
  warehouseName?: string;
}

interface CsvRow {
  sku: string;
  warehouseCode: string;
  countedQuantity: number;
  notes: string;
  matchedProductId: string | null;
  matchedWarehouseId: string | null;
  systemQty: number | null;
  error: string | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

export default function InventoryCounts() {
  const { tenantId, user } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [recentCounts, setRecentCounts] = useState<CountRecord[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAll = async () => {
    if (!tenantId) return;
    setError('');

    const [{ data: productsData }, { data: warehousesData }, { data: locationsData }, { data: countsData }] = await Promise.all([
      supabase.from('products').select('id, sku, title').eq('tenant_id', tenantId).eq('status', 'ACTIVE').is('deactivated_at', null).order('sku'),
      supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      supabase
        .from('batch_locations')
        .select('warehouse_id, quantity, inventory_batches!inner(product_id, cost_per_unit, original_landed_date, status)')
        .eq('tenant_id', tenantId)
        .eq('inventory_batches.status', 'RECEIVED'),
      supabase
        .from('inventory_counts')
        .select('id, product_id, warehouse_id, counted_quantity, system_quantity_at_count, variance, counted_at, notes')
        .eq('tenant_id', tenantId)
        .order('counted_at', { ascending: false })
        .limit(50),
    ]);

    setProducts(productsData || []);
    setWarehouses(warehousesData || []);

    const locs = (
      (locationsData as unknown as {
        warehouse_id: string;
        quantity: number;
        inventory_batches: { product_id: string; cost_per_unit: number | null; original_landed_date: string | null };
      }[]) || []
    ).map((l) => ({
      product_id: l.inventory_batches.product_id,
      warehouse_id: l.warehouse_id,
      quantity: l.quantity,
      cost_per_unit: l.inventory_batches.cost_per_unit,
      original_landed_date: l.inventory_batches.original_landed_date,
    }));
    setLocations(locs);
    setRecentCounts((countsData as CountRecord[]) || []);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const systemQty = (productId: string, warehouseId: string) =>
    locations.filter((l) => l.product_id === productId && l.warehouse_id === warehouseId).reduce((s, l) => s + l.quantity, 0);

  // ---- Worklist generator ----
  const [wlWarehouseId, setWlWarehouseId] = useState('');
  const [wlCriteria, setWlCriteria] = useState<'LOW_QTY' | 'TOP_VALUE' | 'OLDEST' | 'RANDOM'>('LOW_QTY');
  const [wlThreshold, setWlThreshold] = useState('10');
  const [wlCount, setWlCount] = useState('5');
  const [worklist, setWorklist] = useState<WorklistRow[] | null>(null);
  const [worklistGeneratedAt, setWorklistGeneratedAt] = useState('');

  const generateWorklist = () => {
    if (!wlWarehouseId) {
      setError('Choose a warehouse first.');
      return;
    }
    setError('');

    const rows: WorklistRow[] = products
      .map((p) => {
        const locs = locations.filter((l) => l.product_id === p.id && l.warehouse_id === wlWarehouseId);
        const quantity = locs.reduce((s, l) => s + l.quantity, 0);
        const value = locs.reduce((s, l) => s + l.quantity * Number(l.cost_per_unit || 0), 0);
        const dates = locs.map((l) => l.original_landed_date).filter(Boolean) as string[];
        const oldestLandedDate = dates.length > 0 ? dates.sort()[0] : null;
        return { product: p, quantity, value, oldestLandedDate };
      })
      .filter((r) => r.quantity > 0);

    let result: WorklistRow[] = [];
    if (wlCriteria === 'LOW_QTY') {
      const threshold = Number(wlThreshold) || 0;
      result = rows.filter((r) => r.quantity < threshold).sort((a, b) => a.quantity - b.quantity);
    } else if (wlCriteria === 'TOP_VALUE') {
      const n = Number(wlCount) || 5;
      result = [...rows].sort((a, b) => b.value - a.value).slice(0, n);
    } else if (wlCriteria === 'OLDEST') {
      const n = Number(wlCount) || 5;
      result = [...rows]
        .filter((r) => r.oldestLandedDate)
        .sort((a, b) => (a.oldestLandedDate! < b.oldestLandedDate! ? -1 : 1))
        .slice(0, n);
    } else {
      const n = Number(wlCount) || 5;
      const shuffled = [...rows].sort(() => Math.random() - 0.5);
      result = shuffled.slice(0, n);
    }

    setWorklist(result);
    setWorklistGeneratedAt(new Date().toLocaleString());
  };

  // ---- Manual count entry ----
  const [cProductId, setCProductId] = useState('');
  const [cWarehouseId, setCWarehouseId] = useState('');
  const [cCountedQty, setCCountedQty] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cSaving, setCSaving] = useState(false);

  const currentSystemQty = cProductId && cWarehouseId ? systemQty(cProductId, cWarehouseId) : null;
  const currentVariance = currentSystemQty != null && cCountedQty.trim() ? Number(cCountedQty) - currentSystemQty : null;

  const submitCount = async () => {
    if (!tenantId || !cProductId || !cWarehouseId || !cCountedQty.trim()) {
      setError('Product, warehouse, and counted quantity are required.');
      return;
    }
    setCSaving(true);
    setError('');

    const sysQty = systemQty(cProductId, cWarehouseId);
    const { error: err } = await supabase.from('inventory_counts').insert({
      tenant_id: tenantId,
      product_id: cProductId,
      warehouse_id: cWarehouseId,
      counted_quantity: Number(cCountedQty),
      system_quantity_at_count: sysQty,
      counted_by: user?.id || null,
      notes: cNotes.trim() || null,
    });

    setCSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    await supabase.from('inventory_audit_log').insert({
      tenant_id: tenantId,
      event_type: 'COUNT_SUBMITTED',
      product_id: cProductId,
      warehouse_id: cWarehouseId,
      quantity_delta: Number(cCountedQty) - sysQty,
      performed_by: user?.id || null,
      details: { countedQuantity: Number(cCountedQty), systemQuantity: sysQty },
    });

    const variance = Number(cCountedQty) - sysQty;
    setNotice(
      variance === 0
        ? `Count recorded for ${productById.get(cProductId)?.sku} - matches system quantity (${sysQty}).`
        : `Count recorded for ${productById.get(cProductId)?.sku} - variance of ${variance > 0 ? '+' : ''}${variance} vs system quantity (${sysQty}). Adjustment/approval workflow is a later phase - this count is logged for now.`
    );
    setCProductId('');
    setCWarehouseId('');
    setCCountedQty('');
    setCNotes('');
    fetchAll();
  };

  // ---- CSV upload ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvSaving, setCsvSaving] = useState(false);

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError('CSV file has no data rows.');
        return;
      }
      const header = parsed[0].map((h) => h.trim().toLowerCase());
      const skuIdx = header.findIndex((h) => h.includes('sku'));
      const whIdx = header.findIndex((h) => h.includes('warehouse'));
      const qtyIdx = header.findIndex((h) => h.includes('qty') || h.includes('quantity'));
      const notesIdx = header.findIndex((h) => h.includes('note'));

      if (skuIdx === -1 || whIdx === -1 || qtyIdx === -1) {
        setError('CSV header must include columns for SKU, Warehouse (code), and Counted Quantity.');
        return;
      }

      const rows: CsvRow[] = parsed.slice(1).map((r) => {
        const sku = (r[skuIdx] || '').trim();
        const warehouseCode = (r[whIdx] || '').trim();
        const countedQuantity = Number(r[qtyIdx]);
        const notes = notesIdx !== -1 ? (r[notesIdx] || '').trim() : '';

        const matchedProduct = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        const matchedWarehouse = warehouses.find((w) => w.code.toLowerCase() === warehouseCode.toLowerCase());

        let rowError: string | null = null;
        if (!matchedProduct) rowError = `SKU "${sku}" not found`;
        else if (!matchedWarehouse) rowError = `Warehouse code "${warehouseCode}" not found`;
        else if (Number.isNaN(countedQuantity)) rowError = 'Counted quantity is not a number';

        return {
          sku,
          warehouseCode,
          countedQuantity,
          notes,
          matchedProductId: matchedProduct?.id || null,
          matchedWarehouseId: matchedWarehouse?.id || null,
          systemQty: matchedProduct && matchedWarehouse ? systemQty(matchedProduct.id, matchedWarehouse.id) : null,
          error: rowError,
        };
      });

      setCsvRows(rows);
      setError('');
    };
    reader.readAsText(file);
  };

  const confirmCsvUpload = async () => {
    if (!tenantId || !csvRows) return;
    const validRows = csvRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      setError('No valid rows to upload.');
      return;
    }

    setCsvSaving(true);
    setError('');

    const uploadBatchId = crypto.randomUUID();

    for (const row of validRows) {
      await supabase.from('inventory_counts').insert({
        tenant_id: tenantId,
        product_id: row.matchedProductId,
        warehouse_id: row.matchedWarehouseId,
        counted_quantity: row.countedQuantity,
        system_quantity_at_count: row.systemQty ?? 0,
        counted_by: user?.id || null,
        notes: row.notes || null,
        upload_batch_id: uploadBatchId,
      });
    }

    await supabase.from('inventory_audit_log').insert({
      tenant_id: tenantId,
      event_type: 'COUNT_BATCH_UPLOADED',
      performed_by: user?.id || null,
      details: { uploadBatchId, rowCount: validRows.length },
    });

    setCsvSaving(false);
    setNotice(`Uploaded ${validRows.length} count(s) from file.`);
    setCsvRows(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchAll();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Inventory Counts - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <div className="print:hidden">
          <AppHeader title="Inventory Counts" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="print:hidden space-y-6">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
            {notice && (
              <div className="p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm flex justify-between">
                <span>{notice}</span>
                <button onClick={() => setNotice('')} className="text-green-700 hover:underline">
                  Dismiss
                </button>
              </div>
            )}

            {/* Worklist generator */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
                Count Worklist Generator
              </h2>
              <div className="flex flex-wrap gap-3 items-end mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse</label>
                  <select value={wlWarehouseId} onChange={(e) => setWlWarehouseId(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                    <option value="">Select...</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Criteria</label>
                  <select value={wlCriteria} onChange={(e) => setWlCriteria(e.target.value as typeof wlCriteria)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                    <option value="LOW_QTY">Quantity below threshold</option>
                    <option value="TOP_VALUE">Top N by dollar value</option>
                    <option value="OLDEST">Oldest landed batches</option>
                    <option value="RANDOM">Random sample</option>
                  </select>
                </div>
                {wlCriteria === 'LOW_QTY' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Threshold (qty below)</label>
                    <input type="number" value={wlThreshold} onChange={(e) => setWlThreshold(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-24" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">N</label>
                    <input type="number" value={wlCount} onChange={(e) => setWlCount(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-24" />
                  </div>
                )}
                <button onClick={generateWorklist} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                  Generate
                </button>
                {worklist && worklist.length > 0 && (
                  <button onClick={() => window.print()} className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">
                    Print This List
                  </button>
                )}
              </div>

              {worklist && (
                <div>
                  <p className="text-sm text-slate-600 mb-2">
                    {worklist.length} SKU{worklist.length === 1 ? '' : 's'} - {warehouseById.get(wlWarehouseId)?.name} - generated {worklistGeneratedAt}
                  </p>
                  {worklist.length === 0 ? (
                    <p className="text-sm text-slate-500">No SKUs match this criteria.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-1.5 pr-4">SKU</th>
                          <th className="py-1.5 pr-4">Title</th>
                          <th className="py-1.5 pr-4">System Qty</th>
                          <th className="py-1.5 pr-4">Value</th>
                          <th className="py-1.5 pr-4">Oldest Landed</th>
                          <th className="py-1.5 pr-4">Counted Qty (fill in)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {worklist.map((r) => (
                          <tr key={r.product.id}>
                            <td className="py-1.5 pr-4 font-medium">{r.product.sku}</td>
                            <td className="py-1.5 pr-4">{r.product.title}</td>
                            <td className="py-1.5 pr-4">{r.quantity}</td>
                            <td className="py-1.5 pr-4">{money(r.value)}</td>
                            <td className="py-1.5 pr-4">{r.oldestLandedDate || '—'}</td>
                            <td className="py-1.5 pr-4 border-b border-slate-300 w-24">&nbsp;</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Manual count entry */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Record a Count</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                  <select value={cProductId} onChange={(e) => setCProductId(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                    <option value="">Select...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} - {p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse</label>
                  <select value={cWarehouseId} onChange={(e) => setCWarehouseId(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                    <option value="">Select...</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
                {currentSystemQty != null && <p className="text-sm text-slate-500 pb-1.5">System qty: {currentSystemQty}</p>}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Counted Quantity</label>
                  <input type="number" value={cCountedQty} onChange={(e) => setCCountedQty(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-28" />
                </div>
                {currentVariance != null && (
                  <p className={`text-sm pb-1.5 font-medium ${currentVariance === 0 ? 'text-green-700' : 'text-orange-600'}`}>
                    Variance: {currentVariance > 0 ? '+' : ''}
                    {currentVariance}
                  </p>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                  <input type="text" value={cNotes} onChange={(e) => setCNotes(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
                </div>
                <button onClick={submitCount} disabled={cSaving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300">
                  Submit Count
                </button>
              </div>
            </div>

            {/* CSV upload */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Batch Upload (CSV)</h2>
              <p className="text-xs text-slate-500 mb-2">
                Columns: SKU, Warehouse (code), Counted Quantity, Notes (optional). Save your Excel worksheet as CSV
                before uploading.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="text-sm mb-3"
              />

              {csvRows && (
                <>
                  <table className="min-w-full text-sm mb-3">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-4">SKU</th>
                        <th className="py-1.5 pr-4">Warehouse</th>
                        <th className="py-1.5 pr-4">System Qty</th>
                        <th className="py-1.5 pr-4">Counted Qty</th>
                        <th className="py-1.5 pr-4">Variance</th>
                        <th className="py-1.5 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvRows.map((r, i) => (
                        <tr key={i} className={r.error ? 'bg-red-50' : ''}>
                          <td className="py-1 pr-4">{r.sku}</td>
                          <td className="py-1 pr-4">{r.warehouseCode}</td>
                          <td className="py-1 pr-4">{r.systemQty ?? '—'}</td>
                          <td className="py-1 pr-4">{r.countedQuantity}</td>
                          <td className="py-1 pr-4">{r.systemQty != null ? r.countedQuantity - r.systemQty : '—'}</td>
                          <td className="py-1 pr-4 text-sm">
                            {r.error ? <span className="text-red-600">{r.error}</span> : <span className="text-green-700">OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={confirmCsvUpload}
                    disabled={csvSaving || csvRows.every((r) => r.error)}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {csvSaving ? 'Uploading...' : `Confirm Upload (${csvRows.filter((r) => !r.error).length} valid rows)`}
                  </button>
                </>
              )}
            </div>

            {/* Recent counts */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Recent Counts</h2>
              {recentCounts.length === 0 ? (
                <p className="text-sm text-slate-500">No counts recorded yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-4">SKU</th>
                      <th className="py-1.5 pr-4">Warehouse</th>
                      <th className="py-1.5 pr-4">System Qty</th>
                      <th className="py-1.5 pr-4">Counted</th>
                      <th className="py-1.5 pr-4">Variance</th>
                      <th className="py-1.5 pr-4">Date</th>
                      <th className="py-1.5 pr-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentCounts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-1 pr-4 font-medium">{productById.get(c.product_id)?.sku || '—'}</td>
                        <td className="py-1 pr-4">{warehouseById.get(c.warehouse_id)?.name || '—'}</td>
                        <td className="py-1 pr-4">{c.system_quantity_at_count}</td>
                        <td className="py-1 pr-4">{c.counted_quantity}</td>
                        <td className={`py-1 pr-4 font-medium ${c.variance === 0 ? 'text-green-700' : 'text-orange-600'}`}>
                          {c.variance > 0 ? '+' : ''}
                          {c.variance}
                        </td>
                        <td className="py-1 pr-4">{new Date(c.counted_at).toLocaleString()}</td>
                        <td className="py-1 pr-4 text-slate-500">{c.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Print-only worklist header */}
          {worklist && (
            <div className="hidden print:block">
              <h1 className="text-lg font-bold mb-1">Count Worklist</h1>
              <p className="text-sm mb-4">
                Warehouse: {warehouseById.get(wlWarehouseId)?.name} - Generated: {worklistGeneratedAt}
              </p>
              <table className="min-w-full text-sm border border-slate-400">
                <thead>
                  <tr className="text-left border-b border-slate-400">
                    <th className="py-1 px-2 border-r border-slate-400">SKU</th>
                    <th className="py-1 px-2 border-r border-slate-400">Title</th>
                    <th className="py-1 px-2 border-r border-slate-400">System Qty</th>
                    <th className="py-1 px-2">Counted Qty (write in)</th>
                  </tr>
                </thead>
                <tbody>
                  {worklist.map((r) => (
                    <tr key={r.product.id} className="border-b border-slate-300">
                      <td className="py-2 px-2 border-r border-slate-300">{r.product.sku}</td>
                      <td className="py-2 px-2 border-r border-slate-300">{r.product.title}</td>
                      <td className="py-2 px-2 border-r border-slate-300">{r.quantity}</td>
                      <td className="py-2 px-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
