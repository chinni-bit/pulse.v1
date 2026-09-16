'use client';

import Head from 'next/head';
import { Fragment, useEffect, useMemo, useState } from 'react';
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
  quantity_received: number;
  quantity_available: number;
  cost_per_unit: number | null;
  original_landed_date: string | null;
  source: string | null;
  po_number: string | null;
  vendor_name: string | null;
  status: string;
  expected_warehouse_id: string | null;
  expected_arrival_date: string | null;
}

interface Location {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

interface Transfer {
  id: string;
  batch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  quantity: number;
  status: string;
  expected_arrival_date: string | null;
  notes: string | null;
  initiated_at: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryManagement() {
  const { tenantId, user, role } = useAuthStore();
  const isAuthorized = role === 'admin' || role === 'super_admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [{ data: productsData }, { data: warehousesData }, { data: batchesData }, { data: locationsData }, { data: transfersData }] =
      await Promise.all([
        supabase.from('products').select('id, sku, title, cost').eq('tenant_id', tenantId).is('deleted_at', null).order('sku'),
        supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
        supabase
          .from('inventory_batches')
          .select(
            'id, product_id, batch_number, quantity_received, quantity_available, cost_per_unit, original_landed_date, source, po_number, vendor_name, status, expected_warehouse_id, expected_arrival_date'
          )
          .eq('tenant_id', tenantId),
        supabase.from('batch_locations').select('id, batch_id, warehouse_id, quantity').eq('tenant_id', tenantId),
        supabase
          .from('inventory_transfers')
          .select('id, batch_id, from_warehouse_id, to_warehouse_id, quantity, status, expected_arrival_date, notes, initiated_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'IN_TRANSIT')
          .order('initiated_at', { ascending: false }),
      ]);

    setProducts(productsData || []);
    setWarehouses(warehousesData || []);
    setBatches(batchesData || []);
    setLocations(locationsData || []);
    setTransfers(transfersData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const logAudit = async (
    eventType: string,
    fields: {
      productId?: string;
      warehouseId?: string;
      quantityDelta?: number;
      valueDelta?: number | null;
      details?: Record<string, unknown>;
    }
  ) => {
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

  // ---- Receive new inventory ----
  const [receiveMode, setReceiveMode] = useState<'RECEIVE_NOW' | 'ON_WATER'>('RECEIVE_NOW');
  const [rProductId, setRProductId] = useState('');
  const [rQuantity, setRQuantity] = useState('');
  const [rCost, setRCost] = useState('');
  const [rBatchNumber, setRBatchNumber] = useState('');
  const [rPoNumber, setRPoNumber] = useState('');
  const [rVendor, setRVendor] = useState('');
  const [rWarehouseId, setRWarehouseId] = useState('');
  const [rLandedDate, setRLandedDate] = useState(today());
  const [rExpectedWarehouseId, setRExpectedWarehouseId] = useState('');
  const [rExpectedArrival, setRExpectedArrival] = useState('');
  const [rSaving, setRSaving] = useState(false);

  const onProductChange = (id: string) => {
    setRProductId(id);
    const p = productById.get(id);
    if (p && !rCost) setRCost(p.cost != null ? String(p.cost) : '');
  };

  const submitReceive = async () => {
    if (!tenantId || !rProductId || !rQuantity.trim() || Number(rQuantity) <= 0) {
      setError('Product and a positive quantity are required.');
      return;
    }
    setRSaving(true);
    setError('');

    const qty = Number(rQuantity);
    const cost = rCost.trim() ? Number(rCost) : null;
    const batchNumber = rBatchNumber.trim() || `BATCH-${Date.now()}`;

    const { data: newBatch, error: batchError } = await supabase
      .from('inventory_batches')
      .insert({
        tenant_id: tenantId,
        product_id: rProductId,
        batch_number: batchNumber,
        quantity_received: qty,
        quantity_available: qty,
        cost_per_unit: cost,
        po_number: rPoNumber.trim() || null,
        vendor_name: rVendor.trim() || null,
        source: 'PURCHASE',
        status: receiveMode === 'ON_WATER' ? 'ON_WATER' : 'RECEIVED',
        original_landed_date: receiveMode === 'RECEIVE_NOW' ? rLandedDate : null,
        expected_warehouse_id: receiveMode === 'ON_WATER' ? rExpectedWarehouseId || null : null,
        expected_arrival_date: receiveMode === 'ON_WATER' ? rExpectedArrival || null : null,
      })
      .select('id')
      .single();

    if (batchError || !newBatch) {
      setError(batchError?.message || 'Failed to create batch');
      setRSaving(false);
      return;
    }

    if (receiveMode === 'RECEIVE_NOW' && rWarehouseId) {
      const { error: locError } = await supabase
        .from('batch_locations')
        .insert({ tenant_id: tenantId, batch_id: newBatch.id, warehouse_id: rWarehouseId, quantity: qty });
      if (locError) {
        setError(locError.message);
        setRSaving(false);
        return;
      }
      await logAudit('BATCH_RECEIVED', {
        productId: rProductId,
        warehouseId: rWarehouseId,
        quantityDelta: qty,
        valueDelta: cost != null ? cost * qty : null,
        details: { batchNumber, poNumber: rPoNumber || null, vendor: rVendor || null },
      });
    } else if (receiveMode === 'RECEIVE_NOW') {
      await logAudit('BATCH_RECEIVED_UNASSIGNED', {
        productId: rProductId,
        quantityDelta: qty,
        valueDelta: cost != null ? cost * qty : null,
        details: { batchNumber, poNumber: rPoNumber || null, vendor: rVendor || null },
      });
    } else {
      await logAudit('BATCH_ON_WATER_CREATED', {
        productId: rProductId,
        quantityDelta: qty,
        valueDelta: cost != null ? cost * qty : null,
        details: { batchNumber, poNumber: rPoNumber || null, vendor: rVendor || null, expectedArrival: rExpectedArrival || null },
      });
    }

    setRSaving(false);
    setNotice(`${receiveMode === 'ON_WATER' ? 'Marked on the water' : 'Received'}: ${qty} units of ${productById.get(rProductId)?.sku || ''} (${batchNumber}).`);
    setRProductId('');
    setRQuantity('');
    setRCost('');
    setRBatchNumber('');
    setRPoNumber('');
    setRVendor('');
    setRWarehouseId('');
    setRExpectedWarehouseId('');
    setRExpectedArrival('');
    fetchAll();
  };

  // ---- Unassigned inventory ----
  const unassignedRows = useMemo(() => {
    return batches
      .filter((b) => b.status === 'RECEIVED')
      .map((b) => {
        const assigned = locations.filter((l) => l.batch_id === b.id).reduce((s, l) => s + l.quantity, 0);
        const unassigned = b.quantity_available - assigned;
        return { batch: b, unassigned };
      })
      .filter((r) => r.unassigned > 0);
  }, [batches, locations]);

  const [assigningBatchId, setAssigningBatchId] = useState<string | null>(null);
  const [assignWarehouseId, setAssignWarehouseId] = useState('');
  const [assignQty, setAssignQty] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const openAssign = (batchId: string, maxQty: number) => {
    setAssigningBatchId(batchId);
    setAssignWarehouseId('');
    setAssignQty(String(maxQty));
  };

  const submitAssign = async (batch: Batch, maxQty: number) => {
    if (!tenantId || !assignWarehouseId || !assignQty.trim()) return;
    const qty = Number(assignQty);
    if (qty <= 0 || qty > maxQty) {
      setError(`Quantity must be between 1 and ${maxQty}.`);
      return;
    }

    setAssignSaving(true);
    setError('');

    const existing = locations.find((l) => l.batch_id === batch.id && l.warehouse_id === assignWarehouseId);
    const opError = existing
      ? (await supabase.from('batch_locations').update({ quantity: existing.quantity + qty }).eq('id', existing.id)).error
      : (await supabase.from('batch_locations').insert({ tenant_id: tenantId, batch_id: batch.id, warehouse_id: assignWarehouseId, quantity: qty })).error;

    setAssignSaving(false);

    if (opError) {
      setError(opError.message);
      return;
    }

    await logAudit('BATCH_ASSIGNED', {
      productId: batch.product_id,
      warehouseId: assignWarehouseId,
      quantityDelta: qty,
      valueDelta: batch.cost_per_unit != null ? batch.cost_per_unit * qty : null,
      details: { batchNumber: batch.batch_number },
    });

    setNotice(`Assigned ${qty} units of ${productById.get(batch.product_id)?.sku || ''} to ${warehouseById.get(assignWarehouseId)?.name || ''}.`);
    setAssigningBatchId(null);
    fetchAll();
  };

  // ---- On the water ----
  const onWaterRows = useMemo(() => batches.filter((b) => b.status === 'ON_WATER' && b.quantity_available > 0), [batches]);

  const [receivingBatchId, setReceivingBatchId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('');
  const [receiveDate, setReceiveDate] = useState(today());
  const [receiveSaving, setReceiveSaving] = useState(false);

  const openReceiveOnWater = (batch: Batch) => {
    setReceivingBatchId(batch.id);
    setReceiveQty(String(batch.quantity_available));
    setReceiveWarehouseId(batch.expected_warehouse_id || '');
    setReceiveDate(today());
  };

  const submitReceiveOnWater = async (batch: Batch) => {
    if (!tenantId || !isAuthorized) return;
    const qty = Number(receiveQty);
    if (!receiveWarehouseId || qty <= 0 || qty > batch.quantity_available) {
      setError(`Quantity must be between 1 and ${batch.quantity_available}, and a warehouse is required.`);
      return;
    }

    setReceiveSaving(true);
    setError('');

    const { data: newBatch, error: newBatchError } = await supabase
      .from('inventory_batches')
      .insert({
        tenant_id: tenantId,
        product_id: batch.product_id,
        batch_number: `${batch.batch_number}-R${Date.now().toString().slice(-5)}`,
        quantity_received: qty,
        quantity_available: qty,
        cost_per_unit: batch.cost_per_unit,
        po_number: batch.po_number,
        vendor_name: batch.vendor_name,
        source: 'ON_WATER_RECEIPT',
        status: 'RECEIVED',
        original_landed_date: receiveDate,
      })
      .select('id')
      .single();

    if (newBatchError || !newBatch) {
      setError(newBatchError?.message || 'Failed to create received batch');
      setReceiveSaving(false);
      return;
    }

    const { error: locError } = await supabase
      .from('batch_locations')
      .insert({ tenant_id: tenantId, batch_id: newBatch.id, warehouse_id: receiveWarehouseId, quantity: qty });

    if (locError) {
      setError(locError.message);
      setReceiveSaving(false);
      return;
    }

    const { error: decError } = await supabase
      .from('inventory_batches')
      .update({ quantity_received: batch.quantity_received - qty, quantity_available: batch.quantity_available - qty })
      .eq('id', batch.id);

    setReceiveSaving(false);

    if (decError) {
      setError(decError.message);
      return;
    }

    await logAudit('ON_WATER_RECEIVED', {
      productId: batch.product_id,
      warehouseId: receiveWarehouseId,
      quantityDelta: qty,
      valueDelta: batch.cost_per_unit != null ? batch.cost_per_unit * qty : null,
      details: { fromBatch: batch.batch_number, poNumber: batch.po_number, vendor: batch.vendor_name },
    });

    setNotice(`Received ${qty} units of ${productById.get(batch.product_id)?.sku || ''} into ${warehouseById.get(receiveWarehouseId)?.name || ''}.`);
    setReceivingBatchId(null);
    fetchAll();
  };

  // ---- Transfers ----
  const [tProductId, setTProductId] = useState('');
  const [tFromWarehouseId, setTFromWarehouseId] = useState('');
  const [tBatchId, setTBatchId] = useState('');
  const [tQuantity, setTQuantity] = useState('');
  const [tToWarehouseId, setTToWarehouseId] = useState('');
  const [tExpectedArrival, setTExpectedArrival] = useState('');
  const [tNotes, setTNotes] = useState('');
  const [tSaving, setTSaving] = useState(false);

  const sourceBatchOptions = useMemo(() => {
    if (!tProductId || !tFromWarehouseId) return [];
    return batches
      .filter((b) => b.product_id === tProductId && b.status === 'RECEIVED')
      .map((b) => {
        const loc = locations.find((l) => l.batch_id === b.id && l.warehouse_id === tFromWarehouseId);
        return { batch: b, onHand: loc?.quantity || 0 };
      })
      .filter((r) => r.onHand > 0);
  }, [batches, locations, tProductId, tFromWarehouseId]);

  const submitTransfer = async () => {
    if (!tenantId || !tBatchId || !tToWarehouseId || !tQuantity.trim()) {
      setError('Batch, destination warehouse, and quantity are required.');
      return;
    }
    const selected = sourceBatchOptions.find((r) => r.batch.id === tBatchId);
    const qty = Number(tQuantity);
    if (!selected || qty <= 0 || qty > selected.onHand) {
      setError(`Quantity must be between 1 and ${selected?.onHand || 0}.`);
      return;
    }
    if (tFromWarehouseId === tToWarehouseId) {
      setError('Source and destination warehouse must be different.');
      return;
    }

    setTSaving(true);
    setError('');

    const loc = locations.find((l) => l.batch_id === tBatchId && l.warehouse_id === tFromWarehouseId)!;
    const { error: decError } = await supabase.from('batch_locations').update({ quantity: loc.quantity - qty }).eq('id', loc.id);
    if (decError) {
      setError(decError.message);
      setTSaving(false);
      return;
    }

    const { error: transferError } = await supabase.from('inventory_transfers').insert({
      tenant_id: tenantId,
      batch_id: tBatchId,
      from_warehouse_id: tFromWarehouseId,
      to_warehouse_id: tToWarehouseId,
      quantity: qty,
      status: 'IN_TRANSIT',
      expected_arrival_date: tExpectedArrival || null,
      notes: tNotes.trim() || null,
      initiated_by: user?.id || null,
    });

    setTSaving(false);

    if (transferError) {
      setError(transferError.message);
      return;
    }

    await logAudit('TRANSFER_INITIATED', {
      productId: tProductId,
      warehouseId: tFromWarehouseId,
      quantityDelta: -qty,
      details: { toWarehouseId: tToWarehouseId, batchNumber: selected.batch.batch_number },
    });

    setNotice(`Transfer initiated: ${qty} units of ${productById.get(tProductId)?.sku || ''} from ${warehouseById.get(tFromWarehouseId)?.name} to ${warehouseById.get(tToWarehouseId)?.name}.`);
    setTProductId('');
    setTFromWarehouseId('');
    setTBatchId('');
    setTQuantity('');
    setTToWarehouseId('');
    setTExpectedArrival('');
    setTNotes('');
    fetchAll();
  };

  const completeTransfer = async (transfer: Transfer) => {
    if (!tenantId) return;
    if (!window.confirm('Mark this transfer as received at the destination warehouse?')) return;

    const existing = locations.find((l) => l.batch_id === transfer.batch_id && l.warehouse_id === transfer.to_warehouse_id);
    const opError = existing
      ? (await supabase.from('batch_locations').update({ quantity: existing.quantity + transfer.quantity }).eq('id', existing.id)).error
      : (
          await supabase
            .from('batch_locations')
            .insert({ tenant_id: tenantId, batch_id: transfer.batch_id, warehouse_id: transfer.to_warehouse_id, quantity: transfer.quantity })
        ).error;

    if (opError) {
      setError(opError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from('inventory_transfers')
      .update({ status: 'COMPLETED', completed_by: user?.id || null, completed_at: new Date().toISOString() })
      .eq('id', transfer.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const batch = batches.find((b) => b.id === transfer.batch_id);
    await logAudit('TRANSFER_COMPLETED', {
      productId: batch?.product_id,
      warehouseId: transfer.to_warehouse_id,
      quantityDelta: transfer.quantity,
      details: { fromWarehouseId: transfer.from_warehouse_id },
    });

    setNotice('Transfer marked received.');
    fetchAll();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Inventory Management - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Inventory Management" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          {notice && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm flex justify-between">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-green-700 hover:underline">
                Dismiss
              </button>
            </div>
          )}
          {!isAuthorized && (
            <div className="p-3 bg-slate-100 border border-slate-200 rounded text-slate-600 text-sm">
              Your role ({role || 'unknown'}) can receive and assign inventory, but receiving On-the-Water shipments
              requires an admin or super_admin role.
            </div>
          )}

          {/* Receive New Inventory */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Receive New Inventory</h2>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={receiveMode === 'RECEIVE_NOW'} onChange={() => setReceiveMode('RECEIVE_NOW')} />
                Receive now (place in a warehouse)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={receiveMode === 'ON_WATER'} onChange={() => setReceiveMode('ON_WATER')} />
                On the water (not yet arrived)
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Product *</label>
                <select
                  value={rProductId}
                  onChange={(e) => onProductChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} - {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  value={rQuantity}
                  onChange={(e) => setRQuantity(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cost/Unit</label>
                <input
                  type="number"
                  value={rCost}
                  onChange={(e) => setRCost(e.target.value)}
                  placeholder="defaults to product cost"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Batch Number</label>
                <input
                  type="text"
                  value={rBatchNumber}
                  onChange={(e) => setRBatchNumber(e.target.value)}
                  placeholder="auto-generated if blank"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PO Number</label>
                <input
                  type="text"
                  value={rPoNumber}
                  onChange={(e) => setRPoNumber(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={rVendor}
                  onChange={(e) => setRVendor(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              {receiveMode === 'RECEIVE_NOW' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse (optional)</label>
                    <select
                      value={rWarehouseId}
                      onChange={(e) => setRWarehouseId(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                    >
                      <option value="">Leave unassigned</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Landed Date</label>
                    <input
                      type="date"
                      value={rLandedDate}
                      onChange={(e) => setRLandedDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Expected Warehouse</label>
                    <select
                      value={rExpectedWarehouseId}
                      onChange={(e) => setRExpectedWarehouseId(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                    >
                      <option value="">Unknown yet</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Expected Arrival Date</label>
                    <input
                      type="date"
                      value={rExpectedArrival}
                      onChange={(e) => setRExpectedArrival(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                    />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={submitReceive}
              disabled={rSaving}
              className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
            >
              {rSaving ? 'Saving...' : receiveMode === 'ON_WATER' ? 'Mark On the Water' : 'Receive Inventory'}
            </button>
          </div>

          {/* Unassigned Inventory */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              Unassigned Inventory ({unassignedRows.length})
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : unassignedRows.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing unassigned right now.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">Batch #</th>
                    <th className="py-1.5 pr-4">Unassigned Qty</th>
                    <th className="py-1.5 pr-4">Cost/Unit</th>
                    <th className="py-1.5 pr-4">Landed Date</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unassignedRows.map(({ batch, unassigned }) => (
                    <Fragment key={batch.id}>
                      <tr>
                        <td className="py-1.5 pr-4 font-medium">{productById.get(batch.product_id)?.sku || '—'}</td>
                        <td className="py-1.5 pr-4">{batch.batch_number}</td>
                        <td className="py-1.5 pr-4">{unassigned}</td>
                        <td className="py-1.5 pr-4">{money(Number(batch.cost_per_unit || 0))}</td>
                        <td className="py-1.5 pr-4">{batch.original_landed_date || '—'}</td>
                        <td className="py-1.5">
                          <button onClick={() => openAssign(batch.id, unassigned)} className="text-blue-600 hover:underline font-medium">
                            Assign
                          </button>
                        </td>
                      </tr>
                      {assigningBatchId === batch.id && (
                        <tr>
                          <td colSpan={6} className="py-2 bg-slate-50 px-3">
                            <div className="flex gap-2 items-end">
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Warehouse</label>
                                <select
                                  value={assignWarehouseId}
                                  onChange={(e) => setAssignWarehouseId(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded"
                                >
                                  <option value="">Select...</option>
                                  {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({w.code})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Quantity (max {unassigned})</label>
                                <input
                                  type="number"
                                  value={assignQty}
                                  onChange={(e) => setAssignQty(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded w-24"
                                />
                              </div>
                              <button
                                onClick={() => submitAssign(batch, unassigned)}
                                disabled={assignSaving}
                                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
                              >
                                Confirm
                              </button>
                              <button onClick={() => setAssigningBatchId(null)} className="px-3 py-1.5 text-sm text-slate-600">
                                Cancel
                              </button>
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

          {/* On the Water */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              On the Water ({onWaterRows.length})
            </h2>
            {onWaterRows.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing on the water right now.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">PO #</th>
                    <th className="py-1.5 pr-4">Vendor</th>
                    <th className="py-1.5 pr-4">Expected Warehouse</th>
                    <th className="py-1.5 pr-4">Expected Arrival</th>
                    <th className="py-1.5 pr-4">Qty Remaining</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {onWaterRows.map((batch) => (
                    <Fragment key={batch.id}>
                      <tr>
                        <td className="py-1.5 pr-4 font-medium">{productById.get(batch.product_id)?.sku || '—'}</td>
                        <td className="py-1.5 pr-4">{batch.po_number || '—'}</td>
                        <td className="py-1.5 pr-4">{batch.vendor_name || '—'}</td>
                        <td className="py-1.5 pr-4">
                          {batch.expected_warehouse_id ? warehouseById.get(batch.expected_warehouse_id)?.name || '—' : '—'}
                        </td>
                        <td className="py-1.5 pr-4">{batch.expected_arrival_date || '—'}</td>
                        <td className="py-1.5 pr-4">{batch.quantity_available}</td>
                        <td className="py-1.5">
                          {isAuthorized && (
                            <button onClick={() => openReceiveOnWater(batch)} className="text-blue-600 hover:underline font-medium">
                              Receive
                            </button>
                          )}
                        </td>
                      </tr>
                      {receivingBatchId === batch.id && (
                        <tr>
                          <td colSpan={7} className="py-2 bg-slate-50 px-3">
                            <div className="flex gap-2 items-end flex-wrap">
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Quantity (max {batch.quantity_available})</label>
                                <input
                                  type="number"
                                  value={receiveQty}
                                  onChange={(e) => setReceiveQty(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded w-24"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Destination Warehouse</label>
                                <select
                                  value={receiveWarehouseId}
                                  onChange={(e) => setReceiveWarehouseId(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded"
                                >
                                  <option value="">Select...</option>
                                  {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({w.code})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Landed Date</label>
                                <input
                                  type="date"
                                  value={receiveDate}
                                  onChange={(e) => setReceiveDate(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded"
                                />
                              </div>
                              <button
                                onClick={() => submitReceiveOnWater(batch)}
                                disabled={receiveSaving}
                                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
                              >
                                Confirm Receipt
                              </button>
                              <button onClick={() => setReceivingBatchId(null)} className="px-3 py-1.5 text-sm text-slate-600">
                                Cancel
                              </button>
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

          {/* Transfers */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Transfer Between Warehouses</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                <select
                  value={tProductId}
                  onChange={(e) => {
                    setTProductId(e.target.value);
                    setTBatchId('');
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                >
                  <option value="">Select...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} - {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">From Warehouse</label>
                <select
                  value={tFromWarehouseId}
                  onChange={(e) => {
                    setTFromWarehouseId(e.target.value);
                    setTBatchId('');
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                >
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
                <select
                  value={tBatchId}
                  onChange={(e) => setTBatchId(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                  disabled={sourceBatchOptions.length === 0}
                >
                  <option value="">{sourceBatchOptions.length === 0 ? 'No stock here' : 'Select...'}</option>
                  {sourceBatchOptions.map(({ batch, onHand }) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batch_number} ({onHand} on hand)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  value={tQuantity}
                  onChange={(e) => setTQuantity(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">To Warehouse</label>
                <select
                  value={tToWarehouseId}
                  onChange={(e) => setTToWarehouseId(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                >
                  <option value="">Select...</option>
                  {warehouses
                    .filter((w) => w.id !== tFromWarehouseId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expected Arrival</label>
                <input
                  type="date"
                  value={tExpectedArrival}
                  onChange={(e) => setTExpectedArrival(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={tNotes}
                  onChange={(e) => setTNotes(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>
            <button
              onClick={submitTransfer}
              disabled={tSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
            >
              {tSaving ? 'Saving...' : 'Initiate Transfer'}
            </button>

            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mt-6 mb-2">
              In Transit ({transfers.length})
            </h3>
            {transfers.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing in transit right now.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">SKU</th>
                    <th className="py-1.5 pr-4">From</th>
                    <th className="py-1.5 pr-4">To</th>
                    <th className="py-1.5 pr-4">Qty</th>
                    <th className="py-1.5 pr-4">Expected Arrival</th>
                    <th className="py-1.5 pr-4">Initiated</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((t) => {
                    const batch = batches.find((b) => b.id === t.batch_id);
                    return (
                      <tr key={t.id}>
                        <td className="py-1.5 pr-4 font-medium">{batch ? productById.get(batch.product_id)?.sku || '—' : '—'}</td>
                        <td className="py-1.5 pr-4">{warehouseById.get(t.from_warehouse_id)?.name || '—'}</td>
                        <td className="py-1.5 pr-4">{warehouseById.get(t.to_warehouse_id)?.name || '—'}</td>
                        <td className="py-1.5 pr-4">{t.quantity}</td>
                        <td className="py-1.5 pr-4">{t.expected_arrival_date || '—'}</td>
                        <td className="py-1.5 pr-4">{new Date(t.initiated_at).toLocaleDateString()}</td>
                        <td className="py-1.5">
                          <button onClick={() => completeTransfer(t)} className="text-blue-600 hover:underline font-medium">
                            Mark Received
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
