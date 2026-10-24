import { describe, expect, it } from 'vitest'
import { federalLTCGTax, federalSTCGTax, niitTax, taxOnSlice } from './federalTaxBrackets'
import { STATE_TAX_DATA, stateTaxOnGain } from './stateTaxData'
import { DEFAULT_VOL, getTickerVol, isVolKnown } from './tickerVolatility'
import type { FilingStatus } from '../types'

// Independent copy of the 2026 IRS figures (Rev. Proc. 2025-32). The code's
// tables are checked against these, so a typo in either one fails a test.
const ORDINARY_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35]
const ORDINARY_TOPS: Record<FilingStatus, number[]> = {
  single: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600],
  mfj: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
  mfs: [12_400, 50_400, 105_700, 201_775, 256_225, 384_350],
  hoh: [17_700, 67_450, 105_700, 201_750, 256_200, 640_600],
}
const LTCG_TOPS: Record<FilingStatus, number[]> = {
  single: [49_450, 545_500],
  mfj: [98_900, 613_700],
  mfs: [49_450, 306_850],
  hoh: [66_200, 579_600],
}
const NIIT_THRESHOLD: Record<FilingStatus, number> = { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 }
const STATUSES: FilingStatus[] = ['single', 'mfj', 'mfs', 'hoh']

/** Cumulative tax from $0 to `income` under (tops, rates, topRate), computed by hand. */
function cumulative(income: number, tops: number[], rates: number[], topRate: number): number {
  let tax = 0, lower = 0
  for (let i = 0; i < tops.length; i++) {
    if (income <= lower) break
    tax += (Math.min(income, tops[i]) - lower) * rates[i]
    lower = tops[i]
  }
  if (income > lower) tax += (income - lower) * topRate
  return tax
}

describe('federal ordinary brackets (short-term gains)', () => {
  for (const status of STATUSES) {
    it(`matches the IRS schedule at every bracket edge (${status})`, () => {
      const tops = ORDINARY_TOPS[status]
      for (const t of [...tops, 1_000_000]) {
        expect(federalSTCGTax(0, t, status)).toBeCloseTo(cumulative(t, tops, ORDINARY_RATES, 0.37), 6)
      }
      // The dollar just above each edge is taxed at the next bracket's rate
      const next = [...ORDINARY_RATES.slice(1), 0.37]
      tops.forEach((t, i) => {
        expect(federalSTCGTax(t, 1, status)).toBeCloseTo(next[i], 9)
        expect(federalSTCGTax(t - 1, 1, status)).toBeCloseTo(ORDINARY_RATES[i], 9)
      })
    })
  }

  it('stacks the gain on top of other income', () => {
    expect(federalSTCGTax(100_000, 10_000, 'single')).toBeCloseTo(5_700 * 0.22 + 4_300 * 0.24, 6)
  })

  it('charges nothing on zero or negative gains', () => {
    expect(federalSTCGTax(100_000, 0, 'single')).toBe(0)
    expect(federalSTCGTax(100_000, -5, 'single')).toBe(0)
  })
})

describe('federal long-term brackets', () => {
  for (const status of STATUSES) {
    it(`uses 0/15/20% with the IRS thresholds (${status})`, () => {
      const [zeroTop, fifteenTop] = LTCG_TOPS[status]
      expect(federalLTCGTax(0, zeroTop, status)).toBe(0)
      expect(federalLTCGTax(zeroTop, 1, status)).toBeCloseTo(0.15, 9)
      expect(federalLTCGTax(fifteenTop - 1, 1, status)).toBeCloseTo(0.15, 9)
      expect(federalLTCGTax(fifteenTop, 1, status)).toBeCloseTo(0.20, 9)
      expect(federalLTCGTax(0, 2_000_000, status)).toBeCloseTo(
        cumulative(2_000_000, [zeroTop, fifteenTop], [0, 0.15], 0.20), 6)
    })
  }
})

describe('NIIT', () => {
  for (const status of STATUSES) {
    const t = NIIT_THRESHOLD[status]
    it(`applies 3.8% only above $${t.toLocaleString()} (${status})`, () => {
      expect(niitTax(t - 1_000, 1_000, status)).toBe(0)
      expect(niitTax(t - 1_000, 3_000, status)).toBeCloseTo(0.038 * 2_000, 9)
      // Income already above the threshold: the whole gain is subject, not the whole excess
      expect(niitTax(t + 50_000, 1_000, status)).toBeCloseTo(38, 9)
    })
  }
})

describe('taxOnSlice', () => {
  const brackets = [{ upTo: 10, rate: 0.1 }, { upTo: Infinity, rate: 0.5 }]
  it('integrates a slice across brackets', () => {
    expect(taxOnSlice(5, 15, brackets)).toBeCloseTo(5 * 0.1 + 5 * 0.5, 9)
    expect(taxOnSlice(10, 11, brackets)).toBeCloseTo(0.5, 9)
  })
  it('is zero for an empty or reversed slice', () => {
    expect(taxOnSlice(10, 10, brackets)).toBe(0)
    expect(taxOnSlice(20, 10, brackets)).toBe(0)
  })
})

describe('state table invariants', () => {
  const states = Object.entries(STATE_TAX_DATA)

  it('has all 50 states plus DC, keyed by their own code', () => {
    expect(states).toHaveLength(51)
    expect(STATE_TAX_DATA.DC).toBeDefined()
    for (const [key, s] of states) expect(s.code).toBe(key)
  })

  it('keeps rates in a sane range, with long-term never above short-term except WA', () => {
    for (const [code, s] of states) {
      for (const r of [s.stcgRate, s.ltcgRate]) {
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(0.15)
      }
      if (code !== 'WA') expect(s.ltcgRate).toBeLessThanOrEqual(s.stcgRate)
    }
  })

  it('has increasing thresholds and rates in every bracket table, ending at Infinity at the top rate', () => {
    for (const [, s] of states) {
      if (!s.hasBrackets) continue
      expect(s.brackets).toBeDefined()
      for (const table of [s.brackets!.single, s.brackets!.mfj]) {
        for (let i = 1; i < table.length; i++) {
          expect(table[i].upTo).toBeGreaterThan(table[i - 1].upTo)
          expect(table[i].rate).toBeGreaterThanOrEqual(table[i - 1].rate)
        }
        expect(table[table.length - 1].upTo).toBe(Infinity)
        expect(table[table.length - 1].rate).toBe(s.stcgRate)
      }
    }
  })

  it('charges nothing in states without an income tax on gains', () => {
    for (const code of ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY', 'MO']) {
      for (const longTerm of [true, false]) {
        expect(stateTaxOnGain(code, 150_000, 50_000, 'single', longTerm)).toBe(0)
      }
    }
  })

  it('pins the states that tax long-term gains at a lower rate', () => {
    const expected: Record<string, [number, number]> = {
      AZ: [0.025, 0.01875], AR: [0.039, 0.0195], HI: [0.11, 0.0725], MA: [0.085, 0.05],
      MT: [0.0565, 0.041], ND: [0.025, 0.015], SC: [0.06, 0.0336], WI: [0.0765, 0.05355],
    }
    for (const [code, [st, lt]] of Object.entries(expected)) {
      expect(stateTaxOnGain(code, 0, 10_000, 'single', false)).toBeCloseTo(10_000 * st, 6)
      expect(stateTaxOnGain(code, 0, 10_000, 'single', true)).toBeCloseTo(10_000 * lt, 6)
    }
    const differing = Object.values(STATE_TAX_DATA).filter(s => s.stcgRate !== s.ltcgRate).map(s => s.code).sort()
    expect(differing).toEqual([...Object.keys(expected), 'WA'].sort())
  })

  it('returns 0 for an unknown state or a non-positive gain', () => {
    expect(stateTaxOnGain('ZZ', 100_000, 10_000, 'single', false)).toBe(0)
    expect(stateTaxOnGain('CA', 100_000, 0, 'single', false)).toBe(0)
    expect(stateTaxOnGain('CA', 100_000, -10, 'single', false)).toBe(0)
  })
})

describe('bracketed states', () => {
  it('California 2025 schedule: 9.3% from $72,724 single and $145,448 joint', () => {
    expect(stateTaxOnGain('CA', 100_000, 10_000, 'single', false)).toBeCloseTo(930, 6)
    expect(stateTaxOnGain('CA', 72_000, 1_000, 'single', false)).toBeCloseTo(724 * 0.08 + 276 * 0.093, 6)
    expect(stateTaxOnGain('CA', 145_000, 1_000, 'mfj', false)).toBeCloseTo(448 * 0.08 + 552 * 0.093, 6)
    // 1% mental health surcharge above $1M
    expect(stateTaxOnGain('CA', 2_000_000, 1_000, 'single', true)).toBeCloseTo(133, 6)
  })

  it('Minnesota 2026 schedule', () => {
    expect(stateTaxOnGain('MN', 109_000, 1_000, 'single', false)).toBeCloseTo(430 * 0.068 + 570 * 0.0785, 6)
    expect(stateTaxOnGain('MN', 337_000, 1_000, 'mfj', false)).toBeCloseTo(930 * 0.0785 + 70 * 0.0985, 6)
  })

  it('New York 2026 rates (bottom brackets cut 0.1 point)', () => {
    expect(stateTaxOnGain('NY', 100_000, 10_000, 'single', false)).toBeCloseTo(590, 6)
    expect(stateTaxOnGain('NY', 300_000, 10_000, 'single', false)).toBeCloseTo(685, 6)
    expect(stateTaxOnGain('NY', 300_000, 10_000, 'mfj', false)).toBeCloseTo(590, 6)
  })

  it('head of household and married separate use the single table', () => {
    for (const status of ['hoh', 'mfs'] as const) {
      expect(stateTaxOnGain('CA', 100_000, 50_000, status, false))
        .toBeCloseTo(stateTaxOnGain('CA', 100_000, 50_000, 'single', false), 9)
    }
  })

  it('Georgia uses the 2026 4.99% flat rate', () => {
    expect(stateTaxOnGain('GA', 100_000, 10_000, 'single', false)).toBeCloseTo(499, 6)
  })
})

describe('Washington capital gains excise tax', () => {
  it('taxes long-term gains above $278K at 7%, and 9.9% above $1M more', () => {
    expect(stateTaxOnGain('WA', 0, 278_000, 'single', true)).toBe(0)
    expect(stateTaxOnGain('WA', 0, 1_278_000, 'single', true)).toBeCloseTo(70_000, 6)
    expect(stateTaxOnGain('WA', 0, 1_500_000, 'single', true)).toBeCloseTo(70_000 + 0.099 * 222_000, 6)
  })
  it('never taxes short-term gains', () => {
    expect(stateTaxOnGain('WA', 0, 5_000_000, 'single', false)).toBe(0)
  })
})

describe('ticker volatility', () => {
  it('falls back to the default for unknown tickers', () => {
    expect(getTickerVol('NOTAREALTICKER')).toBe(DEFAULT_VOL)
    expect(DEFAULT_VOL).toBe(22)
    expect(isVolKnown('NOTAREALTICKER')).toBe(false)
  })
  it('ignores case', () => {
    expect(isVolKnown('spy')).toBe(true)
    expect(getTickerVol('spy')).toBe(getTickerVol('SPY'))
  })
})
