import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import {
  HIGH_RISK_RATIO, LOW_RISK_RATIO, afterTaxIfHeld, analyzePosition, effectiveVol, formatPercent, formatProb,
  formatRate, getRiskLevel, horizonSigma, isAnalyzable, longTermDate, normalCDF, probBelow, taxOnGain,
} from './taxEngine'
import { federalLTCGTax, federalSTCGTax, niitTax } from '../data/federalTaxBrackets'
import { stateTaxOnGain } from '../data/stateTaxData'
import type { Position, UserSettings } from '../types'

const settings: UserSettings = { filingStatus: 'single', annualTaxableIncome: 150_000, stateCode: 'TX', nycResident: false }

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'p', ticker: 'SPY', name: 'Test', shares: 100, costBasisPerShare: 100,
    purchaseDate: '2025-06-01', currentPrice: 150, createdAt: '', updatedAt: '',
    ...overrides,
  }
}

const d = (s: string) => new Date(`${s}T12:00:00`)
const fmt = (date: Date) => format(date, 'yyyy-MM-dd')

describe('holding period', () => {
  it('becomes long-term the day after the one-year anniversary', () => {
    expect(fmt(longTermDate('2025-01-15'))).toBe('2026-01-16')
    expect(fmt(longTermDate('2023-01-15'))).toBe('2024-01-16') // spans a leap day
    expect(fmt(longTermDate('2024-02-29'))).toBe('2025-03-01')
  })

  it('is not off by one in non-leap years', () => {
    const p = position({ purchaseDate: '2025-01-15' })
    expect(analyzePosition(p, settings, d('2026-01-15')).isLongTerm).toBe(false)
    expect(analyzePosition(p, settings, d('2026-01-15')).daysUntilLongTerm).toBe(1)
    expect(analyzePosition(p, settings, d('2026-01-16')).isLongTerm).toBe(true)
  })
})

describe('federal tax stacking', () => {
  it('spreads a short-term gain across ordinary brackets', () => {
    // 100k → 150k single: 5,700 @ 22% + 44,300 @ 24%
    expect(federalSTCGTax(100_000, 50_000, 'single')).toBeCloseTo(5_700 * 0.22 + 44_300 * 0.24, 6)
  })

  it('stacks long-term gains on top of ordinary income', () => {
    // 40k ordinary: first 9,450 of gain at 0%, rest at 15%
    expect(federalLTCGTax(40_000, 20_000, 'single')).toBeCloseTo(10_550 * 0.15, 6)
  })

  it('applies NIIT only to the portion above the threshold', () => {
    expect(niitTax(190_000, 30_000, 'single')).toBeCloseTo(20_000 * 0.038, 6)
    expect(niitTax(100_000, 30_000, 'single')).toBe(0)
  })

  it('charges nothing on losses', () => {
    expect(taxOnGain(-5_000, false, settings).total).toBe(0)
  })
})

describe('Washington', () => {
  it('only taxes long-term gains above the deduction', () => {
    expect(stateTaxOnGain('WA', 150_000, 100_000, 'single', true)).toBe(0)
    expect(stateTaxOnGain('WA', 150_000, 500_000, 'single', false)).toBe(0)
    expect(stateTaxOnGain('WA', 150_000, 500_000, 'single', true)).toBeCloseTo(0.07 * 222_000, 6)
  })

  it('does not flag ordinary-sized WA gains as STCG-preferred', () => {
    const a = analyzePosition(position(), { ...settings, stateCode: 'WA' }, d('2026-01-01'))
    expect(a.stcgPreferred).toBe(false)
  })
})

describe('2026 state rules', () => {
  it('does not tax capital gains in Missouri', () => {
    expect(stateTaxOnGain('MO', 150_000, 50_000, 'single', false)).toBe(0)
  })
  it('adds Maryland\'s 2% capital gains surtax above $350K', () => {
    const below = stateTaxOnGain('MD', 200_000, 100_000, 'single', true)
    const above = stateTaxOnGain('MD', 300_000, 100_000, 'single', true)
    expect(below).toBeCloseTo(50_000 * 0.055 + 50_000 * 0.0575, 6)
    expect(above).toBeCloseTo(100_000 * 0.0575 + 0.02 * 100_000, 6)
  })
  it('adds the Massachusetts 4% surtax only above the threshold', () => {
    expect(stateTaxOnGain('MA', 100_000, 50_000, 'single', true)).toBeCloseTo(2_500, 6)
    expect(stateTaxOnGain('MA', 1_050_000, 100_000, 'single', true)).toBeCloseTo(5_000 + 0.04 * 66_850, 6)
  })
})

describe('break-even', () => {
  const today = d('2026-01-01')

  it('equates after-tax proceeds of waiting and selling now', () => {
    const a = analyzePosition(position(), settings, today)
    const gainAtBreakeven = a.breakevenPrice * 100 - 10_000
    const netWait = a.breakevenPrice * 100 - taxOnGain(gainAtBreakeven, true, settings).total
    expect(netWait).toBeCloseTo(a.netProceedsNow, 4)
    expect(a.breakevenPrice).toBeLessThan(150)
    expect(a.breakevenPrice).toBeGreaterThan(100)
  })

  it('matches the closed-form formula when rates are flat', () => {
    // Small gain well inside one bracket in a no-tax state → constant rates
    const p = position({ shares: 10, costBasisPerShare: 100, currentPrice: 110 })
    const a = analyzePosition(p, settings, today)
    const s = 0.24, l = 0.15
    const netPerShare = 110 - 10 * s
    expect(a.breakevenPrice).toBeCloseTo((netPerShare - 100 * l) / (1 - l), 6)
  })

  it('expected gain from waiting is about the tax savings when the price cannot fall to basis', () => {
    const p = position({ shares: 10, costBasisPerShare: 10, currentPrice: 110, volatilityOverride: 15, purchaseDate: '2025-12-01' })
    const a = analyzePosition(p, settings, today)
    expect(a.expectedGainFromWaiting).toBeCloseTo(a.taxSavingsFromWaiting, 0)
    expect(a.expectedShortfall).toBeGreaterThan(0)
  })
})

describe('risk rating', () => {
  const today = d('2026-01-01')
  it('rates a big cushion on a calm stock as low risk', () => {
    const a = analyzePosition(position({ costBasisPerShare: 40, currentPrice: 150, volatilityOverride: 15, purchaseDate: '2025-11-01' }), settings, today)
    expect(a.riskLevel).toBe('low')
  })
  it('rates a thin gain on a volatile stock as high risk', () => {
    const a = analyzePosition(position({ costBasisPerShare: 140, currentPrice: 150, volatilityOverride: 70, purchaseDate: '2025-06-01' }), settings, today)
    expect(a.riskLevel).toBe('high')
  })
})

describe('probability model', () => {
  it('is a bit above 50% at-the-money for a driftless lognormal', () => {
    const p = probBelow(100, 100, 0.2)
    expect(p).toBeGreaterThan(0.5)
    expect(p).toBeLessThan(0.55)
  })

  it('rises with volatility for an out-of-the-money break-even', () => {
    expect(probBelow(100, 90, 0.4)).toBeGreaterThan(probBelow(100, 90, 0.1))
  })
})

describe('analyzePosition output fields', () => {
  const today = d('2026-01-01')
  // TX, single, $150K: a $5K gain is all in the 24% bracket short-term, 15% long-term, no NIIT
  const a = analyzePosition(position(), settings, today)

  it('reports gain, holding period and progress', () => {
    expect(a.totalCostBasis).toBe(10_000)
    expect(a.currentValue).toBe(15_000)
    expect(a.gainAmount).toBe(5_000)
    expect(a.gainPercent).toBeCloseTo(50, 9)
    expect(a.isLoss).toBe(false)
    expect(a.daysHeld).toBe(214)
    expect(a.longTermDate).toBe('2026-06-02')
    expect(a.daysUntilLongTerm).toBe(152)
    expect(a.holdingProgressPercent).toBeCloseTo((214 / 366) * 100, 9)
  })

  it('reports taxes and effective rates', () => {
    expect(a.taxIfSoldNowSTCG).toBeCloseTo(1_200, 6)
    expect(a.taxIfSoldAsLTCG).toBeCloseTo(750, 6)
    expect(a.taxSavingsFromWaiting).toBeCloseTo(450, 6)
    expect(a.federalSTCGRate).toBeCloseTo(0.24, 9)
    expect(a.federalLTCGRate).toBeCloseTo(0.15, 9)
    expect(a.stateSTCGRate).toBe(0)
    expect(a.stcgCombinedRate).toBeCloseTo(0.24, 9)
    expect(a.ltcgCombinedRate).toBeCloseTo(0.15, 9)
    expect(a.niitApplies).toBe(false)
    expect(a.stcgPreferred).toBe(false)
  })

  it('solves the break-even exactly in a flat-rate region', () => {
    // 100p − 0.15(100p − 10,000) = 15,000 − 1,200  →  p = 12,300 / 85
    expect(a.netProceedsNow).toBeCloseTo(13_800, 6)
    expect(a.breakevenPrice).toBeCloseTo(12_300 / 85, 6)
    expect(a.dropCushionPercent).toBeCloseTo(((150 - 12_300 / 85) / 150) * 100, 6)
    expect(afterTaxIfHeld(a.breakevenPrice, 100, 10_000, settings)).toBeCloseTo(a.netProceedsNow, 4)
  })

  it('includes NIIT and the 32% bracket when the gain crosses them', () => {
    const b = analyzePosition(position({ costBasisPerShare: 100, currentPrice: 300 }),
      { ...settings, annualTaxableIncome: 190_000 }, today)
    // 190K→201,775 at 24%, then 32%; NIIT on the 10K above $200K
    const federal = 11_775 * 0.24 + 8_225 * 0.32
    expect(b.federalSTCGRate).toBeCloseTo((federal + 380) / 20_000, 9)
    expect(b.niitApplies).toBe(true)
  })

  it('keeps the upside/downside ratio consistent with its parts', () => {
    const c = analyzePosition(position({ volatilityOverride: 40 }), settings, today)
    expect(c.expectedShortfall).toBeGreaterThan(0)
    // ratio = E[gain from waiting ⁺] / E[shortfall], and E[gain] = E[⁺] − E[shortfall]
    expect(c.upsideDownsideRatio * c.expectedShortfall - c.expectedShortfall).toBeCloseTo(c.expectedGainFromWaiting, 6)
    expect(c.probBelowBreakeven).toBeCloseTo(probBelow(150, c.breakevenPrice, horizonSigma(40, 152)), 9)
  })

  it('uses the volatility override, and the ticker estimate without one', () => {
    const calm = analyzePosition(position({ volatilityOverride: 15 }), settings, today)
    const wild = analyzePosition(position({ volatilityOverride: 70 }), settings, today)
    expect(calm.annualizedVol).toBe(15)
    expect(calm.volIsOverride).toBe(true)
    expect(wild.probBelowBreakeven).toBeGreaterThan(calm.probBelowBreakeven)
    expect(a.volIsOverride).toBe(false)
  })
})

describe('NYC tax', () => {
  const ny = { ...settings, stateCode: 'NY', nycResident: true }
  it('adds city tax for NYC residents at the top city rate on a $150K income', () => {
    expect(taxOnGain(10_000, false, ny).city).toBeCloseTo(387.6, 6)
    expect(taxOnGain(10_000, true, ny).city).toBeCloseTo(387.6, 6)
  })
  it('uses the joint city brackets', () => {
    expect(taxOnGain(10_000, false, { ...ny, filingStatus: 'mfj', annualTaxableIncome: 40_000 }).city)
      .toBeCloseTo(5_000 * 0.03762 + 5_000 * 0.03819, 6)
  })
  it('adds nothing outside New York, or for non-residents', () => {
    expect(taxOnGain(10_000, false, { ...ny, stateCode: 'CA' }).city).toBe(0)
    expect(taxOnGain(10_000, false, { ...ny, nycResident: false }).city).toBe(0)
  })
  it('includes city tax in the total', () => {
    const t = taxOnGain(10_000, false, ny)
    expect(t.total).toBeCloseTo(t.federal + t.niit + t.state + t.city, 9)
  })
})

describe('getRiskLevel', () => {
  it('uses exact thresholds', () => {
    expect(HIGH_RISK_RATIO).toBe(1.25)
    expect(LOW_RISK_RATIO).toBe(2)
    expect(getRiskLevel(1.2499, false, false, false)).toBe('high')
    expect(getRiskLevel(1.25, false, false, false)).toBe('moderate')
    expect(getRiskLevel(1.9999, false, false, false)).toBe('moderate')
    expect(getRiskLevel(2, false, false, false)).toBe('low')
    expect(getRiskLevel(Infinity, false, false, false)).toBe('low')
  })
  it('checks loss, then long-term, then STCG-preferred', () => {
    expect(getRiskLevel(0, true, true, true)).toBe('loss')
    expect(getRiskLevel(0, false, true, true)).toBe('already-ltcg')
    expect(getRiskLevel(0, false, false, true)).toBe('stcg-preferred')
  })
  it('labels lots end to end', () => {
    const today = d('2026-01-01')
    expect(analyzePosition(position({ currentPrice: 90 }), settings, today).riskLevel).toBe('loss')
    expect(analyzePosition(position({ purchaseDate: '2024-01-01' }), settings, today).riskLevel).toBe('already-ltcg')
    // A long-term lot at a loss is a loss, not long-term
    expect(analyzePosition(position({ purchaseDate: '2024-01-01', currentPrice: 90 }), settings, today).riskLevel).toBe('loss')
  })
})

describe('edge cases', () => {
  const today = d('2026-01-01')

  it('a zero-gain lot is not a loss and not STCG-preferred; waiting only adds risk', () => {
    expect(taxOnGain(0, false, settings)).toEqual({ federal: 0, niit: 0, state: 0, city: 0, total: 0 })
    const a = analyzePosition(position({ currentPrice: 100 }), settings, today)
    expect(a.isLoss).toBe(false)
    expect(a.stcgPreferred).toBe(false)
    expect(a.riskLevel).toBe('high')
  })

  it('a zero-cost lot reports an infinite gain percent', () => {
    expect(analyzePosition(position({ costBasisPerShare: 0 }), settings, today).gainPercent).toBe(Infinity)
  })

  it('marks lots that cannot be analyzed as invalid instead of low risk', () => {
    const bad: Array<Partial<Position>> = [
      { currentPrice: NaN }, { currentPrice: Infinity }, { shares: NaN }, { shares: 0 }, { shares: -5 },
      { costBasisPerShare: -1 }, { purchaseDate: 'garbage' }, { purchaseDate: '2026-02-30' }, { purchaseDate: '2026-06-01' },
    ]
    for (const o of bad) {
      expect(isAnalyzable(position(o), today)).toBe(false)
      const a = analyzePosition(position(o), settings, today)
      expect(a.riskLevel).toBe('invalid')
      expect(a.taxSavingsFromWaiting).toBe(0)
    }
    expect(isAnalyzable(position({ purchaseDate: '2026-01-01' }), today)).toBe(true) // bought today
  })
})

describe('probability helpers', () => {
  it('normalCDF matches reference values', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 7)
    expect(normalCDF(1)).toBeCloseTo(0.841345, 6)
    expect(normalCDF(-1.96)).toBeCloseTo(0.024998, 6)
  })
  it('probBelow matches the closed form, including at-the-money', () => {
    expect(probBelow(100, 100, 0.2)).toBeCloseTo(normalCDF(0.1), 9)
    expect(probBelow(100, 90, 0.3)).toBeCloseTo(normalCDF((Math.log(0.9) + 0.045) / 0.3), 9)
  })
  it('probBelow handles zero volatility and a zero break-even', () => {
    expect(probBelow(100, 90, 0)).toBe(0)
    expect(probBelow(100, 110, 0)).toBe(1)
    expect(probBelow(100, 0, 0.2)).toBe(0)
  })
  it('horizonSigma scales with calendar days over 365, with a one-day floor', () => {
    expect(horizonSigma(20, 365)).toBeCloseTo(0.2, 12)
    expect(horizonSigma(20, 365 / 4)).toBeCloseTo(0.1, 12)
    expect(horizonSigma(20, 0)).toBe(horizonSigma(20, 1))
  })
  it('effectiveVol prefers a positive override and reports unknown tickers', () => {
    expect(effectiveVol({ ticker: 'SPY', volatilityOverride: 33 })).toEqual({ vol: 33, isOverride: true, isKnown: true })
    expect(effectiveVol({ ticker: 'SPY', volatilityOverride: 0 }).isOverride).toBe(false)
    expect(effectiveVol({ ticker: 'SPY', volatilityOverride: -4 }).isOverride).toBe(false)
    expect(effectiveVol({ ticker: 'NOTAREALTICKER' })).toEqual({ vol: 22, isOverride: false, isKnown: false })
  })
})

describe('formatters', () => {
  it('formatProb clamps the tails and handles NaN', () => {
    expect(formatProb(0.005)).toBe('<1%')
    expect(formatProb(0.01)).toBe('1%')
    expect(formatProb(0.99)).toBe('99%')
    expect(formatProb(0.995)).toBe('>99%')
    expect(formatProb(NaN)).toBe('—')
  })
  it('formatPercent never prints -0.0%', () => {
    expect(formatPercent(12.34)).toBe('+12.3%')
    expect(formatPercent(-12.34)).toBe('-12.3%')
    expect(formatPercent(-0.04)).toBe('+0.0%')
    expect(formatPercent(NaN)).toBe('—')
    expect(formatPercent(Infinity)).toBe('+∞%')
  })
  it('formatRate', () => {
    expect(formatRate(0.2386)).toBe('23.9%')
    expect(formatRate(NaN)).toBe('—')
  })
})
