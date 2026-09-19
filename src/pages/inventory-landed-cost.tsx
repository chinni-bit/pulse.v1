'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Vendor {
  id: string;
  name: string;
  country: string | null;
  default_ocean_freight: number | null;
  default_drayage: number | null;
  default_unloading: number | null;
}

interface TariffRate {
  id: string;
  country: string;
  duty_rate_percent: number;
}

interface Settings {
  id: string;
  default_procurement_overhead_percent: number;
}

interface PendingBatch {
  id: string;
  product_id: string;
  batch_number: string;
  quantity_available: number;
  cost_per_unit: number | null;
  status: string;
  sku: string;
  title: string;
  country_of_origin: string | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
}

interface WorksheetLine {
  batch: PendingBatch;
  customsDutyRate: number;
  allocationWeight: number;
  customsDutyTotal: number;
  allocatedFreight: number;
  allocatedDrayage: number;
  allocatedUnloading: number;
  overheadTotal: number;
  landedCostTotal: number;
  landedCostPerUnit: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function InventoryLandedCost() {
  const { tenantId, user } = useAuthStore();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tariffs, setTariffs] = useState<TariffRate[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAll = async () => {
    if (!tenantId) return;
    setError('');

    const [{ data: vendorsData }, { data: tariffsData }, { data: settingsData }, { data: batchesData }] = await Promise.all([
      supabase
        .from('vendors_factories')
        .select('id, name, country, default_ocean_freight, default_drayage, default_unloading')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('country_tariff_rates').select('id, country, duty_rate_percent').eq('tenant_id', tenantId).order('country'),
      supabase.from('inventory_settings').select('id, default_procurement_overhead_percent').eq('tenant_id', tenantId).maybeSingle(),
      supabase
        .from('inventory_batches')
        .select(
          'id, product_id, batch_number, quantity_available, cost_per_unit, status, products(sku, title, country_of_origin_id, countries(name), carton_length, carton_width, carton_height)'
        )
        .eq('tenant_id', tenantId)
        .eq('landed_cost_status', 'PENDING')
        .gt('quantity_available', 0),
    ]);

    setVendors(vendorsData || []);
    setTariffs(tariffsData || []);
    setSettings(settingsData || null);

    const batches = (
      (batchesData as unknown as {
        id: string;
        product_id: string;
        batch_number: string;
        quantity_available: number;
        cost_per_unit: number | null;
        status: string;
        products: { sku: string; title: string; countries: { name: string } | null; carton_length: number | null; carton_width: number | null; carton_height: number | null } | null;
      }[]) || []
    ).map((b) => ({
      id: b.id,
      product_id: b.product_id,
      batch_number: b.batch_number,
      quantity_available: b.quantity_available,
      cost_per_unit: b.cost_per_unit,
      status: b.status,
      sku: b.products?.sku || '—',
      title: b.products?.title || '—',
      country_of_origin: b.products?.countries?.name || null,
      carton_length: b.products?.carton_length || null,
      carton_width: b.products?.carton_width || null,
      carton_height: b.products?.carton_height || null,
    }));
    setPendingBatches(batches);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const tariffByCountry = useMemo(() => new Map(tariffs.map((t) => [t.country.toLowerCase(), t.duty_rate_percent])), [tariffs]);

  // ---- Vendors/Factories management ----
  const [vName, setVName] = useState('');
  const [vCountry, setVCountry] = useState('');
  const [vFreight, setVFreight] = useState('');
  const [vDrayage, setVDrayage] = useState('');
  const [vUnloading, setVUnloading] = useState('');
  const [vSaving, setVSaving] = useState(false);

  const addVendor = async () => {
    if (!tenantId || !vName.trim()) return;
    setVSaving(true);
    const { error: err } = await supabase.from('vendors_factories').insert({
      tenant_id: tenantId,
      name: vName.trim(),
      country: vCountry.trim() || null,
      default_ocean_freight: vFreight.trim() ? Number(vFreight) : null,
      default_drayage: vDrayage.trim() ? Number(vDrayage) : null,
      default_unloading: vUnloading.trim() ? Number(vUnloading) : null,
    });
    setVSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setVName('');
    setVCountry('');
    setVFreight('');
    setVDrayage('');
    setVUnloading('');
    fetchAll();
  };

  // ---- Tariff rates management ----
  const [tCountry, setTCountry] = useState('');
  const [tRate, setTRate] = useState('');
  const [tSaving, setTSaving] = useState(false);

  const addTariff = async () => {
    if (!tenantId || !tCountry.trim() || !tRate.trim()) return;
    setTSaving(true);
    const { error: err } = await supabase
      .from('country_tariff_rates')
      .upsert(
        { tenant_id: tenantId, country: tCountry.trim(), duty_rate_percent: Number(tRate) },
        { onConflict: 'tenant_id,country' }
      );
    setTSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTCountry('');
    setTRate('');
    fetchAll();
  };

  // ---- Settings ----
  const [overheadDraft, setOverheadDraft] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    if (settings) setOverheadDraft(String(settings.default_procurement_overhead_percent));
  }, [settings]);

  const saveSettings = async () => {
    if (!tenantId || !overheadDraft.trim()) return;
    setSettingsSaving(true);
    const { error: err } = await supabase
      .from('inventory_settings')
      .upsert({ tenant_id: tenantId, default_procurement_overhead_percent: Number(overheadDraft) }, { onConflict: 'tenant_id' });
    setSettingsSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('Default procurement overhead updated.');
    fetchAll();
  };

  // ---- Worksheet builder ----
  const [wVendorId, setWVendorId] = useState('');
  const [wShipmentType, setWShipmentType] = useState<'IMPORT' | 'LOCAL'>('IMPORT');
  const [wReference, setWReference] = useState('');
  const [wSelectedBatchIds, setWSelectedBatchIds] = useState<Set<string>>(new Set());
  const [wAllocationMethod, setWAllocationMethod] = useState<'VOLUME' | 'VALUE'>('VALUE');
  const [wFreight, setWFreight] = useState('0');
  const [wDrayage, setWDrayage] = useState('0');
  const [wUnloading, setWUnloading] = useState('0');
  const [wOverheadPercent, setWOverheadPercent] = useState('10');
  const [wDutyOverrides, setWDutyOverrides] = useState<Record<string, string>>({});
  const [wSaving, setWSaving] = useState(false);

  useEffect(() => {
    if (settings) setWOverheadPercent(String(settings.default_procurement_overhead_percent));
  }, [settings]);

  const applyVendorDefaults = (vendorId: string) => {
    setWVendorId(vendorId);
    const v = vendors.find((x) => x.id === vendorId);
    if (v) {
      if (v.default_ocean_freight != null) setWFreight(String(v.default_ocean_freight));
      if (v.default_drayage != null) setWDrayage(String(v.default_drayage));
      if (v.default_unloading != null) setWUnloading(String(v.default_unloading));
    }
  };

  const toggleBatchSelection = (batchId: string) => {
    setWSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const selectedBatches = useMemo(
    () => pendingBatches.filter((b) => wSelectedBatchIds.has(b.id)),
    [pendingBatches, wSelectedBatchIds]
  );

  const computedLines: WorksheetLine[] = useMemo(() => {
    const freightTotal = Number(wFreight) || 0;
    const drayageTotal = Number(wDrayage) || 0;
    const unloadingTotal = Number(wUnloading) || 0;
    const overheadPct = Number(wOverheadPercent) || 0;

    const raw = selectedBatches.map((batch) => {
      const purchaseCost = Number(batch.cost_per_unit || 0);
      const purchaseCostTotal = purchaseCost * batch.quantity_available;
      const dutyRateOverride = wDutyOverrides[batch.id];
      const defaultRate = batch.country_of_origin ? tariffByCountry.get(batch.country_of_origin.toLowerCase()) : undefined;
      const dutyRate = dutyRateOverride != null && dutyRateOverride !== '' ? Number(dutyRateOverride) : defaultRate ?? 0;

      const hasCartonDims = batch.carton_length && batch.carton_width && batch.carton_height;
      const volumeWeight = hasCartonDims
        ? Number(batch.carton_length) * Number(batch.carton_width) * Number(batch.carton_height) * batch.quantity_available
        : purchaseCostTotal; // fall back to value weighting if carton dims are missing
      const weight = wAllocationMethod === 'VOLUME' ? volumeWeight : purchaseCostTotal;

      return { batch, purchaseCost, purchaseCostTotal, dutyRate, weight };
    });

    const totalWeight = raw.reduce((s, r) => s + r.weight, 0) || 1;

    return raw.map((r): WorksheetLine => {
      const share = r.weight / totalWeight;
      const customsDutyTotal = r.purchaseCostTotal * (r.dutyRate / 100);
      const allocatedFreight = freightTotal * share;
      const allocatedDrayage = drayageTotal * share;
      const allocatedUnloading = unloadingTotal * share;
      const overheadTotal = r.purchaseCostTotal * (overheadPct / 100);
      const landedCostTotal = r.purchaseCostTotal + customsDutyTotal + allocatedFreight + allocatedDrayage + allocatedUnloading + overheadTotal;
      const landedCostPerUnit = r.batch.quantity_available > 0 ? landedCostTotal / r.batch.quantity_available : 0;

      return {
        batch: r.batch,
        customsDutyRate: r.dutyRate,
        allocationWeight: r.weight,
        customsDutyTotal,
        allocatedFreight,
        allocatedDrayage,
        allocatedUnloading,
        overheadTotal,
        landedCostTotal,
        landedCostPerUnit,
      };
    });
  }, [selectedBatches, wFreight, wDrayage, wUnloading, wOverheadPercent, wAllocationMethod, wDutyOverrides, tariffByCountry]);

  const finalizeWorksheet = async () => {
    if (!tenantId || computedLines.length === 0) return;
    setWSaving(true);
    setError('');

    const { data: shipment, error: shipmentError } = await supabase
      .from('inventory_shipments')
      .insert({
        tenant_id: tenantId,
        vendor_id: wVendorId || null,
        reference: wReference.trim() || null,
        shipment_type: wShipmentType,
        status: 'CLOSED',
        created_by: user?.id || null,
      })
      .select('id')
      .single();

    if (shipmentError || !shipment) {
      setError(shipmentError?.message || 'Failed to create shipment');
      setWSaving(false);
      return;
    }

    const { data: worksheet, error: worksheetError } = await supabase
      .from('inventory_landed_cost_worksheets')
      .insert({
        tenant_id: tenantId,
        shipment_id: shipment.id,
        allocation_method: wAllocationMethod,
        ocean_freight_total: Number(wFreight) || 0,
        drayage_total: Number(wDrayage) || 0,
        unloading_total: Number(wUnloading) || 0,
        procurement_overhead_percent: Number(wOverheadPercent) || 0,
        status: 'FINALIZED',
        created_by: user?.id || null,
        finalized_by: user?.id || null,
        finalized_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (worksheetError || !worksheet) {
      setError(worksheetError?.message || 'Failed to create worksheet');
      setWSaving(false);
      return;
    }

    for (const line of computedLines) {
      const { error: lineError } = await supabase.from('inventory_landed_cost_worksheet_lines').insert({
        tenant_id: tenantId,
        worksheet_id: worksheet.id,
        batch_id: line.batch.id,
        quantity: line.batch.quantity_available,
        purchase_cost_per_unit: line.batch.cost_per_unit || 0,
        country_of_origin: line.batch.country_of_origin,
        customs_duty_rate_percent: line.customsDutyRate,
        customs_duty_total: line.customsDutyTotal,
        allocation_weight: line.allocationWeight,
        allocated_ocean_freight: line.allocatedFreight,
        allocated_drayage: line.allocatedDrayage,
        allocated_unloading: line.allocatedUnloading,
        procurement_overhead_total: line.overheadTotal,
        landed_cost_per_unit: line.landedCostPerUnit,
      });

      if (lineError) {
        setError(lineError.message);
        setWSaving(false);
        return;
      }

      await supabase
        .from('inventory_batches')
        .update({ cost_per_unit: line.landedCostPerUnit, landed_cost_status: 'FINALIZED', shipment_id: shipment.id })
        .eq('id', line.batch.id);

      await supabase.from('inventory_audit_log').insert({
        tenant_id: tenantId,
        event_type: 'LANDED_COST_FINALIZED',
        product_id: line.batch.product_id,
        quantity_delta: 0,
        value_delta: line.landedCostTotal - (line.batch.cost_per_unit || 0) * line.batch.quantity_available,
        performed_by: user?.id || null,
        details: { batchNumber: line.batch.batch_number, landedCostPerUnit: line.landedCostPerUnit },
      });
    }

    setWSaving(false);
    setNotice(`Landed cost finalized for ${computedLines.length} batch(es).`);
    setWSelectedBatchIds(new Set());
    setWVendorId('');
    setWReference('');
    setWFreight('0');
    setWDrayage('0');
    setWUnloading('0');
    setWDutyOverrides({});
    fetchAll();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Landed Cost - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Landed Cost" />

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

          {/* Settings */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              Default Procurement Overhead
            </h2>
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Overhead % (prefills new worksheets)</label>
                <input
                  type="number"
                  value={overheadDraft}
                  onChange={(e) => setOverheadDraft(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-slate-300 rounded w-32"
                />
              </div>
              <button
                onClick={saveSettings}
                disabled={settingsSaving}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
              >
                Save
              </button>
            </div>
          </div>

          {/* Vendors/Factories */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Vendors / Factories</h2>
            {vendors.length > 0 && (
              <table className="min-w-full text-sm mb-3">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Name</th>
                    <th className="py-1.5 pr-4">Country</th>
                    <th className="py-1.5 pr-4">Std. Ocean Freight</th>
                    <th className="py-1.5 pr-4">Std. Drayage</th>
                    <th className="py-1.5 pr-4">Std. Unloading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendors.map((v) => (
                    <tr key={v.id}>
                      <td className="py-1.5 pr-4 font-medium">{v.name}</td>
                      <td className="py-1.5 pr-4">{v.country || '—'}</td>
                      <td className="py-1.5 pr-4">{v.default_ocean_freight != null ? money(v.default_ocean_freight) : '—'}</td>
                      <td className="py-1.5 pr-4">{v.default_drayage != null ? money(v.default_drayage) : '—'}</td>
                      <td className="py-1.5 pr-4">{v.default_unloading != null ? money(v.default_unloading) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Name</label>
                <input type="text" value={vName} onChange={(e) => setVName(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Country</label>
                <input type="text" value={vCountry} onChange={(e) => setVCountry(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-28" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Std. Ocean Freight</label>
                <input type="number" value={vFreight} onChange={(e) => setVFreight(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-28" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Std. Drayage</label>
                <input type="number" value={vDrayage} onChange={(e) => setVDrayage(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-28" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Std. Unloading</label>
                <input type="number" value={vUnloading} onChange={(e) => setVUnloading(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-28" />
              </div>
              <button onClick={addVendor} disabled={vSaving || !vName.trim()} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300">
                + Add Vendor
              </button>
            </div>
          </div>

          {/* Tariff rates */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              Country Tariff / Customs Duty Rates
            </h2>
            {tariffs.length > 0 && (
              <table className="min-w-full text-sm mb-3">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Country</th>
                    <th className="py-1.5 pr-4">Duty Rate %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tariffs.map((t) => (
                    <tr key={t.id}>
                      <td className="py-1.5 pr-4">{t.country}</td>
                      <td className="py-1.5 pr-4">{t.duty_rate_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Country (matches Country of Origin)</label>
                <input type="text" value={tCountry} onChange={(e) => setTCountry(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-40" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Duty Rate %</label>
                <input type="number" value={tRate} onChange={(e) => setTRate(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded w-24" />
              </div>
              <button onClick={addTariff} disabled={tSaving || !tCountry.trim() || !tRate.trim()} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300">
                Save Rate
              </button>
            </div>
          </div>

          {/* Worksheet builder */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">New Landed Cost Worksheet</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Vendor / Factory</label>
                <select value={wVendorId} onChange={(e) => applyVendorDefaults(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="">None</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Shipment Type</label>
                <select value={wShipmentType} onChange={(e) => setWShipmentType(e.target.value as 'IMPORT' | 'LOCAL')} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="IMPORT">Import (factory - on water - warehouse)</option>
                  <option value="LOCAL">Local purchase (po - warehouse)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reference (PO# / Container#)</label>
                <input type="text" value={wReference} onChange={(e) => setWReference(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Allocation Method</label>
                <select value={wAllocationMethod} onChange={(e) => setWAllocationMethod(e.target.value as 'VOLUME' | 'VALUE')} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="VALUE">By value (purchase cost)</option>
                  <option value="VOLUME">By volume (carton size)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ocean Freight Total</label>
                <input type="number" value={wFreight} onChange={(e) => setWFreight(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Drayage Total</label>
                <input type="number" value={wDrayage} onChange={(e) => setWDrayage(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Unloading Total</label>
                <input type="number" value={wUnloading} onChange={(e) => setWUnloading(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Procurement Overhead %</label>
                <input type="number" value={wOverheadPercent} onChange={(e) => setWOverheadPercent(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
              </div>
            </div>

            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Select Pending Batches ({pendingBatches.length} available)
            </h3>
            {pendingBatches.length === 0 ? (
              <p className="text-sm text-slate-500 mb-4">No batches awaiting a landed cost calculation.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded mb-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-500">
                      <th className="py-1.5 px-2"></th>
                      <th className="py-1.5 px-2">SKU</th>
                      <th className="py-1.5 px-2">Batch #</th>
                      <th className="py-1.5 px-2">Qty</th>
                      <th className="py-1.5 px-2">Purchase Cost/Unit</th>
                      <th className="py-1.5 px-2">Country of Origin</th>
                      <th className="py-1.5 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingBatches.map((b) => (
                      <tr key={b.id}>
                        <td className="py-1 px-2">
                          <input type="checkbox" checked={wSelectedBatchIds.has(b.id)} onChange={() => toggleBatchSelection(b.id)} />
                        </td>
                        <td className="py-1 px-2 font-medium">{b.sku}</td>
                        <td className="py-1 px-2">{b.batch_number}</td>
                        <td className="py-1 px-2">{b.quantity_available}</td>
                        <td className="py-1 px-2">{money(Number(b.cost_per_unit || 0))}</td>
                        <td className="py-1 px-2">{b.country_of_origin || '—'}</td>
                        <td className="py-1 px-2">{b.status === 'ON_WATER' ? 'On the Water' : 'Received'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {computedLines.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Computed Landed Cost</h3>
                <table className="min-w-full text-sm mb-4">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-3">SKU</th>
                      <th className="py-1.5 pr-3">Purchase Cost</th>
                      <th className="py-1.5 pr-3">Duty %</th>
                      <th className="py-1.5 pr-3">Duty $</th>
                      <th className="py-1.5 pr-3">Freight</th>
                      <th className="py-1.5 pr-3">Drayage</th>
                      <th className="py-1.5 pr-3">Unloading</th>
                      <th className="py-1.5 pr-3">Overhead</th>
                      <th className="py-1.5 pr-3">Landed/Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {computedLines.map((line) => (
                      <tr key={line.batch.id}>
                        <td className="py-1.5 pr-3 font-medium">{line.batch.sku}</td>
                        <td className="py-1.5 pr-3">{money(Number(line.batch.cost_per_unit || 0))}</td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            value={wDutyOverrides[line.batch.id] ?? String(line.customsDutyRate)}
                            onChange={(e) => setWDutyOverrides((prev) => ({ ...prev, [line.batch.id]: e.target.value }))}
                            className="w-16 px-1 py-0.5 border border-slate-300 rounded"
                          />
                        </td>
                        <td className="py-1.5 pr-3">{money(line.customsDutyTotal)}</td>
                        <td className="py-1.5 pr-3">{money(line.allocatedFreight)}</td>
                        <td className="py-1.5 pr-3">{money(line.allocatedDrayage)}</td>
                        <td className="py-1.5 pr-3">{money(line.allocatedUnloading)}</td>
                        <td className="py-1.5 pr-3">{money(line.overheadTotal)}</td>
                        <td className="py-1.5 pr-3 font-semibold">{money(line.landedCostPerUnit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <button
              onClick={finalizeWorksheet}
              disabled={wSaving || computedLines.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
            >
              {wSaving ? 'Finalizing...' : 'Finalize & Apply Landed Cost'}
            </button>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
