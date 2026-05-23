import { differenceInCalendarDays, parseISO, addDays } from 'date-fns'
import type { Position, UserSettings, PositionAnalysis, RiskLevel } from '../types'
import { getFederalSTCGRate, getFederalLTCGRate, getNIITApplies } from '../data/federalTaxBrackets'
import { getStateSTCGRate, getStateLTCGRate } from '../data/stateTaxData'
import { getTickerVol, isVolKnown, DEFAULT_VOL } from '../data/tickerVolatility'

const LTCG_DAYS = 366 // IRS: "more than 1 year" = 366+ calendar days

// Time-adjusted risk: uses per-ticker (or user-supplied) annualized vol to calibrate.
//   sigma_pct(N days) = annualVol% * sqrt(N / 252)
// Thresholds (expressed as multiples of 1σ):
//   HIGH     < 0.75σ  (>22% probability the cushion gets breached)
//   MODERATE  0.75–1.5σ  (7–22% probability)
//   LOW      > 1.5σ   (<7% probability)
function getRiskLevel(
  dropCushionPercent: number,
  isLoss: boolean,
  isLongTerm: boolean,
  stcgPreferred: boolean,
  daysUntilLongTerm: number,
  annualVol: number,
): RiskLevel {
  if (isLoss) return 'loss'
  if (isLongTerm) return 'already-ltcg'
  if (stcgPreferred) return 'stcg-preferred'
  const days = Math.max(1, daysUntilLongTerm)
  const sigmaPct = annualVol * Math.sqrt(days / 252)
  if (dropCushionPercent < 0.75 * sigmaPct) return 'high'
  if (dropCushionPercent < 1.5 * sigmaPct) return 'moderate'
  return 'low'
}

export function riskSigmaContext(daysUntilLongTerm: number, annualVol = DEFAULT_VOL): { sigmaPct: number; highThreshold: number; lowThreshold: number } {
  const days = Math.max(1, daysUntilLongTerm)
  const sigmaPct = annualVol * Math.sqrt(days / 252)
  return { sigmaPct, highThreshold: 0.75 * sigmaPct, lowThreshold: 1.5 * sigmaPct }
}

export function effectiveVol(position: Pick<Position, 'ticker' | 'volatilityOverride'>): { vol: number; isOverride: boolean; isKnown: boolean } {
  if (position.volatilityOverride != null && position.volatilityOverride > 0) {
    return { vol: position.volatilityOverride, isOverride: true, isKnown: true }
  }
  const known = isVolKnown(position.ticker)
  return { vol: getTickerVol(position.ticker), isOverride: false, isKnown: known }
}

export function analyzePosition(position: Position, settings: UserSettings): PositionAnalysis {
  const { shares, costBasisPerShare, currentPrice, purchaseDate } = position
  const { filingStatus, annualTaxableIncome, stateCode } = settings

  // --- Cost basis & gain ---
  const totalCostBasis = shares * costBasisPerShare
  const currentValue = shares * currentPrice
  const gainAmount = currentValue - totalCostBasis
  const gainPercent = costBasisPerShare > 0 ? (gainAmount / totalCostBasis) * 100 : 0
  const isLoss = gainAmount < 0

  // --- Holding period (IRS: period starts day AFTER trade date) ---
  const holdingStart = addDays(parseISO(purchaseDate), 1)
  const daysHeld = differenceInCalendarDays(new Date(), holdingStart)
  const isLongTerm = daysHeld >= LTCG_DAYS
  const daysUntilLongTerm = isLongTerm ? 0 : LTCG_DAYS - daysHeld
  const holdingProgressPercent = Math.min(100, (daysHeld / LTCG_DAYS) * 100)

  // --- Tax rates ---
  const federalSTCGRate = getFederalSTCGRate(annualTaxableIncome, filingStatus)
  const federalLTCGRate = getFederalLTCGRate(annualTaxableIncome, filingStatus)
  const stateSTCGRate = getStateSTCGRate(stateCode, annualTaxableIncome, filingStatus)
  const stateLTCGRate = getStateLTCGRate(stateCode, annualTaxableIncome, filingStatus)
  const niitApplies = getNIITApplies(annualTaxableIncome, filingStatus)

  const stcgCombinedRate = federalSTCGRate + stateSTCGRate
  const ltcgCombinedRate = federalLTCGRate + stateLTCGRate

  // WA edge case: STCG may be lower than LTCG for large gains
  const stcgPreferred = !isLoss && !isLongTerm && stcgCombinedRate < ltcgCombinedRate

  // --- Tax amounts at current price (on the gain, not full proceeds) ---
  const taxableGain = Math.max(0, gainAmount) // negative gain = no tax
  const taxIfSoldNowSTCG = taxableGain * stcgCombinedRate
  const taxIfSoldAsLTCG = taxableGain * ltcgCombinedRate
  const taxSavingsFromWaiting = taxIfSoldNowSTCG - taxIfSoldAsLTCG

  // --- Break-even analysis ---
  // net_now = currentValue - taxIfSoldNowSTCG
  // At breakeven price P per share:
  //   P*shares - (P*shares - totalCostBasis)*ltcgCombined = net_now
  //   => solve per share: p - (p - basis)*ltcgCombined = net_now/shares
  //   => p*(1-ltcgCombined) = net_now/shares - basis*ltcgCombined ... wait
  // Simpler: work per share.
  const netProceedsNow = currentValue - taxIfSoldNowSTCG

  let breakevenPrice = currentPrice
  let dropCushionPercent = 0

  if (!isLoss && !isLongTerm && !stcgPreferred && ltcgCombinedRate < 1) {
    // net_now_per_share = netProceedsNow / shares
    // p - (p - basis)*ltcg = net_now_per_share
    // p(1 - ltcg) + basis*ltcg = net_now_per_share
    // p = (net_now_per_share - basis*ltcg) / (1 - ltcg)
    const netPerShare = netProceedsNow / shares
    breakevenPrice = (netPerShare - costBasisPerShare * ltcgCombinedRate) / (1 - ltcgCombinedRate)
    dropCushionPercent = currentPrice > 0
      ? Math.max(0, ((currentPrice - breakevenPrice) / currentPrice) * 100)
      : 0
  }

  const { vol: annualizedVol, isOverride: volIsOverride } = effectiveVol(position)
  const riskLevel = getRiskLevel(dropCushionPercent, isLoss, isLongTerm, stcgPreferred, daysUntilLongTerm, annualizedVol)

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
    holdingProgressPercent,
    federalSTCGRate,
    federalLTCGRate,
    stateSTCGRate,
    stateLTCGRate,
    stcgCombinedRate,
    ltcgCombinedRate,
    niitApplies,
    stcgPreferred,
    taxIfSoldNowSTCG,
    taxIfSoldAsLTCG,
    taxSavingsFromWaiting,
    netProceedsNow,
    breakevenPrice,
    dropCushionPercent,
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
