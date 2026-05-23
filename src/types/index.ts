export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh'

export interface UserSettings {
  filingStatus: FilingStatus
  annualTaxableIncome: number
  stateCode: string
  nycResident: boolean
}

export interface Position {
  id: string
  ticker: string
  name: string
  shares: number
  costBasisPerShare: number
  purchaseDate: string // ISO 'YYYY-MM-DD'
  currentPrice: number
  volatilityOverride?: number // annualized %, overrides ticker lookup
  createdAt: string
  updatedAt: string
}

export type RiskLevel = 'high' | 'moderate' | 'low' | 'already-ltcg' | 'loss' | 'stcg-preferred'

export interface PositionAnalysis {
  position: Position

  totalCostBasis: number
  currentValue: number
  gainAmount: number
  gainPercent: number
  isLoss: boolean

  daysHeld: number
  isLongTerm: boolean
  daysUntilLongTerm: number
  holdingProgressPercent: number

  federalSTCGRate: number
  federalLTCGRate: number
  stateSTCGRate: number
  stateLTCGRate: number
  stcgCombinedRate: number
  ltcgCombinedRate: number
  niitApplies: boolean
  nycRate: number
  stcgPreferred: boolean // true when STCG < LTCG (e.g. WA large gains)

  taxIfSoldNowSTCG: number
  taxIfSoldAsLTCG: number
  taxSavingsFromWaiting: number

  netProceedsNow: number
  breakevenPrice: number
  dropCushionPercent: number
  riskLevel: RiskLevel
  annualizedVol: number       // effective vol used for risk (%, e.g. 24)
  volIsOverride: boolean      // true if user-specified rather than ticker lookup
}

export interface FutureVestLot {
  id: string
  ticker: string
  name: string
  awardId: string
  awardDate: string  // ISO YYYY-MM-DD
  vestDate: string   // ISO YYYY-MM-DD
  sharesGross: number
}

export interface StateTaxInfo {
  code: string
  name: string
  stcgRate: number
  ltcgRate: number
  treatsCGAsOrdinaryIncome: boolean
  hasBrackets: boolean
  brackets?: {
    single: Array<{ upTo: number; rate: number }>
    mfj: Array<{ upTo: number; rate: number }>
  }
  notes?: string
}
