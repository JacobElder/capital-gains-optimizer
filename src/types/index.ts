export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh'

export interface UserSettings {
  filingStatus: FilingStatus
  // Taxable income for the year EXCLUDING the sale being analyzed
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
  longTermDate: string // ISO date of the first sale that qualifies as long-term
  holdingProgressPercent: number

  // Effective rates on THIS gain (tax / gain), with the gain stacked on top of other income
  federalSTCGRate: number
  federalLTCGRate: number
  stateSTCGRate: number
  stateLTCGRate: number
  stcgCombinedRate: number
  ltcgCombinedRate: number
  niitApplies: boolean
  nycRate: number
  stcgPreferred: boolean // true when STCG tax < LTCG tax (e.g. WA gains over $278K)

  taxIfSoldNowSTCG: number
  taxIfSoldAsLTCG: number
  taxSavingsFromWaiting: number

  netProceedsNow: number
  breakevenPrice: number
  dropCushionPercent: number
  // Driftless lognormal model over the days remaining until the LTCG date
  probBelowBreakeven: number      // P(price at LTCG date < break-even) — chance waiting loses
  expectedGainFromWaiting: number // E[after-tax if held] − net if sold now
  expectedShortfall: number       // E[max(0, net now − after-tax if held)]
  upsideDownsideRatio: number     // E[upside] / E[downside] of waiting; drives riskLevel
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

export type PrivacyMode = 'off' | 'anonymize' | 'sample'

export interface PrivacySettings {
  mode: PrivacyMode
  seed: number
  maskTickers: boolean // anonymize mode: swap real tickers for look-alikes
}
