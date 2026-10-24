import { describe, expect, it } from 'vitest'
import { buildPriceMap, estimateGrossValue, groupByMonth, upcomingVests } from './vesting'
import type { FutureVestLot, Position } from '../types'

const vest = (vestDate: string, sharesGross: number, ticker = 'GOOG', awardId = 'A1'): FutureVestLot => ({
  id: `${ticker}-${vestDate}`, ticker, name: ticker, awardId, awardDate: '2025-01-01', vestDate, sharesGross,
})
const pos = (ticker: string, currentPrice: number): Position => ({
  id: ticker, ticker, name: ticker, shares: 1, costBasisPerShare: 1, purchaseDate: '2026-01-01', currentPrice, createdAt: '', updatedAt: '',
})

describe('upcomingVests', () => {
  it('drops vests on or before today and sorts the rest', () => {
    const out = upcomingVests([vest('2026-12-25', 1), vest('2026-09-25', 1), vest('2026-10-24', 1), vest('2026-11-25', 1)], '2026-10-24')
    expect(out.map(v => v.vestDate)).toEqual(['2026-11-25', '2026-12-25'])
  })
})

describe('groupByMonth', () => {
  it('sums shares and collects award ids per month, in month order', () => {
    const months = groupByMonth([vest('2026-12-25', 5, 'GOOG', 'B'), vest('2026-11-05', 10), vest('2026-11-25', 20, 'GOOG', 'B')])
    expect(months.map(m => [m.monthKey, m.monthLabel, m.sharesGross, m.awardIds])).toEqual([
      ['2026-11', 'November 2026', 30, ['A1', 'B']],
      ['2026-12', 'December 2026', 5, ['B']],
    ])
  })
})

describe('buildPriceMap', () => {
  it('takes the first valid price per ticker', () => {
    expect(buildPriceMap([pos('AAPL', 0), pos('AAPL', 200), pos('AAPL', 210)])).toEqual({ AAPL: 200 })
  })
  it('prices GOOG vests from a GOOGL holding and the reverse', () => {
    expect(buildPriceMap([pos('GOOGL', 300)])).toEqual({ GOOGL: 300, GOOG: 300 })
    expect(buildPriceMap([pos('GOOG', 301), pos('GOOGL', 300)])).toEqual({ GOOG: 301, GOOGL: 300 })
  })
})

describe('estimateGrossValue', () => {
  it('values vests with a known price and skips the rest', () => {
    expect(estimateGrossValue([vest('2026-11-25', 10), vest('2026-11-25', 4, 'XYZ')], { GOOG: 300 })).toBe(3000)
  })
})
