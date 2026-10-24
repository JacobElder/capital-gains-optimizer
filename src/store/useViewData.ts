import { useMemo } from 'react'
import { format } from 'date-fns'
import { useAppStore } from './useAppStore'
import { anonymizePortfolio, generateSamplePortfolio, type ViewData } from '../lib/demoData'
import type { FutureVestLot, Position, PrivacySettings, UserSettings } from '../types'

export interface ViewSource {
  positions: Position[]
  futureVests: FutureVestLot[]
  settings: UserSettings
  privacy: PrivacySettings
}

/**
 * The data every view should render, as a pure function of the store state.
 * In demo mode this is an anonymized or synthetic copy; the real portfolio is
 * never modified. An unknown mode falls back to the real data, not a demo.
 */
export function selectViewData(state: ViewSource, today: Date): ViewData & { isDemo: boolean } {
  const { positions, futureVests, settings, privacy } = state
  const real = { positions, futureVests, settings }
  switch (privacy.mode) {
    case 'anonymize':
      return { ...anonymizePortfolio(real, privacy.seed, privacy.maskTickers, today), isDemo: true }
    case 'sample':
      return { ...generateSamplePortfolio(privacy.seed, settings, today, positions), isDemo: true }
    default:
      return { ...real, isDemo: false }
  }
}

export function useViewData(): ViewData & { isDemo: boolean } {
  const positions = useAppStore(s => s.positions)
  const futureVests = useAppStore(s => s.futureVests)
  const settings = useAppStore(s => s.settings)
  const privacy = useAppStore(s => s.privacy)
  // Recompute at most once per day so date-relative jitter stays stable
  const day = format(new Date(), 'yyyy-MM-dd')

  return useMemo(
    () => selectViewData({ positions, futureVests, settings, privacy }, new Date(`${day}T12:00:00`)),
    [positions, futureVests, settings, privacy, day],
  )
}
