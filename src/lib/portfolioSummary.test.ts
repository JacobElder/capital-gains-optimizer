import { describe, expect, it } from 'vitest'
import {
  RISK_LEVELS, countByRisk, groupByTicker, isActionable, sortAnalyses, summarizeGroup,
  summarizeHarvesting, summarizePortfolio,
} from './portfolioSummary'
import type { PositionAnalysis, RiskLevel } from '../types'

let nextId = 0
/** A hand-built analysis: only the fields the summaries read matter. */
function lot(riskLevel: RiskLevel, o: Partial<PositionAnalysis> = {}, ticker = 'AAA'): PositionAnalysis {
  const id = `p${++nextId}`
  return {
    position: { id, ticker, name: ticker, shares: 1, costBasisPerShare: 1, purchaseDate: '2026-01-01', currentPrice: 1, createdAt: '', updatedAt: '' },
    totalCostBasis: 0, currentValue: 0, gainAmount: 0, gainPercent: 0,
    isLoss: riskLevel === 'loss', daysHeld: 0, isLongTerm: riskLevel === 'already-ltcg',
    daysUntilLongTerm: 100, longTermDate: '', holdingProgressPercent: 0,
    federalSTCGRate: 0, federalLTCGRate: 0, stateSTCGRate: 0, stateLTCGRate: 0,
    stcgCombinedRate: 0, ltcgCombinedRate: 0, niitApplies: false, nycRate: 0,
    stcgPreferred: riskLevel === 'stcg-preferred',
    taxIfSoldNowSTCG: 0, taxIfSoldAsLTCG: 0, taxSavingsFromWaiting: 0, netProceedsNow: 0,
    breakevenPrice: 0, dropCushionPercent: 0, probBelowBreakeven: 0, expectedGainFromWaiting: 0,
    expectedShortfall: 0, upsideDownsideRatio: 1, riskLevel, annualizedVol: 20, volIsOverride: false,
    ...o,
  }
}

describe('risk buckets', () => {
  it('lists every risk level once', () => {
    expect(new Set(RISK_LEVELS).size).toBe(RISK_LEVELS.length)
    expect(RISK_LEVELS).toHaveLength(7)
  })

  it('counts each lot exactly once, so shares add up to 100%', () => {
    // A long-term lot at a loss used to count as both "loss" and "LTCG"
    const ltLoss = lot('loss', { isLongTerm: true })
    const all = [lot('high'), lot('moderate'), lot('low'), lot('stcg-preferred'), ltLoss, lot('already-ltcg'), lot('invalid')]
    const counts = countByRisk(all)
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(all.length)
    expect(counts.loss).toBe(1)
    expect(counts['already-ltcg']).toBe(1)
    expect(counts['stcg-preferred']).toBe(1)
  })

  it('treats only high/moderate/low lots as actionable', () => {
    expect(RISK_LEVELS.filter(r => isActionable(lot(r)))).toEqual(['high', 'moderate', 'low'])
  })
})

describe('summarizePortfolio', () => {
  it('totals savings over actionable lots only', () => {
    const s = summarizePortfolio([
      lot('high', { taxSavingsFromWaiting: 300, probBelowBreakeven: 0.5, expectedShortfall: 40, currentValue: 1000, gainAmount: 200 }),
      lot('low', { taxSavingsFromWaiting: 100, probBelowBreakeven: 0.1, expectedShortfall: 10, currentValue: 500, gainAmount: 100 }),
      lot('stcg-preferred', { taxSavingsFromWaiting: -500, currentValue: 9000, gainAmount: 4000 }),
      lot('invalid', { currentValue: NaN, gainAmount: NaN }),
    ])
    expect(s.totalSavings).toBe(400)
    expect(s.weightedProbability).toBeCloseTo((0.5 * 300 + 0.9 * 100) / 400, 12)
    expect(s.expectedShortfall).toBe(50)
    // Invalid lots stay out of the dollar totals so one bad row cannot make them NaN
    expect(s.totalValue).toBe(10_500)
    expect(s.totalGain).toBe(4_300)
    expect(s.lotCount).toBe(4)
  })

  it('has no probability without savings', () => {
    const s = summarizePortfolio([lot('already-ltcg'), lot('loss', { gainAmount: -50 })])
    expect(s.totalSavings).toBe(0)
    expect(s.weightedProbability).toBeNull()
  })

  it('handles an empty portfolio', () => {
    const s = summarizePortfolio([])
    expect(s).toMatchObject({ lotCount: 0, totalValue: 0, totalSavings: 0, weightedProbability: null })
  })
})

describe('summarizeHarvesting', () => {
  const stGain = (gain: number, rate: number) => lot('high', { gainAmount: gain, stcgCombinedRate: rate, ltcgCombinedRate: rate / 2 })
  const ltGain = (gain: number, rate: number) => lot('already-ltcg', { gainAmount: gain, ltcgCombinedRate: rate, stcgCombinedRate: rate * 2 })
  const stLoss = (loss: number) => lot('loss', { gainAmount: -loss })
  const ltLoss = (loss: number) => lot('loss', { gainAmount: -loss, isLongTerm: true })

  it('nets losses against gains of their own kind first', () => {
    // ST loss 1,000 → ST gain; LT loss 3,000 → LT gain 2,000, then 1,000 crosses to ST gains
    const h = summarizeHarvesting([stGain(5_000, 0.4), ltGain(2_000, 0.2), stLoss(1_000), ltLoss(3_000)])
    expect(h.offsetShortTerm).toBe(2_000)
    expect(h.offsetLongTerm).toBe(2_000)
    expect(h.offset).toBe(4_000)
    expect(h.taxSaved).toEqual({ low: 2_000 * 0.4 + 2_000 * 0.2, high: 2_000 * 0.4 + 2_000 * 0.2 })
    expect(h.netGainAfterHarvesting).toBe(3_000)
  })

  it('never applies the short-term rate to long-term gains', () => {
    // Only long-term gains to offset: the old estimate used a 40% short-term rate here
    const h = summarizeHarvesting([ltGain(10_000, 0.2), stLoss(4_000)])
    expect(h.offsetLongTerm).toBe(4_000)
    expect(h.taxSaved.high).toBeCloseTo(800, 9)
  })

  it('reports a range when gaining lots have different rates', () => {
    const h = summarizeHarvesting([stGain(1_000, 0.3), stGain(1_000, 0.4), stLoss(500)])
    expect(h.taxSaved.low).toBeCloseTo(150, 9)
    expect(h.taxSaved.high).toBeCloseTo(200, 9)
  })

  it('caps the offset at the total gain', () => {
    const h = summarizeHarvesting([stGain(1_000, 0.3), stLoss(5_000)])
    expect(h.offset).toBe(1_000)
    expect(h.netGainAfterHarvesting).toBe(0)
    expect(h.totalLosses).toBe(5_000)
  })
})

describe('summarizeGroup', () => {
  it('excludes STCG-preferred lots from savings and from "next LTCG"', () => {
    const g = summarizeGroup([
      lot('stcg-preferred', { taxSavingsFromWaiting: -200, daysUntilLongTerm: 5 }),
      lot('moderate', { taxSavingsFromWaiting: 300, daysUntilLongTerm: 40 }),
      lot('high', { taxSavingsFromWaiting: 100, daysUntilLongTerm: 90 }),
    ])
    expect(g.totalSavings).toBe(400)
    expect(g.mostUrgent?.daysUntilLongTerm).toBe(40)
  })

  it('picks the most common risk, breaking ties by display order', () => {
    expect(summarizeGroup([lot('low'), lot('low'), lot('high')]).dominantRisk).toBe('low')
    expect(summarizeGroup([lot('low'), lot('high')]).dominantRisk).toBe('high')
    expect(summarizeGroup([]).dominantRisk).toBeNull()
  })

  it('has no urgent lot when nothing is waiting on an LTCG date', () => {
    expect(summarizeGroup([lot('already-ltcg'), lot('loss')]).mostUrgent).toBeNull()
  })
})

describe('sortAnalyses and groupByTicker', () => {
  const a = lot('low', { daysUntilLongTerm: 30, taxSavingsFromWaiting: 10, gainAmount: 500 }, 'AAA')
  const b = lot('high', { daysUntilLongTerm: 10, taxSavingsFromWaiting: 50, gainAmount: 100 }, 'BBB')
  const c = lot('already-ltcg', { daysUntilLongTerm: 0, gainAmount: 900 }, 'AAA')
  const d = lot('invalid', { daysUntilLongTerm: 0 }, 'CCC')
  const ids = (xs: PositionAnalysis[]) => xs.map(x => x.position.id)

  it('urgency: soonest first, long-term and invalid lots last', () => {
    expect(ids(sortAnalyses([c, d, a, b], 'urgency'))).toEqual(ids([b, a, c, d]))
  })
  it('risk, savings and gain orders', () => {
    expect(ids(sortAnalyses([a, b, c, d], 'risk'))).toEqual(ids([b, a, c, d]))
    expect(sortAnalyses([a, b], 'savings')[0]).toBe(b)
    expect(sortAnalyses([a, b, c], 'gain')[0]).toBe(c)
  })
  it('does not modify the input', () => {
    const input = [a, b]
    sortAnalyses(input, 'urgency')
    expect(input).toEqual([a, b])
  })
  it('groups by ticker and keeps the sort order', () => {
    const groups = groupByTicker(sortAnalyses([c, a, b], 'urgency'))
    expect([...groups.keys()]).toEqual(['BBB', 'AAA'])
    expect(ids(groups.get('AAA')!)).toEqual(ids([a, c]))
  })
})
