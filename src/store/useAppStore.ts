import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Position, UserSettings } from '../types'

interface AppState {
  settings: UserSettings
  positions: Position[]
  editingPositionId: string | null
  isAddingPosition: boolean

  setSettings: (updates: Partial<UserSettings>) => void
  addPosition: (p: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>) => void
  updatePosition: (id: string, updates: Partial<Omit<Position, 'id' | 'createdAt'>>) => void
  deletePosition: (id: string) => void
  clearPositions: () => void
  setEditingPositionId: (id: string | null) => void
  setIsAddingPosition: (val: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: {
        filingStatus: 'single',
        annualTaxableIncome: 150_000,
        stateCode: 'NY',
      },
      positions: [],
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

      setEditingPositionId: (id) => set({ editingPositionId: id }),
      setIsAddingPosition: (val) => set({ isAddingPosition: val }),
    }),
    {
      name: 'capital-gains-optimizer',
      partialize: (s) => ({ settings: s.settings, positions: s.positions }),
    }
  )
)
