import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Position, UserSettings, FutureVestLot, PrivacySettings } from '../types'
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

// `?demo` in the URL opens straight into the sample portfolio, so a shared
// link never shows whatever happens to be in the viewer's localStorage.
const demoFromUrl = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('demo')

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: {
        filingStatus: 'single',
        annualTaxableIncome: 150_000,
        stateCode: 'NY',
        nycResident: false,
      },
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
      partialize: (s) => ({ settings: s.settings, positions: s.positions, futureVests: s.futureVests, privacy: s.privacy }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AppState>) }
        merged.privacy = { ...current.privacy, ...(persisted as Partial<AppState>)?.privacy }
        if (demoFromUrl) merged.privacy = { ...merged.privacy, mode: 'sample' }
        return merged
      },
    }
  )
)
