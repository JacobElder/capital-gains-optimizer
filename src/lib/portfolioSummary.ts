import type { PositionAnalysis, RiskLevel } from '../types'

// Pure aggregation behind the dashboard, the grouped ticker cards and the list
// sort. Kept out of the components so the numbers can be unit tested.

/** Every risk level in display order. Typed as a Record so a new level fails to compile until it is placed. */
export const RISK_ORDER: Record<RiskLevel, number> = {
  high: 0, 'stcg-preferred': 1, moderate: 2, low: 3, 'already-ltcg': 4, loss: 5, invalid: 6,
}
export const RISK_LEVELS = (Object.keys(RISK_ORDER) as RiskLevel[]).sort((a, b) => RISK_ORDER[a] - RISK_ORDER[b])

/**
 * A lot where waiting for long-term treatment is the open question: a
 * short-term gain where long-term tax is lower. Its tax savings count toward
 * "potential savings"; every other lot has no decision about waiting.
 */
export function isActionable(a: PositionAnalysis): boolean {
  return a.riskLevel === 'high' || a.riskLevel === 'moderate' || a.riskLevel === 'low'
}

/** P(price stays above break-even through the LTCG date), or null when there is no decision. */
export function chanceWaitingWins(a: PositionAnalysis): number | null {
  return isActionable(a) ? 1 - a.probBelowBreakeven : null
}

export function countByRisk(analyses: PositionAnalysis[]): Record<RiskLevel, number> {
  const counts = Object.fromEntries(RISK_LEVELS.map(r => [r, 0])) as Record<RiskLevel, number>
  for (const a of analyses) counts[a.riskLevel]++
  return counts
}

export interface HarvestingSummary {
  totalLosses: number
  totalGains: number
  /** Gain offset by losses: min(losses, gains) */
  offset: number
  /** Short- and long-term gain offset, after netting losses against their own kind first */
  offsetShortTerm: number
  offsetLongTerm: number
  netGainAfterHarvesting: number
  /** Range of tax saved, using the lowest and highest per-lot rate on each kind of gain */
  taxSaved: { low: number; high: number }
}

/**
 * Tax-loss harvesting estimate. Follows the IRS netting order: short-term
 * losses offset short-term gains first and long-term losses offset long-term
 * gains first; only what is left over crosses to the other kind. An offset
 * short-term gain saves tax at a short-term rate, a long-term one at a
 * long-term rate.
 */
export function summarizeHarvesting(analyses: PositionAnalysis[]): HarvestingSummary {
  const valid = analyses.filter(a => a.riskLevel !== 'invalid')
  const stGainers = valid.filter(a => a.gainAmount > 0 && !a.isLongTerm)
  const ltGainers = valid.filter(a => a.gainAmount > 0 && a.isLongTerm)
  const sum = (xs: PositionAnalysis[]) => xs.reduce((s, a) => s + Math.abs(a.gainAmount), 0)
  const stGain = sum(stGainers)
  const ltGain = sum(ltGainers)
  const stLoss = sum(valid.filter(a => a.isLoss && !a.isLongTerm))
  const ltLoss = sum(valid.filter(a => a.isLoss && a.isLongTerm))

  const stOwn = Math.min(stLoss, stGain)
  const ltOwn = Math.min(ltLoss, ltGain)
  const ltCross = Math.min(ltLoss - ltOwn, stGain - stOwn) // leftover LT losses → ST gains
  const stCross = Math.min(stLoss - stOwn, ltGain - ltOwn) // leftover ST losses → LT gains
  const offsetShortTerm = stOwn + ltCross
  const offsetLongTerm = ltOwn + stCross

  const range = (xs: PositionAnalysis[], pick: (a: PositionAnalysis) => number) =>
    xs.length ? { min: Math.min(...xs.map(pick)), max: Math.max(...xs.map(pick)) } : { min: 0, max: 0 }
  const stRate = range(stGainers, a => a.stcgCombinedRate)
  const ltRate = range(ltGainers, a => a.ltcgCombinedRate)

  const totalLosses = stLoss + ltLoss
  const totalGains = stGain + ltGain
  return {
    totalLosses,
    totalGains,
    offset: offsetShortTerm + offsetLongTerm,
    offsetShortTerm,
    offsetLongTerm,
    netGainAfterHarvesting: Math.max(0, totalGains - totalLosses),
    taxSaved: {
      low: offsetShortTerm * stRate.min + offsetLongTerm * ltRate.min,
      high: offsetShortTerm * stRate.max + offsetLongTerm * ltRate.max,
    },
  }
}

export interface PortfolioSummary {
  lotCount: number
  totalValue: number
  totalGain: number
  /** Sum of tax savings over actionable lots only */
  totalSavings: number
  /** Savings-weighted chance each actionable lot ends above break-even; null without savings */
  weightedProbability: number | null
  expectedShortfall: number
  riskCounts: Record<RiskLevel, number>
  longTermCount: number
  harvesting: HarvestingSummary
}

export function summarizePortfolio(analyses: PositionAnalysis[]): PortfolioSummary {
  const valid = analyses.filter(a => a.riskLevel !== 'invalid')
  const actionable = analyses.filter(isActionable)
  const totalSavings = actionable.reduce((s, a) => s + a.taxSavingsFromWaiting, 0)
  const weightedNum = actionable.reduce((s, a) => s + (chanceWaitingWins(a) ?? 0) * a.taxSavingsFromWaiting, 0)
  return {
    lotCount: analyses.length,
    totalValue: valid.reduce((s, a) => s + a.currentValue, 0),
    totalGain: valid.reduce((s, a) => s + a.gainAmount, 0),
    totalSavings,
    weightedProbability: totalSavings > 0 ? weightedNum / totalSavings : null,
    expectedShortfall: actionable.reduce((s, a) => s + a.expectedShortfall, 0),
    riskCounts: countByRisk(analyses),
    longTermCount: analyses.filter(a => a.isLongTerm).length,
    harvesting: summarizeHarvesting(analyses),
  }
}

export interface GroupSummary {
  totalValue: number
  totalGain: number
  totalSavings: number
  riskCounts: Record<RiskLevel, number>
  /** Actionable lot closest to its LTCG date, or null when no lot is waiting on one */
  mostUrgent: PositionAnalysis | null
  /** Most common risk level; ties go to the level listed first in RISK_ORDER */
  dominantRisk: RiskLevel | null
}

export function summarizeGroup(analyses: PositionAnalysis[]): GroupSummary {
  const valid = analyses.filter(a => a.riskLevel !== 'invalid')
  const actionable = analyses.filter(isActionable)
  const riskCounts = countByRisk(analyses)
  let dominantRisk: RiskLevel | null = null
  for (const r of RISK_LEVELS) {
    if (riskCounts[r] > 0 && (dominantRisk == null || riskCounts[r] > riskCounts[dominantRisk])) dominantRisk = r
  }
  return {
    totalValue: valid.reduce((s, a) => s + a.currentValue, 0),
    totalGain: valid.reduce((s, a) => s + a.gainAmount, 0),
    totalSavings: actionable.reduce((s, a) => s + a.taxSavingsFromWaiting, 0),
    riskCounts,
    mostUrgent: actionable.length
      ? actionable.reduce((min, a) => (a.daysUntilLongTerm < min.daysUntilLongTerm ? a : min))
      : null,
    dominantRisk,
  }
}

export type SortKey = 'urgency' | 'savings' | 'gain' | 'risk'

/**
 * Sorted copy of `analyses`. Urgency puts lots with no LTCG date left
 * (already long-term, or invalid) last. Ties keep their input order.
 */
export function sortAnalyses(analyses: PositionAnalysis[], key: SortKey): PositionAnalysis[] {
  const noDeadline = (a: PositionAnalysis) => a.isLongTerm || a.riskLevel === 'invalid'
  return [...analyses].sort((a, b) => {
    switch (key) {
      case 'urgency':
        if (noDeadline(a) !== noDeadline(b)) return noDeadline(a) ? 1 : -1
        if (noDeadline(a)) return 0
        return a.daysUntilLongTerm - b.daysUntilLongTerm
      case 'risk':
        return RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]
      case 'savings':
        return b.taxSavingsFromWaiting - a.taxSavingsFromWaiting
      case 'gain':
        return b.gainAmount - a.gainAmount
    }
  })
}

/** Groups lots by ticker, keeping the input order within and across groups. */
export function groupByTicker(analyses: PositionAnalysis[]): Map<string, PositionAnalysis[]> {
  const map = new Map<string, PositionAnalysis[]>()
  for (const a of analyses) {
    const list = map.get(a.position.ticker) ?? []
    list.push(a)
    map.set(a.position.ticker, list)
  }
  return map
}
