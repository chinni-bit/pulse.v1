'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  sku: string;
  title: string;
  cost: number | null;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  quantity_available: number;
  cost_per_unit: number | null;
  original_landed_date: string | null;
  status: string;
}

interface Location {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

interface Adjustment {
  id: string;
  product_id: string;
  warehouse_id: string;
  adjustment_type: 'LOSS' | 'GAIN';
  reason_code: string;
  quantity: number;
  unit_cost: number | null;
  total_value: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  source: string;
  notes: string | null;
  submitted_at: string;
  approved_at: string | null;
}

interface QcHold {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
  reason: string | null;
  status: 'HOLDING' | 'RELEASED' | 'WRITTEN_OFF';
  placed_at: string;
}

interface CountVariance {
  id: string;
  product_id: string;
  warehouse_id: string;
  counted_quantity: number;
  system_quantity_at_count: number;
  variance: number;
  counted_at: string;
}

const LOSS_REASONS = [
  { value: 'DAMAGED', label: 'Damaged / Broken' },
  { value: 'MISSING', label: 'Missing / Lost' },
  { value: 'RENDERED_FOR_PARTS', label: 'Rendered for Parts' },
  { value: 'COUNT_CORRECTION', label: 'Count Correction' },
  { value: 'OTHER', label: 'Other' },
];
const GAIN_REASONS = [
  { value: 'FOUND', label: 'Found / Recovered' },
  { value: 'COUNT_CORRECTION', label: 'Count Correction' },
  { value: 'OTHER', label: 'Other' },
];

const money = (n: number) => `$${n.toFixed(2)}`;

export default function InventoryAdjustments() {
  const { tenantId, user, role } = useAuthStore();
  const isAuthorized = role === 'admin' || role === 'super_admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [qcHolds, setQcHolds] = useState<QcHold[]>([]);
  const [countVariances, setCountVariances] = useState<CountVariance[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAll = async () => {
    if (!tenantId) return;
    setError('');

    const [
      { data: productsData },
      { data: warehousesData },
      { data: batchesData },
      { data: locationsData },
      { data: adjustmentsData },
      { data: qcData },
      { data: countsData },
    ] = await Promise.all([
      supabase.from('products').select('id, sku, title, cost').eq('tenant_id', tenantId).is('deleted_at', null).order('sku'),
      supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      supabase
        .from('inventory_batches')
        .select('id, product_id, batch_number, quantity_available, cost_per_unit, original_landed_date, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'RECEIVED'),
      supabase.from('batch_locations').select('id, batch_id, warehouse_id, quantity').eq('tenant_id', tenantId),
      supabase
        .from('inventory_adjustments')
        .select('id, product_id, warehouse_id, adjustment_type, reason_code, quantity, unit_cost, total_value, status, source, notes, submitted_at, approved_at')
        .eq('tenant_id', tenantId)
        .order('submitted_at', { ascending: false })
        .limit(100),
      supabase
        .from('inventory_qc_holds')
        .select('id, batch_id, warehouse_id, quantity, reason, status, placed_at')
        .eq('tenant_id', tenantId)
        .order('placed_at', { ascending: false }),
      supabase
        .from('inventory_counts')
        .select('id, product_id, warehouse_id, counted_quantity, system_quantity_at_count, variance, counted_at')
        .eq('tenant_id', tenantId)
        .neq('variance', 0)
        .is('resulting_adjustment_id', null)
        .order('counted_at', { ascending: false }),
    ]);

    setProducts(productsData || []);
    setWarehouses(warehousesData || []);
    setBatches(batchesData || []);
    setLocations(locationsData || []);
    setAdjustments((adjustmentsData as Adjustment[]) || []);
    setQcHolds((qcData as QcHold[]) || []);
    setCountVariances((countsData as CountVariance[]) || []);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const logAudit = async (eventType: string, fields: { productId?: string; warehouseId?: string; quantityDelta?: number; valueDelta?: number | null; details?: Record<string, unknown> }) => {
    if (!tenantId) return;
    await supabase.from('inventory_audit_log').insert({
      tenant_id: tenantId,
      event_type: eventType,
      product_id: fields.productId || null,
      warehouse_id: fields.warehouseId || null,
      quantity_delta: fields.quantityDelta ?? null,
      value_delta: fields.valueDelta ?? null,
      performed_by: user?.id || null,
      details: fields.details || null,
    });
  };

  const onHandAt = (batchId: string, warehouseId: string) => locations.find((l) => l.batch_id === batchId && l.warehouse_id === warehouseId)?.quantity || 0;

  const fifoBatchesFor = (productId: string, warehouseId: string) =>
    batches
      .filter((b) => b.product_id === productId && onHandAt(b.id, warehouseId) > 0)
      .sort((a, b) => (a.original_landed_date || '').localeCompare(b.original_landed_date || ''));

  const standardCostFor = (productId: string) => {
    const productBatches = batches
      .filter((b) => b.product_id === productId)
      .sort((a, b) => (b.original_landed_date || '').localeCompare(a.original_landed_date || ''));
    if (productBatches.length > 0 && productBatches[0].cost_per_unit != null) return Number(productBatches[0].cost_per_unit);
    return Number(productById.get(productId)?.cost || 0);
  };

  // ---- New adjustment form ----
  const [aType, setAType] = useState<'LOSS' | 'GAIN'>('LOSS');
  const [aProductId, setAProductId] = useState('');
  const [aWarehouseId, setAWarehouseId] = useState('');
  const [aReason, setAReason] = useState('DAMAGED');
  const [aQuantity, setAQuantity] = useState('');
  const [aUnitCost, setAUnitCost] = useState('');
  const [aNotes, setANotes] = useState('');
  const [aSourceCountId, setASourceCountId] = useState<string | null>(null);
  const [aSaving, setASaving] = useState(false);

  useEffect(() => {
    setAReason(aType === 'LOSS' ? 'DAMAGED' : 'FOUND');
  }, [aType]);

  useEffect(() => {
    if (aType === 'GAIN' && aProductId) setAUnitCost(String(standardCostFor(aProductId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aType, aProductId]);

  const lossPreview = useMemo(() => {
    if (aType !== 'LOSS' || !aProductId || !aWarehouseId || !aQuantity.trim()) return null;
    const needed = Number(aQuantity);
    if (needed <= 0) return null;
    const fifo = fifoBatchesFor(aProductId, aWarehouseId);
    const lines: { batch: Batch; quantity: number }[] = [];
    let remaining = needed;
    for (const b of fifo) {
      if (remaining <= 0) break;
      const avail = onHandAt(b.id, aWarehouseId);
      const take = Math.min(avail, remaining);
      if (take > 0) {
        lines.push({ batch: b, quantity: take });
        remaining -= take;
      }
    }
    const totalValue = lines.reduce((s, l) => s + l.quantity * Number(l.batch.cost_per_unit || 0), 0);
    return { lines, shortfall: remaining, totalValue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aType, aProductId, aWarehouseId, aQuantity, batches, locations]);

  const submitAdjustment = async () => {
    if (!tenantId || !aProductId || !aWarehouseId || !aQuantity.trim() || Number(aQuantity) <= 0) {
      setError('Product, warehouse, and a positive quantity are required.');
      return;
    }

    if (aType === 'LOSS') {
      if (!lossPreview || lossPreview.shortfall > 0) {
        setError(`Not enough on-hand stock at this warehouse to cover a loss of ${aQuantity} units.`);
        return;
      }
    } else if (!aUnitCost.trim() || Number(aUnitCost) < 0) {
      setError('A unit cost/value is required for a gain.');
      return;
    }

    setASaving(true);
    setError('');

    const quantity = Number(aQuantity);
    const unitCost = aType === 'GAIN' ? Number(aUnitCost) : null;
    const totalValue = aType === 'LOSS' ? lossPreview!.totalValue : Number(aUnitCost) * quantity;

    const { data: adj, error: adjError } = await supabase
      .from('inventory_adjustments')
      .insert({
        tenant_id: tenantId,
        product_id: aProductId,
        warehouse_id: aWarehouseId,
        adjustment_type: aType,
        reason_code: aReason,
        quantity,
        unit_cost: unitCost,
        total_value: totalValue,
        status: 'PENDING',
        source: aSourceCountId ? 'COUNT' : 'MANUAL',
        linked_count_id: aSourceCountId,
        notes: aNotes.trim() || null,
        submitted_by: user?.id || null,
      })
      .select('id')
      .single();

    if (adjError || !adj) {
      setError(adjError?.message || 'Failed to submit adjustment');
      setASaving(false);
      return;
    }

    if (aSourceCountId) {
      await supabase.from('inventory_counts').update({ resulting_adjustment_id: adj.id }).eq('id', aSourceCountId);
    }

    if (aType === 'LOSS' && lossPreview) {
      for (const line of lossPreview.lines) {
        await supabase.from('inventory_adjustment_lines').insert({
          tenant_id: tenantId,
          adjustment_id: adj.id,
          batch_id: line.batch.id,
          quantity: line.quantity,
          unit_cost: line.batch.cost_per_unit,
        });
      }
    }

    setASaving(false);
    setNotice(`Adjustment submitted for approval: ${aType === 'LOSS' ? '-' : '+'}${quantity} units of ${productById.get(aProductId)?.sku}.`);
    setAProductId('');
    setAWarehouseId('');
    setAQuantity('');
    setAUnitCost('');
    setANotes('');
    setASourceCountId(null);
    fetchAll();
  };

  // ---- Approve / reject ----
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});

  const approveAdjustment = async (adj: Adjustment) => {
    if (!tenantId || !isAuthorized) return;
    setError('');

    if (adj.adjustment_type === 'LOSS') {
      const { data: lines } = await supabase
        .from('inventory_adjustment_lines')
        .select('id, batch_id, quantity, unit_cost')
        .eq('adjustment_id', adj.id);

      for (const line of lines || []) {
        const loc = locations.find((l) => l.batch_id === line.batch_id && l.warehouse_id === adj.warehouse_id);
        if (!loc || loc.quantity < line.quantity) {
          setError(`Stock has changed since this was submitted - batch no longer has enough on hand. Ask the submitter to resubmit.`);
          return;
        }
      }

      for (const line of lines || []) {
        const loc = locations.find((l) => l.batch_id === line.batch_id && l.warehouse_id === adj.warehouse_id)!;
        await supabase.from('batch_locations').update({ quantity: loc.quantity - line.quantity }).eq('id', loc.id);
        const batch = batchById.get(line.batch_id);
        if (batch) {
          await supabase
            .from('inventory_batches')
            .update({ quantity_available: batch.quantity_available - line.quantity })
            .eq('id', line.batch_id);
        }
      }

      await supabase
        .from('inventory_adjustments')
        .update({ status: 'APPROVED', approved_by: user?.id || null, approved_at: new Date().toISOString(), approval_notes: approvalNotes[adj.id] || null })
        .eq('id', adj.id);

      await logAudit('ADJUSTMENT_APPROVED_LOSS', {
        productId: adj.product_id,
        warehouseId: adj.warehouse_id,
        quantityDelta: -adj.quantity,
        valueDelta: adj.total_value != null ? -Number(adj.total_value) : null,
        details: { reason: adj.reason_code },
      });
    } else {
      const { data: newBatch, error: batchError } = await supabase
        .from('inventory_batches')
        .insert({
          tenant_id: tenantId,
          product_id: adj.product_id,
          batch_number: `ADJ-GAIN-${Date.now()}`,
          quantity_received: adj.quantity,
          quantity_available: adj.quantity,
          cost_per_unit: adj.unit_cost,
          source: 'ADJUSTMENT_GAIN',
          status: 'RECEIVED',
          landed_cost_status: 'FINALIZED',
          original_landed_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (batchError || !newBatch) {
        setError(batchError?.message || 'Failed to create batch for gain');
        return;
      }

      await supabase.from('batch_locations').insert({ tenant_id: tenantId, batch_id: newBatch.id, warehouse_id: adj.warehouse_id, quantity: adj.quantity });

      await supabase
        .from('inventory_adjustments')
        .update({
          status: 'APPROVED',
          approved_by: user?.id || null,
          approved_at: new Date().toISOString(),
          approval_notes: approvalNotes[adj.id] || null,
          created_batch_id: newBatch.id,
        })
        .eq('id', adj.id);

      await logAudit('ADJUSTMENT_APPROVED_GAIN', {
        productId: adj.product_id,
        warehouseId: adj.warehouse_id,
        quantityDelta: adj.quantity,
        valueDelta: adj.total_value != null ? Number(adj.total_value) : null,
        details: { reason: adj.reason_code },
      });
    }

    setNotice('Adjustment approved and applied.');
    fetchAll();
  };

  const rejectAdjustment = async (adj: Adjustment) => {
    if (!tenantId || !isAuthorized) return;
    if (!window.confirm('Reject this adjustment? No inventory change will be made.')) return;

    await supabase
      .from('inventory_adjustments')
      .update({ status: 'REJECTED', approved_by: user?.id || null, approved_at: new Date().toISOString(), approval_notes: approvalNotes[adj.id] || null })
      .eq('id', adj.id);

    await logAudit('ADJUSTMENT_REJECTED', { productId: adj.product_id, warehouseId: adj.warehouse_id, details: { reason: adj.reason_code } });

    setNotice('Adjustment rejected.');
    fetchAll();
  };

  // ---- QC holds ----
  const [qProductId, setQProductId] = useState('');
  const [qWarehouseId, setQWarehouseId] = useState('');
  const [qBatchId, setQBatchId] = useState('');
  const [qQuantity, setQQuantity] = useState('');
  const [qReason, setQReason] = useState('');
  const [qSaving, setQSaving] = useState(false);

  const qcBatchOptions = useMemo(() => {
    if (!qProductId || !qWarehouseId) return [];
    return batches
      .filter((b) => b.product_id === qProductId)
      .map((b) => ({ batch: b, onHand: onHandAt(b.id, qWarehouseId) }))
      .filter((r) => r.onHand > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, locations, qProductId, qWarehouseId]);

  const placeQcHold = async () => {
    if (!tenantId || !qBatchId || !qQuantity.trim()) {
      setError('Batch and quantity are required.');
      return;
    }
    const selected = qcBatchOptions.find((r) => r.batch.id === qBatchId);
    const qty = Number(qQuantity);
    if (!selected || qty <= 0 || qty > selected.onHand) {
      setError(`Quantity must be between 1 and ${selected?.onHand || 0}.`);
      return;
    }

    setQSaving(true);
    setError('');

    const loc = locations.find((l) => l.batch_id === qBatchId && l.warehouse_id === qWarehouseId)!;
    await supabase.from('batch_locations').update({ quantity: loc.quantity - qty }).eq('id', loc.id);

    const batch = batchById.get(qBatchId);
    if (batch) {
      await supabase.from('inventory_batches').update({ quantity_available: batch.quantity_available - qty }).eq('id', qBatchId);
    }

    await supabase.from('inventory_qc_holds').insert({
      tenant_id: tenantId,
      batch_id: qBatchId,
      warehouse_id: qWarehouseId,
      quantity: qty,
      reason: qReason.trim() || null,
      placed_by: user?.id || null,
    });

    await logAudit('QC_HOLD_PLACED', { productId: qProductId, warehouseId: qWarehouseId, quantityDelta: -qty, details: { reason: qReason } });

    setQSaving(false);
    setNotice(`Placed ${qty} units of ${productById.get(qProductId)?.sku} on QC hold.`);
    setQProductId('');
    setQWarehouseId('');
    setQBatchId('');
    setQQuantity('');
    setQReason('');
    fetchAll();
  };

  const releaseQcHold = async (hold: QcHold) => {
    if (!tenantId || !isAuthorized) return;
    const loc = locations.find((l) => l.batch_id === hold.batch_id && l.warehouse_id === hold.warehouse_id);
    if (loc) {
      await supabase.from('batch_locations').update({ quantity: loc.quantity + hold.quantity }).eq('id', loc.id);
    } else {
      await supabase.from('batch_locations').insert({ tenant_id: tenantId, batch_id: hold.batch_id, warehouse_id: hold.warehouse_id, quantity: hold.quantity });
    }
    const batch = batchById.get(hold.batch_id);
    if (batch) {
      await supabase.from('inventory_batches').update({ quantity_available: batch.quantity_available + hold.quantity }).eq('id', hold.batch_id);
    }
    await supabase
      .from('inventory_qc_holds')
      .update({ status: 'RELEASED', resolved_by: user?.id || null, resolved_at: new Date().toISOString() })
      .eq('id', hold.id);

    await logAudit('QC_HOLD_RELEASED', { warehouseId: hold.warehouse_id, quantityDelta: hold.quantity, details: { batchId: hold.batch_id } });

    setNotice('QC hold released back to on-hand inventory.');
    fetchAll();
  };

  const writeOffQcHold = async (hold: QcHold) => {
    if (!tenantId || !isAuthorized) return;
    if (!window.confirm('Write off this QC hold as a loss? This cannot be undone.')) return;

    const batch = batchById.get(hold.batch_id);
    const unitCost = Number(batch?.cost_per_unit || 0);
    const totalValue = unitCost * hold.quantity;

    const { data: adj, error: adjError } = await supabase
      .from('inventory_adjustments')
      .insert({
        tenant_id: tenantId,
        product_id: batch?.product_id,
        warehouse_id: hold.warehouse_id,
        adjustment_type: 'LOSS',
        reason_code: 'QC_FAILED_WRITEOFF',
        quantity: hold.quantity,
        unit_cost: unitCost,
        total_value: totalValue,
        status: 'APPROVED',
        source: 'QC_RESOLUTION',
        linked_qc_hold_id: hold.id,
        submitted_by: user?.id || null,
        approved_by: user?.id || null,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (adjError || !adj) {
      setError(adjError?.message || 'Failed to record write-off');
      return;
    }

    await supabase.from('inventory_adjustment_lines').insert({
      tenant_id: tenantId,
      adjustment_id: adj.id,
      batch_id: hold.batch_id,
      quantity: hold.quantity,
      unit_cost: unitCost,
    });

    await supabase
      .from('inventory_qc_holds')
      .update({ status: 'WRITTEN_OFF', resolved_by: user?.id || null, resolved_at: new Date().toISOString() })
      .eq('id', hold.id);

    await logAudit('QC_HOLD_WRITTEN_OFF', { productId: batch?.product_id, warehouseId: hold.warehouse_id, quantityDelta: -hold.quantity, valueDelta: -totalValue, details: { batchId: hold.batch_id } });

    setNotice('QC hold written off as a loss.');
    fetchAll();
  };

  const pendingAdjustments = adjustments.filter((a) => a.status === 'PENDING');
  const historyAdjustments = adjustments.filter((a) => a.status !== 'PENDING');
  const activeHolds = qcHolds.filter((h) => h.status === 'HOLDING');

  return (
    <ProtectedRoute>
      <Head>
        <title>Inventory Adjustments - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Inventory Adjustments" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          {notice && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm flex justify-between">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-green-700 hover:underline">Dismiss</button>
            </div>
          )}
          {!isAuthorized && (
            <div className="p-3 bg-slate-100 border border-slate-200 rounded text-slate-600 text-sm">
              Your role ({role || 'unknown'}) can submit adjustments and place QC holds, but approving/rejecting
              adjustments and resolving QC holds requires an admin or super_admin role.
            </div>
          )}

          {countVariances.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
                Counts With an Unresolved Variance ({countVariances.length})
              </h2>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">Warehouse</th>
                    <th className="py-1.5 pr-4">System Qty</th>
                    <th className="py-1.5 pr-4">Counted</th>
                    <th className="py-1.5 pr-4">Variance</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countVariances.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1 pr-4 font-medium">{productById.get(c.product_id)?.sku || '—'}</td>
                      <td className="py-1 pr-4">{warehouseById.get(c.warehouse_id)?.name || '—'}</td>
                      <td className="py-1 pr-4">{c.system_quantity_at_count}</td>
                      <td className="py-1 pr-4">{c.counted_quantity}</td>
                      <td className={`py-1 pr-4 font-medium ${c.variance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {c.variance > 0 ? '+' : ''}
                        {c.variance}
                      </td>
                      <td className="py-1">
                        <button
                          onClick={() => {
                            setAType(c.variance < 0 ? 'LOSS' : 'GAIN');
                            setAProductId(c.product_id);
                            setAWarehouseId(c.warehouse_id);
                            setAQuantity(String(Math.abs(c.variance)));
                            setANotes(`From count on ${new Date(c.counted_at).toLocaleDateString()}`);
                            setASourceCountId(c.id);
                          }}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Prefill Adjustment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* New adjustment */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Submit Adjustment</h2>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={aType === 'LOSS'} onChange={() => setAType('LOSS')} /> Loss
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={aType === 'GAIN'} onChange={() => setAType('GAIN')} /> Gain
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                <select value={aProductId} onChange={(e) => setAProductId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
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
                <select value={aWarehouseId} onChange={(e) => setAWarehouseId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="">Select...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                <select value={aReason} onChange={(e) => setAReason(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
                  {(aType === 'LOSS' ? LOSS_REASONS : GAIN_REASONS).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                <input type="number" value={aQuantity} onChange={(e) => setAQuantity(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              {aType === 'GAIN' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit Cost / Value</label>
                  <input type="number" value={aUnitCost} onChange={(e) => setAUnitCost(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
                  <p className="text-xs text-slate-500 mt-1">Defaults to standard/last landed cost - editable.</p>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input type="text" value={aNotes} onChange={(e) => setANotes(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
            </div>

            {aType === 'LOSS' && lossPreview && (
              <div className="bg-slate-50 rounded p-3 mb-3 text-sm">
                <p className="font-medium mb-1">FIFO breakdown (oldest batches first):</p>
                {lossPreview.lines.length === 0 ? (
                  <p className="text-slate-500">No on-hand stock at this warehouse.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {lossPreview.lines.map((l) => (
                      <li key={l.batch.id}>
                        {l.quantity} units from {l.batch.batch_number} (landed {l.batch.original_landed_date || '—'}) @ {money(Number(l.batch.cost_per_unit || 0))}
                      </li>
                    ))}
                  </ul>
                )}
                {lossPreview.shortfall > 0 && (
                  <p className="text-red-600 mt-1">Short by {lossPreview.shortfall} units - not enough on-hand stock at this warehouse.</p>
                )}
                <p className="mt-1 font-medium">Total value: {money(lossPreview.totalValue)}</p>
              </div>
            )}

            <button onClick={submitAdjustment} disabled={aSaving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-300">
              {aSaving ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>

          {/* Pending approvals */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Pending Approval ({pendingAdjustments.length})</h2>
            {pendingAdjustments.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing pending.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Type</th>
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">Warehouse</th>
                    <th className="py-1.5 pr-4">Reason</th>
                    <th className="py-1.5 pr-4">Qty</th>
                    <th className="py-1.5 pr-4">Value</th>
                    <th className="py-1.5 pr-4">Submitted</th>
                    {isAuthorized && <th className="py-1.5"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingAdjustments.map((a) => (
                    <tr key={a.id}>
                      <td className={`py-1.5 pr-4 font-medium ${a.adjustment_type === 'LOSS' ? 'text-red-600' : 'text-green-700'}`}>{a.adjustment_type}</td>
                      <td className="py-1.5 pr-4">{productById.get(a.product_id)?.sku || '—'}</td>
                      <td className="py-1.5 pr-4">{warehouseById.get(a.warehouse_id)?.name || '—'}</td>
                      <td className="py-1.5 pr-4">{a.reason_code}</td>
                      <td className="py-1.5 pr-4">{a.quantity}</td>
                      <td className="py-1.5 pr-4">{a.total_value != null ? money(Number(a.total_value)) : '—'}</td>
                      <td className="py-1.5 pr-4">{new Date(a.submitted_at).toLocaleDateString()}</td>
                      {isAuthorized && (
                        <td className="py-1.5 space-x-2">
                          <button onClick={() => approveAdjustment(a)} className="text-green-700 hover:underline font-medium">Approve</button>
                          <button onClick={() => rejectAdjustment(a)} className="text-red-600 hover:underline font-medium">Reject</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* QC Holds */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Place QC Hold</h2>
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                <select value={qProductId} onChange={(e) => { setQProductId(e.target.value); setQBatchId(''); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
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
                <select value={qWarehouseId} onChange={(e) => { setQWarehouseId(e.target.value); setQBatchId(''); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="">Select...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Batch</label>
                <select value={qBatchId} onChange={(e) => setQBatchId(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" disabled={qcBatchOptions.length === 0}>
                  <option value="">{qcBatchOptions.length === 0 ? 'No stock here' : 'Select...'}</option>
                  {qcBatchOptions.map(({ batch, onHand }) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batch_number} ({onHand} on hand)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                <input type="number" value={qQuantity} onChange={(e) => setQQuantity(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-24" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                <input type="text" value={qReason} onChange={(e) => setQReason(e.target.value)} placeholder="e.g. suspected transit damage" className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <button onClick={placeQcHold} disabled={qSaving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300">
                Place Hold
              </button>
            </div>

            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Active Holds ({activeHolds.length})</h3>
            {activeHolds.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing on hold right now.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">Warehouse</th>
                    <th className="py-1.5 pr-4">Qty</th>
                    <th className="py-1.5 pr-4">Reason</th>
                    <th className="py-1.5 pr-4">Placed</th>
                    {isAuthorized && <th className="py-1.5"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeHolds.map((h) => {
                    const batch = batchById.get(h.batch_id);
                    return (
                      <tr key={h.id}>
                        <td className="py-1.5 pr-4 font-medium">{batch ? productById.get(batch.product_id)?.sku || '—' : '—'}</td>
                        <td className="py-1.5 pr-4">{warehouseById.get(h.warehouse_id)?.name || '—'}</td>
                        <td className="py-1.5 pr-4">{h.quantity}</td>
                        <td className="py-1.5 pr-4">{h.reason || '—'}</td>
                        <td className="py-1.5 pr-4">{new Date(h.placed_at).toLocaleDateString()}</td>
                        {isAuthorized && (
                          <td className="py-1.5 space-x-2">
                            <button onClick={() => releaseQcHold(h)} className="text-green-700 hover:underline font-medium">Release</button>
                            <button onClick={() => writeOffQcHold(h)} className="text-red-600 hover:underline font-medium">Write Off</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* History */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Adjustment History</h2>
            {historyAdjustments.length === 0 ? (
              <p className="text-sm text-slate-500">No decided adjustments yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Status</th>
                    <th className="py-1.5 pr-4">Type</th>
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">Warehouse</th>
                    <th className="py-1.5 pr-4">Reason</th>
                    <th className="py-1.5 pr-4">Qty</th>
                    <th className="py-1.5 pr-4">Value</th>
                    <th className="py-1.5 pr-4">Decided</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyAdjustments.map((a) => (
                    <tr key={a.id}>
                      <td className={`py-1 pr-4 font-medium ${a.status === 'APPROVED' ? 'text-green-700' : 'text-slate-400'}`}>{a.status}</td>
                      <td className={`py-1 pr-4 ${a.adjustment_type === 'LOSS' ? 'text-red-600' : 'text-green-700'}`}>{a.adjustment_type}</td>
                      <td className="py-1 pr-4">{productById.get(a.product_id)?.sku || '—'}</td>
                      <td className="py-1 pr-4">{warehouseById.get(a.warehouse_id)?.name || '—'}</td>
                      <td className="py-1 pr-4">{a.reason_code}</td>
                      <td className="py-1 pr-4">{a.quantity}</td>
                      <td className="py-1 pr-4">{a.total_value != null ? money(Number(a.total_value)) : '—'}</td>
                      <td className="py-1 pr-4">{a.approved_at ? new Date(a.approved_at).toLocaleDateString() : '—'}</td>
                    </tr>
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
