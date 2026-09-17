// Pure FIFO allocation - given a list of candidate batches (already sorted
// oldest-first by the caller, since "oldest" depends on a field this
// function doesn't need to know about) and a quantity needed, figures out
// which batches to draw from and at what cost.
//
// Extracted from inventory-adjustments.tsx's loss-preview calculation
// during the item-6 hardening pass so the actual money math (this is what
// a Loss adjustment charges against inventory value) is unit-tested
// instead of only ever having been exercised through the UI.

export interface FifoCandidateBatch<T = unknown> {
  id: string;
  costPerUnit: number;
  availableQty: number;
  original: T;
}

export interface FifoLine<T = unknown> {
  batchId: string;
  quantity: number;
  costPerUnit: number;
  original: T;
}

export interface FifoAllocationResult<T = unknown> {
  lines: FifoLine<T>[];
  shortfall: number;
  totalValue: number;
}

export function allocateFifo<T = unknown>(
  candidates: FifoCandidateBatch<T>[],
  neededQuantity: number
): FifoAllocationResult<T> {
  const lines: FifoLine<T>[] = [];
  let remaining = neededQuantity;

  for (const batch of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(batch.availableQty, remaining);
    if (take > 0) {
      lines.push({ batchId: batch.id, quantity: take, costPerUnit: batch.costPerUnit, original: batch.original });
      remaining -= take;
    }
  }

  const totalValue = lines.reduce((sum, line) => sum + line.quantity * line.costPerUnit, 0);
  return { lines, shortfall: remaining, totalValue };
}
