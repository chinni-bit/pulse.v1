// Shared date-bucketing logic for the Analytics suite (Sales, Channel,
// Product, Inventory, Loss/Gain Trends pages) and the mobile dashboard.
//
// Extracted from five near-identical copies during the item-6 hardening
// pass so this only needs to be right - and tested - in one place. The
// local-date approach (not toISOString/UTC) is deliberate: the database
// stores timezone-naive timestamps, so UTC-based bucketing can silently
// merge two genuinely different local-calendar-day orders into one bucket
// (found and fixed for real on the Sales Analytics page - see
// docs/CHANGELOG.md, "Analytics suite, page 1 of 5").

export type Granularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type DatePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'ALL_TIME' | 'CUSTOM';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  THIS_YEAR: 'This Year',
  ALL_TIME: 'All Time',
  CUSTOM: 'Custom Range',
};

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function presetRange(preset: DatePreset, now: Date = new Date()): { from: Date | null; to: Date | null } {
  switch (preset) {
    case 'TODAY':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'THIS_WEEK': {
      const from = new Date(now);
      from.setDate(from.getDate() - from.getDay());
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'THIS_MONTH':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'THIS_YEAR':
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    case 'ALL_TIME':
      return { from: null, to: null };
    case 'CUSTOM':
      return { from: null, to: null };
  }
}

/**
 * Builds a bucket key from LOCAL date components, never UTC
 * (Date.toISOString() etc.) - see file header for why that matters here.
 */
export function bucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (granularity === 'DAILY') return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (granularity === 'WEEKLY') {
    const weekStart = new Date(y, m, d - date.getDay());
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'MONTHLY') {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (granularity === 'WEEKLY') return `Wk of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
