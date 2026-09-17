import { allocateFifo } from '../fifoAllocation';

describe('allocateFifo', () => {
  it('draws from the oldest (first) batch before newer ones', () => {
    const result = allocateFifo(
      [
        { id: 'old', costPerUnit: 10, availableQty: 5, original: 'old' },
        { id: 'new', costPerUnit: 20, availableQty: 5, original: 'new' },
      ],
      3
    );
    expect(result.lines).toEqual([{ batchId: 'old', quantity: 3, costPerUnit: 10, original: 'old' }]);
    expect(result.totalValue).toBe(30);
    expect(result.shortfall).toBe(0);
  });

  it('spills over into the next batch once the first is exhausted', () => {
    const result = allocateFifo(
      [
        { id: 'a', costPerUnit: 10, availableQty: 4, original: 'a' },
        { id: 'b', costPerUnit: 25, availableQty: 10, original: 'b' },
      ],
      6
    );
    expect(result.lines).toEqual([
      { batchId: 'a', quantity: 4, costPerUnit: 10, original: 'a' },
      { batchId: 'b', quantity: 2, costPerUnit: 25, original: 'b' },
    ]);
    // 4*10 + 2*25 = 90 - a real, hand-checkable FIFO cost, not just "some number"
    expect(result.totalValue).toBe(90);
    expect(result.shortfall).toBe(0);
  });

  it('reports a shortfall instead of allocating more than is on hand', () => {
    const result = allocateFifo([{ id: 'a', costPerUnit: 10, availableQty: 3, original: 'a' }], 10);
    expect(result.shortfall).toBe(7);
    expect(result.lines).toEqual([{ batchId: 'a', quantity: 3, costPerUnit: 10, original: 'a' }]);
    expect(result.totalValue).toBe(30);
  });

  it('skips batches with zero availability without erroring', () => {
    const result = allocateFifo(
      [
        { id: 'empty', costPerUnit: 10, availableQty: 0, original: 'empty' },
        { id: 'has-stock', costPerUnit: 15, availableQty: 5, original: 'has-stock' },
      ],
      2
    );
    expect(result.lines).toEqual([{ batchId: 'has-stock', quantity: 2, costPerUnit: 15, original: 'has-stock' }]);
  });

  it('returns nothing and full shortfall when there are no candidates', () => {
    const result = allocateFifo([], 5);
    expect(result.lines).toEqual([]);
    expect(result.shortfall).toBe(5);
    expect(result.totalValue).toBe(0);
  });

  it('needing zero allocates nothing', () => {
    const result = allocateFifo([{ id: 'a', costPerUnit: 10, availableQty: 5, original: 'a' }], 0);
    expect(result.lines).toEqual([]);
    expect(result.shortfall).toBe(0);
    expect(result.totalValue).toBe(0);
  });
});
