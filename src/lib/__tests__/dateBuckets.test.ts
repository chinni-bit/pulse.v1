import { bucketKey, bucketLabel, presetRange, startOfDay, endOfDay } from '../dateBuckets';

describe('bucketKey', () => {
  it('does not merge two different local calendar days into one daily bucket', () => {
    // The real bug this guards against: toISOString()-based bucketing
    // converts to UTC and can merge genuinely different local days.
    const lateNight = new Date(2026, 8, 13, 23, 30); // Sep 13, 11:30pm local
    const nextMorning = new Date(2026, 8, 14, 0, 15); // Sep 14, 12:15am local
    expect(bucketKey(lateNight, 'DAILY')).toBe('2026-09-13');
    expect(bucketKey(nextMorning, 'DAILY')).toBe('2026-09-14');
    expect(bucketKey(lateNight, 'DAILY')).not.toBe(bucketKey(nextMorning, 'DAILY'));
  });

  it('buckets the same local day identically regardless of time of day', () => {
    const morning = new Date(2026, 8, 13, 6, 0);
    const evening = new Date(2026, 8, 13, 22, 0);
    expect(bucketKey(morning, 'DAILY')).toBe(bucketKey(evening, 'DAILY'));
  });

  it('buckets weekly to the Sunday that starts the week', () => {
    // Sep 16 2026 is a Wednesday; the week should start Sunday Sep 13.
    const wednesday = new Date(2026, 8, 16);
    expect(bucketKey(wednesday, 'WEEKLY')).toBe('2026-09-13');
  });

  it('buckets monthly to year-month regardless of day', () => {
    expect(bucketKey(new Date(2026, 8, 1), 'MONTHLY')).toBe('2026-09');
    expect(bucketKey(new Date(2026, 8, 30), 'MONTHLY')).toBe('2026-09');
  });

  it('pads single-digit months and days', () => {
    expect(bucketKey(new Date(2026, 0, 5), 'DAILY')).toBe('2026-01-05');
  });
});

describe('bucketLabel', () => {
  it('round-trips a daily key to a readable label without shifting the date', () => {
    const key = bucketKey(new Date(2026, 8, 13), 'DAILY');
    expect(bucketLabel(key, 'DAILY')).toContain('13');
  });

  it('labels a monthly key with the right month name', () => {
    expect(bucketLabel('2026-09', 'MONTHLY')).toMatch(/Sep/);
  });
});

describe('presetRange', () => {
  it('THIS_MONTH starts at the 1st of the current month and ends now', () => {
    const now = new Date(2026, 8, 16, 14, 30);
    const { from, to } = presetRange('THIS_MONTH', now);
    expect(from).toEqual(startOfDay(new Date(2026, 8, 1)));
    expect(to).toEqual(endOfDay(now));
  });

  it('ALL_TIME has no bounds', () => {
    expect(presetRange('ALL_TIME')).toEqual({ from: null, to: null });
  });

  it('TODAY spans the full current day', () => {
    const now = new Date(2026, 8, 16, 9, 0);
    const { from, to } = presetRange('TODAY', now);
    expect(from?.getHours()).toBe(0);
    expect(to?.getHours()).toBe(23);
  });
});
