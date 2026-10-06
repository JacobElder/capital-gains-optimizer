import type { FilingStatus } from '../types'

export interface Bracket {
  upTo: number
  rate: number
}

// Tax year the bracket tables below describe. A sale made today is taxed in
// this year; a sale after the LTCG date may land in the following year, whose
// brackets are not published yet, so the same table is reused for both.
export const TAX_YEAR = 2026

// 2026 federal ordinary income brackets (also apply to STCG) — IRS Rev. Proc. 2025-32
const ORDINARY_SINGLE: Bracket[] = [
  { upTo: 12_400, rate: 0.10 },
  { upTo: 50_400, rate: 0.12 },
  { upTo: 105_700, rate: 0.22 },
  { upTo: 201_775, rate: 0.24 },
  { upTo: 256_225, rate: 0.32 },
  { upTo: 640_600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const ORDINARY_MFJ: Bracket[] = [
  { upTo: 24_800, rate: 0.10 },
  { upTo: 100_800, rate: 0.12 },
  { upTo: 211_400, rate: 0.22 },
  { upTo: 403_550, rate: 0.24 },
  { upTo: 512_450, rate: 0.32 },
  { upTo: 768_700, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const ORDINARY_MFS: Bracket[] = [
  { upTo: 12_400, rate: 0.10 },
  { upTo: 50_400, rate: 0.12 },
  { upTo: 105_700, rate: 0.22 },
  { upTo: 201_775, rate: 0.24 },
  { upTo: 256_225, rate: 0.32 },
  { upTo: 384_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const ORDINARY_HOH: Bracket[] = [
  { upTo: 17_700, rate: 0.10 },
  { upTo: 67_450, rate: 0.12 },
  { upTo: 105_700, rate: 0.22 },
  { upTo: 201_750, rate: 0.24 },
  { upTo: 256_200, rate: 0.32 },
  { upTo: 640_600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

// 2026 LTCG brackets. Thresholds are measured against TOTAL taxable income
// (ordinary income + gains), because long-term gains stack on top.
const LTCG_SINGLE: Bracket[] = [
  { upTo: 49_450, rate: 0.00 },
  { upTo: 545_500, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_MFJ: Bracket[] = [
  { upTo: 98_900, rate: 0.00 },
  { upTo: 613_700, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_MFS: Bracket[] = [
  { upTo: 49_450, rate: 0.00 },
  { upTo: 306_850, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_HOH: Bracket[] = [
  { upTo: 66_200, rate: 0.00 },
  { upTo: 579_600, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

// NIIT thresholds (MAGI-based, not inflation-adjusted, frozen by statute)
const NIIT_RATE = 0.038
const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
  hoh: 200_000,
}

const ORDINARY: Record<FilingStatus, Bracket[]> = {
  single: ORDINARY_SINGLE, mfj: ORDINARY_MFJ, mfs: ORDINARY_MFS, hoh: ORDINARY_HOH,
}
const LTCG: Record<FilingStatus, Bracket[]> = {
  single: LTCG_SINGLE, mfj: LTCG_MFJ, mfs: LTCG_MFS, hoh: LTCG_HOH,
}

/** Tax on the slice of income between `from` and `to` under a bracket schedule. */
export function taxOnSlice(from: number, to: number, brackets: Bracket[]): number {
  if (to <= from) return 0
  let tax = 0
  let lower = 0
  for (const b of brackets) {
    const lo = Math.max(from, lower)
    const hi = Math.min(to, b.upTo)
    if (hi > lo) tax += (hi - lo) * b.rate
    if (b.upTo >= to) break
    lower = b.upTo
  }
  return tax
}

export function marginalRate(income: number, brackets: Bracket[]): number {
  return brackets.find(b => income <= b.upTo)?.rate ?? brackets[brackets.length - 1].rate
}

/** Extra federal income tax from adding a short-term gain on top of `income`. */
export function federalSTCGTax(income: number, gain: number, status: FilingStatus): number {
  if (gain <= 0) return 0
  return taxOnSlice(income, income + gain, ORDINARY[status])
}

/** Federal tax on a long-term gain stacked on top of `income` of ordinary taxable income. */
export function federalLTCGTax(income: number, gain: number, status: FilingStatus): number {
  if (gain <= 0) return 0
  return taxOnSlice(income, income + gain, LTCG[status])
}

/**
 * Net Investment Income Tax attributable to this gain: 3.8% of the lesser of
 * the gain or the amount by which MAGI (income + gain) exceeds the threshold.
 * Taxable income is used as a stand-in for MAGI, which understates NIIT for
 * people with large deductions.
 */
export function niitTax(income: number, gain: number, status: FilingStatus): number {
  if (gain <= 0) return 0
  const excess = Math.max(0, income + gain - NIIT_THRESHOLDS[status])
  return NIIT_RATE * Math.min(gain, excess)
}

export function getNIITApplies(income: number, status: FilingStatus): boolean {
  return income > NIIT_THRESHOLDS[status]
}

/** Marginal rates on the next dollar of gain — used for display only. */
export function getFederalSTCGRate(income: number, status: FilingStatus): number {
  const base = marginalRate(income, ORDINARY[status])
  return getNIITApplies(income, status) ? base + NIIT_RATE : base
}

export function getFederalLTCGRate(income: number, status: FilingStatus): number {
  const base = marginalRate(income, LTCG[status])
  return getNIITApplies(income, status) ? base + NIIT_RATE : base
}
