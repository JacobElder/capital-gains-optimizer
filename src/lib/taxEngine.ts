import { differenceInCalendarDays, parseISO, addDays, addYears, format } from 'date-fns'
import type { Position, UserSettings, PositionAnalysis, RiskLevel } from '../types'
import { federalSTCGTax, federalLTCGTax, niitTax, taxOnSlice } from '../data/federalTaxBrackets'
import { stateTaxOnGain } from '../data/stateTaxData'
import { getTickerVol, isVolKnown } from '../data/tickerVolatility'

// NYC income tax brackets — capital gains taxed as ordinary income
const NYC_BRACKETS: Record<string, Array<{ upTo: number; rate: number }>> = {
  single: [
    { upTo: 12_000,   rate: 0.03078 },
    { upTo: 25_000,   rate: 0.03762 },
    { upTo: 50_000,   rate: 0.03819 },
    { upTo: Infinity, rate: 0.03876 },
  ],
  hoh: [
    { upTo: 12_000,   rate: 0.03078 },
    { upTo: 25_000,   rate: 0.03762 },
    { upTo: 50_000,   rate: 0.03819 },
    { upTo: Infinity, rate: 0.03876 },
  ],
  mfj: [
    { upTo: 21_600,   rate: 0.03078 },
    { upTo: 45_000,   rate: 0.03762 },
    { upTo: 90_000,   rate: 0.03819 },
    { upTo: Infinity, rate: 0.03876 },
  ],
  mfs: [
    { upTo: 10_800,   rate: 0.03078 },
    { upTo: 22_500,   rate: 0.03762 },
    { upTo: 45_000,   rate: 0.03819 },
    { upTo: Infinity, rate: 0.03876 },
  ],
}

// Risk is rated on the upside/downside ratio of waiting:
//   E[gain from waiting | waiting wins] / E[loss from waiting | waiting loses]
// (unconditional expectations; an Omega ratio with a zero threshold). The
// probability of regret alone is a poor criterion: tax savings are usually a
// few % of price while months of volatility are 15–30%, so nearly every lot
// has a 30–50% chance of regret even when waiting is clearly worth it on average.
export const HIGH_RISK_RATIO = 1.25 // waiting is barely better than a coin flip after tax
export const LOW_RISK_RATIO = 2     // expected upside at least twice the expected downside

export interface TaxBreakdown {
  federal: number
  niit: number
  state: number
  city: number
  total: number
}

/**
 * Total tax on realizing `gain`, stacked on top of the user's other taxable
 * income. Losses are treated as producing no tax (conservative: ignores the
 * value of offsetting other gains or $3k of ordinary income).
 */
export function taxOnGain(gain: number, longTerm: boolean, settings: UserSettings): TaxBreakdown {
  const { filingStatus, annualTaxableIncome: income, stateCode, nycResident } = settings
  if (gain <= 0) return { federal: 0, niit: 0, state: 0, city: 0, total: 0 }
  const federal = longTerm
    ? federalLTCGTax(income, gain, filingStatus)
    : federalSTCGTax(income, gain, filingStatus)
  const niit = niitTax(income, gain, filingStatus)
  const state = stateTaxOnGain(stateCode, income, gain, filingStatus, longTerm)
  const city = nycResident && stateCode === 'NY'
    ? taxOnSlice(income, income + gain, NYC_BRACKETS[filingStatus] ?? NYC_BRACKETS.single)
    : 0
  return { federal, niit, state, city, total: federal + niit + state + city }
}

/**
 * IRS: long-term means held MORE than one year. The holding period starts the
 * day after the trade date, so the first long-term sale date is the day after
 * the one-year anniversary of the purchase.
 */
export function longTermDate(purchaseDate: string): Date {
  return addDays(addYears(parseISO(purchaseDate), 1), 1)
}

// Abramowitz–Stegun 26.2.17, |error| < 7.5e-8
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  const cdf = 1 - d * p
  return x >= 0 ? cdf : 1 - cdf
}

/** σ of log-returns over a calendar-day horizon, from an annualized vol in %. */
export function horizonSigma(annualVolPct: number, calendarDays: number): number {
  return (annualVolPct / 100) * Math.sqrt(Math.max(1, calendarDays) / 365)
}

/**
 * P(S_T < K) for a driftless (martingale) lognormal price. Zero drift is a
 * deliberate neutral assumption: the app should not bake in a return forecast.
 */
export function probBelow(spot: number, strike: number, sigma: number): number {
  if (strike <= 0) return 0
  if (sigma <= 0) return strike > spot ? 1 : 0
  return normalCDF((Math.log(strike / spot) + 0.5 * sigma * sigma) / sigma)
}

export function effectiveVol(position: Pick<Position, 'ticker' | 'volatilityOverride'>): { vol: number; isOverride: boolean; isKnown: boolean } {
  if (position.volatilityOverride != null && position.volatilityOverride > 0) {
    return { vol: position.volatilityOverride, isOverride: true, isKnown: true }
  }
  const known = isVolKnown(position.ticker)
  return { vol: getTickerVol(position.ticker), isOverride: false, isKnown: known }
}

// Standard-normal quadrature grid used for expected-value integrals
const Z_GRID = (() => {
  const pts: Array<{ z: number; w: number }> = []
  const n = 241, lo = -6, hi = 6, h = (hi - lo) / (n - 1)
  let total = 0
  for (let i = 0; i < n; i++) {
    const z = lo + i * h
    const w = Math.exp(-z * z / 2)
    pts.push({ z, w })
    total += w
  }
  return pts.map(p => ({ z: p.z, w: p.w / total }))
})()

function getRiskLevel(
  upsideDownsideRatio: number,
  isLoss: boolean,
  isLongTerm: boolean,
  stcgPreferred: boolean,
): RiskLevel {
  if (isLoss) return 'loss'
  if (isLongTerm) return 'already-ltcg'
  if (stcgPreferred) return 'stcg-preferred'
  if (upsideDownsideRatio < HIGH_RISK_RATIO) return 'high'
  if (upsideDownsideRatio < LOW_RISK_RATIO) return 'moderate'
  return 'low'
}

export function analyzePosition(position: Position, settings: UserSettings, today: Date = new Date()): PositionAnalysis {
  const { shares, costBasisPerShare, currentPrice, purchaseDate } = position

  // --- Cost basis & gain ---
  const totalCostBasis = shares * costBasisPerShare
  const currentValue = shares * currentPrice
  const gainAmount = currentValue - totalCostBasis
  const gainPercent = totalCostBasis > 0 ? (gainAmount / totalCostBasis) * 100 : 0
  const isLoss = gainAmount < 0

  // --- Holding period ---
  const ltDate = longTermDate(purchaseDate)
  const daysHeld = differenceInCalendarDays(today, parseISO(purchaseDate))
  const daysUntilLongTerm = Math.max(0, differenceInCalendarDays(ltDate, today))
  const isLongTerm = daysUntilLongTerm === 0
  const totalWindow = Math.max(1, differenceInCalendarDays(ltDate, parseISO(purchaseDate)))
  const holdingProgressPercent = Math.min(100, Math.max(0, (daysHeld / totalWindow) * 100))

  // --- Tax on selling now vs. at the LTCG date (at today's price) ---
  const taxNow = taxOnGain(gainAmount, false, settings)
  const taxLT = taxOnGain(gainAmount, true, settings)
  const taxableGain = Math.max(0, gainAmount)
  const rate = (t: number) => (taxableGain > 0 ? t / taxableGain : 0)

  const taxIfSoldNowSTCG = taxNow.total
  const taxIfSoldAsLTCG = taxLT.total
  const taxSavingsFromWaiting = taxIfSoldNowSTCG - taxIfSoldAsLTCG
  const stcgPreferred = !isLoss && !isLongTerm && taxSavingsFromWaiting < 0

  const netProceedsNow = currentValue - taxIfSoldNowSTCG
  const afterTaxIfHeld = (price: number) => {
    const value = price * shares
    return value - taxOnGain(value - totalCostBasis, true, settings).total
  }

  // --- Break-even: price at the LTCG date where waiting nets the same as selling now.
  // afterTaxIfHeld is increasing in price (marginal rate < 100%), so bisect.
  let breakevenPrice = currentPrice
  let dropCushionPercent = 0
  const canWait = !isLoss && !isLongTerm && !stcgPreferred && shares > 0
  if (canWait) {
    let lo = 0, hi = currentPrice
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (afterTaxIfHeld(mid) < netProceedsNow) lo = mid
      else hi = mid
    }
    breakevenPrice = hi
    dropCushionPercent = currentPrice > 0 ? Math.max(0, ((currentPrice - breakevenPrice) / currentPrice) * 100) : 0
  }

  // --- Probability & expected value of waiting (driftless lognormal) ---
  const { vol: annualizedVol, isOverride: volIsOverride } = effectiveVol(position)
  const sigma = horizonSigma(annualizedVol, daysUntilLongTerm)
  let probBelowBreakeven = 0
  let expectedGainFromWaiting = 0
  let expectedShortfall = 0
  if (canWait) {
    probBelowBreakeven = probBelow(currentPrice, breakevenPrice, sigma)
    for (const { z, w } of Z_GRID) {
      const price = currentPrice * Math.exp(-0.5 * sigma * sigma + sigma * z)
      const diff = afterTaxIfHeld(price) - netProceedsNow
      expectedGainFromWaiting += w * diff
      if (diff < 0) expectedShortfall += w * -diff
    }
  }

  const upsideDownsideRatio = expectedShortfall > 0
    ? (expectedGainFromWaiting + expectedShortfall) / expectedShortfall
    : Infinity
  const riskLevel = getRiskLevel(upsideDownsideRatio, isLoss, isLongTerm, stcgPreferred)

  return {
    position,
    totalCostBasis,
    currentValue,
    gainAmount,
    gainPercent,
    isLoss,
    daysHeld,
    isLongTerm,
    daysUntilLongTerm,
    longTermDate: format(ltDate, 'yyyy-MM-dd'),
    holdingProgressPercent,
    federalSTCGRate: rate(taxNow.federal + taxNow.niit),
    federalLTCGRate: rate(taxLT.federal + taxLT.niit),
    stateSTCGRate: rate(taxNow.state),
    stateLTCGRate: rate(taxLT.state),
    stcgCombinedRate: rate(taxNow.total),
    ltcgCombinedRate: rate(taxLT.total),
    niitApplies: taxNow.niit > 0 || taxLT.niit > 0,
    nycRate: rate(taxNow.city),
    stcgPreferred,
    taxIfSoldNowSTCG,
    taxIfSoldAsLTCG,
    taxSavingsFromWaiting,
    netProceedsNow,
    breakevenPrice,
    dropCushionPercent,
    probBelowBreakeven,
    expectedGainFromWaiting,
    expectedShortfall,
    upsideDownsideRatio,
    riskLevel,
    annualizedVol,
    volIsOverride,
  }
}

export function formatCurrency(n: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

export function formatRate(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

export function formatProb(p: number): string {
  if (p < 0.01) return '<1%'
  if (p > 0.99) return '>99%'
  return `${Math.round(p * 100)}%`
}
