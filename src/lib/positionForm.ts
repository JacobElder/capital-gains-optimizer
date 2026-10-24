import type { Position } from '../types'

// Validation and shaping for the add/edit position form, kept pure for tests.

export interface PositionFormFields {
  ticker: string
  name: string
  shares: string
  costBasisPerShare: string
  purchaseDate: string
  currentPrice: string
  volatilityOverride: string // empty = use ticker lookup
}

export type EntryMode = 'per-share' | 'total'

export interface PositionFormInput {
  form: PositionFormFields
  priceMode: EntryMode
  basisMode: EntryMode
  totalPriceInput: string
  totalBasisInput: string
  today: string // YYYY-MM-DD, local
}

export const VOL_MIN = 1
export const VOL_MAX = 200

/** Strict decimal parse: "12abc" and "" are NaN (parseFloat would accept "12abc"). */
export function parseDecimal(s: string): number {
  const t = (s ?? '').trim()
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN
}

/** total ÷ shares at full precision, or NaN. Rounding here made $1000 / 3 shares store $999.9999. */
export function perShareFromTotal(totalStr: string, sharesStr: string): number {
  const total = parseDecimal(totalStr)
  const shares = parseDecimal(sharesStr)
  if (Number.isNaN(total) || !(shares > 0)) return NaN
  return total / shares
}

export function effectivePerShare(input: PositionFormInput): { price: number; basis: number } {
  const { form, priceMode, basisMode, totalPriceInput, totalBasisInput } = input
  return {
    price: priceMode === 'per-share' ? parseDecimal(form.currentPrice) : perShareFromTotal(totalPriceInput, form.shares),
    basis: basisMode === 'per-share' ? parseDecimal(form.costBasisPerShare) : perShareFromTotal(totalBasisInput, form.shares),
  }
}

export type FormErrors = Partial<Record<keyof PositionFormFields, string>>

export function validatePositionForm(input: PositionFormInput): FormErrors {
  const { form, priceMode, basisMode, today } = input
  const { price, basis } = effectivePerShare(input)
  const errs: FormErrors = {}

  if (!form.ticker.trim()) errs.ticker = 'Required'
  if (!form.name.trim()) errs.name = 'Required'
  if (!(parseDecimal(form.shares) > 0)) errs.shares = 'Must be > 0'

  if (!(basis >= 0)) errs.costBasisPerShare = basisMode === 'total' ? 'Enter total acquisition cost' : 'Must be ≥ 0'
  if (!(price > 0)) errs.currentPrice = priceMode === 'total' ? 'Enter total market value' : 'Must be > 0'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.purchaseDate)) errs.purchaseDate = 'Required'
  else if (form.purchaseDate > today) errs.purchaseDate = 'Cannot be in the future'

  if (form.volatilityOverride.trim()) {
    const vol = parseDecimal(form.volatilityOverride)
    if (!(vol >= VOL_MIN && vol <= VOL_MAX)) errs.volatilityOverride = `Must be ${VOL_MIN}–${VOL_MAX}%, or blank`
  }
  return errs
}

/** The position fields to save. Call only after validatePositionForm returns no errors. */
export function formToPosition(input: PositionFormInput): Omit<Position, 'id' | 'createdAt' | 'updatedAt'> {
  const { form } = input
  const { price, basis } = effectivePerShare(input)
  const vol = parseDecimal(form.volatilityOverride)
  return {
    ticker: form.ticker.trim().toUpperCase(),
    name: form.name.trim(),
    shares: parseDecimal(form.shares),
    costBasisPerShare: basis,
    purchaseDate: form.purchaseDate,
    currentPrice: price,
    volatilityOverride: vol > 0 ? vol : undefined,
  }
}
