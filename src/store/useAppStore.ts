import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Position, UserSettings, FutureVestLot, PrivacySettings, PrivacyMode, FilingStatus } from '../types'
import { newSeed } from '../lib/demoData'

interface AppState {
  settings: UserSettings
  positions: Position[]
  futureVests: FutureVestLot[]
  privacy: PrivacySettings
  editingPositionId: string | null
  isAddingPosition: boolean

  setSettings: (updates: Partial<UserSettings>) => void
  addPosition: (p: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>) => void
  updatePosition: (id: string, updates: Partial<Omit<Position, 'id' | 'createdAt'>>) => void
  deletePosition: (id: string) => void
  clearPositions: () => void
  setFutureVests: (vests: FutureVestLot[]) => void
  clearFutureVests: () => void
  setEditingPositionId: (id: string | null) => void
  setIsAddingPosition: (val: boolean) => void
  setPrivacy: (updates: Partial<PrivacySettings>) => void
  reshuffleDemo: () => void
}

/**
 * `?demo` in the URL opens straight into the sample portfolio, so a shared
 * link never shows whatever happens to be in the viewer's localStorage.
 * `?demo=0` / `?demo=false` / `?demo=off` mean no.
 */
export function isDemoParam(search: string): boolean {
  const value = new URLSearchParams(search).get('demo')
  if (value == null) return false
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

const demoFromUrl = typeof window !== 'undefined' && isDemoParam(window.location.search)

export const DEFAULT_SETTINGS: UserSettings = {
  filingStatus: 'single',
  annualTaxableIncome: 150_000,
  stateCode: 'NY',
  nycResident: false,
}

type Persisted = Pick<AppState, 'settings' | 'positions' | 'futureVests' | 'privacy'>

const FILING_STATUSES: FilingStatus[] = ['single', 'mfj', 'mfs', 'hoh']
const PRIVACY_MODES: PrivacyMode[] = ['off', 'anonymize', 'sample']
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const str = (x: unknown): x is string => typeof x === 'string'

function sanitizeSettings(raw: unknown, fallback: UserSettings): UserSettings {
  const r = isObj(raw) ? raw : {}
  return {
    filingStatus: FILING_STATUSES.includes(r.filingStatus as FilingStatus) ? r.filingStatus as FilingStatus : fallback.filingStatus,
    annualTaxableIncome: finite(r.annualTaxableIncome) && r.annualTaxableIncome >= 0 ? r.annualTaxableIncome : fallback.annualTaxableIncome,
    stateCode: str(r.stateCode) && r.stateCode ? r.stateCode : fallback.stateCode,
    nycResident: typeof r.nycResident === 'boolean' ? r.nycResident : fallback.nycResident,
  }
}

/** Keeps saved lots that have the required fields; drops entries that would crash the views. */
function sanitizePositions(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is Position => isObj(p)
    && str(p.id) && str(p.ticker) && str(p.purchaseDate)
    && finite(p.shares) && finite(p.costBasisPerShare) && finite(p.currentPrice))
    .map(p => ({
      ...p,
      name: str(p.name) ? p.name : p.ticker,
      createdAt: str(p.createdAt) ? p.createdAt : '',
      updatedAt: str(p.updatedAt) ? p.updatedAt : '',
      volatilityOverride: finite(p.volatilityOverride) && p.volatilityOverride > 0 ? p.volatilityOverride : undefined,
    }))
}

function sanitizeVests(raw: unknown): FutureVestLot[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is FutureVestLot => isObj(v)
    && str(v.id) && str(v.ticker) && str(v.vestDate) && finite(v.sharesGross))
    .map(v => ({
      ...v,
      name: str(v.name) ? v.name : v.ticker,
      awardId: str(v.awardId) ? v.awardId : '',
      awardDate: str(v.awardDate) ? v.awardDate : '',
    }))
}

function sanitizePrivacy(raw: unknown, fallback: PrivacySettings): PrivacySettings {
  const r = isObj(raw) ? raw : {}
  return {
    mode: PRIVACY_MODES.includes(r.mode as PrivacyMode) ? r.mode as PrivacyMode : fallback.mode,
    seed: finite(r.seed) ? r.seed : fallback.seed,
    maskTickers: typeof r.maskTickers === 'boolean' ? r.maskTickers : fallback.maskTickers,
  }
}

/**
 * Rehydration: field-by-field merge of saved data over the defaults, so a save
 * from an older version (missing fields) or a corrupted one (wrong types)
 * still loads. With `demo`, the session opens in sample mode.
 */
export function mergePersisted<T extends Persisted>(persisted: unknown, current: T, demo: boolean): T {
  const p = isObj(persisted) ? persisted : {}
  const privacy = sanitizePrivacy(p.privacy, current.privacy)
  return {
    ...current,
    settings: sanitizeSettings(p.settings, current.settings),
    positions: 'positions' in p ? sanitizePositions(p.positions) : current.positions,
    futureVests: 'futureVests' in p ? sanitizeVests(p.futureVests) : current.futureVests,
    privacy: demo ? { ...privacy, mode: 'sample' } : privacy,
  }
}

// Privacy mode as it was saved before a `?demo` link forced sample mode. A demo
// session writes this back instead, so visiting the link once does not leave
// the app stuck in sample mode on later visits.
let savedPrivacyMode: PrivacyMode = 'off'

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_SETTINGS },
      positions: [],
      futureVests: [],
      privacy: { mode: 'off', seed: newSeed(), maskTickers: true },
      editingPositionId: null,
      isAddingPosition: false,

      setSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      addPosition: (p) => {
        const now = new Date().toISOString()
        set((s) => ({
          positions: [
            ...s.positions,
            { ...p, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
          ],
        }))
      },

      updatePosition: (id, updates) => {
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p
          ),
        }))
      },

      deletePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),

      clearPositions: () => set({ positions: [] }),

      setFutureVests: (vests) => set({ futureVests: vests }),
      clearFutureVests: () => set({ futureVests: [] }),

      setEditingPositionId: (id) => set({ editingPositionId: id }),
      setIsAddingPosition: (val) => set({ isAddingPosition: val }),

      setPrivacy: (updates) =>
        set((s) => ({ privacy: { ...s.privacy, ...updates } })),
      reshuffleDemo: () =>
        set((s) => ({ privacy: { ...s.privacy, seed: newSeed() } })),
    }),
    {
      name: 'capital-gains-optimizer',
      partialize: (s) => ({
        settings: s.settings,
        positions: s.positions,
        futureVests: s.futureVests,
        privacy: demoFromUrl ? { ...s.privacy, mode: savedPrivacyMode } : s.privacy,
      }),
      merge: (persisted, current) => {
        savedPrivacyMode = sanitizePrivacy(isObj(persisted) ? persisted.privacy : undefined, current.privacy).mode
        return mergePersisted(persisted, current, demoFromUrl)
      },
    }
  )
)
