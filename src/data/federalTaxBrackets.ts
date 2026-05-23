import type { FilingStatus } from '../types'

interface Bracket {
  upTo: number
  rate: number
}

// 2025 Federal ordinary income (STCG) brackets — IRS Rev. Proc. 2024-40
const STCG_SINGLE: Bracket[] = [
  { upTo: 11925, rate: 0.10 },
  { upTo: 48475, rate: 0.12 },
  { upTo: 103350, rate: 0.22 },
  { upTo: 197300, rate: 0.24 },
  { upTo: 250525, rate: 0.32 },
  { upTo: 626350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const STCG_MFJ: Bracket[] = [
  { upTo: 23850, rate: 0.10 },
  { upTo: 96950, rate: 0.12 },
  { upTo: 206700, rate: 0.22 },
  { upTo: 394600, rate: 0.24 },
  { upTo: 501050, rate: 0.32 },
  { upTo: 751600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const STCG_MFS: Bracket[] = [
  { upTo: 11925, rate: 0.10 },
  { upTo: 48475, rate: 0.12 },
  { upTo: 103350, rate: 0.22 },
  { upTo: 197300, rate: 0.24 },
  { upTo: 250525, rate: 0.32 },
  { upTo: 375800, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

const STCG_HOH: Bracket[] = [
  { upTo: 17000, rate: 0.10 },
  { upTo: 64850, rate: 0.12 },
  { upTo: 103350, rate: 0.22 },
  { upTo: 197300, rate: 0.24 },
  { upTo: 250500, rate: 0.32 },
  { upTo: 626350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
]

// 2025 Federal LTCG brackets
const LTCG_SINGLE: Bracket[] = [
  { upTo: 48350, rate: 0.00 },
  { upTo: 533400, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_MFJ: Bracket[] = [
  { upTo: 96700, rate: 0.00 },
  { upTo: 600050, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_MFS: Bracket[] = [
  { upTo: 48350, rate: 0.00 },
  { upTo: 300000, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

const LTCG_HOH: Bracket[] = [
  { upTo: 64750, rate: 0.00 },
  { upTo: 566700, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
]

// NIIT thresholds (not inflation-adjusted, frozen by statute)
const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
  hoh: 200_000,
}

function getMarginalRate(income: number, brackets: Bracket[]): number {
  return brackets.find(b => income <= b.upTo)?.rate ?? brackets[brackets.length - 1].rate
}

function getSTCGBrackets(status: FilingStatus): Bracket[] {
  switch (status) {
    case 'single': return STCG_SINGLE
    case 'mfj': return STCG_MFJ
    case 'mfs': return STCG_MFS
    case 'hoh': return STCG_HOH
  }
}

function getLTCGBrackets(status: FilingStatus): Bracket[] {
  switch (status) {
    case 'single': return LTCG_SINGLE
    case 'mfj': return LTCG_MFJ
    case 'mfs': return LTCG_MFS
    case 'hoh': return LTCG_HOH
  }
}

export function getNIITApplies(income: number, status: FilingStatus): boolean {
  return income > NIIT_THRESHOLDS[status]
}

export function getFederalSTCGRate(income: number, status: FilingStatus): number {
  const base = getMarginalRate(income, getSTCGBrackets(status))
  return getNIITApplies(income, status) ? base + 0.038 : base
}

export function getFederalLTCGRate(income: number, status: FilingStatus): number {
  const base = getMarginalRate(income, getLTCGBrackets(status))
  return getNIITApplies(income, status) ? base + 0.038 : base
}
