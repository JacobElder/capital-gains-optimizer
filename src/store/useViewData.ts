import { useMemo } from 'react'
import { format } from 'date-fns'
import { useAppStore } from './useAppStore'
import { anonymizePortfolio, generateSamplePortfolio, type ViewData } from '../lib/demoData'

/**
 * The data every view should render. In demo mode this is an anonymized or
 * synthetic copy; the real portfolio in the store is never modified.
 */
export function useViewData(): ViewData & { isDemo: boolean } {
  const positions = useAppStore(s => s.positions)
  const futureVests = useAppStore(s => s.futureVests)
  const settings = useAppStore(s => s.settings)
  const privacy = useAppStore(s => s.privacy)
  // Recompute at most once per day so date-relative jitter stays stable
  const day = format(new Date(), 'yyyy-MM-dd')

  return useMemo(() => {
    const real = { positions, futureVests, settings }
    switch (privacy.mode) {
      case 'anonymize':
        return { ...anonymizePortfolio(real, privacy.seed, privacy.maskTickers), isDemo: true }
      case 'sample':
        return { ...generateSamplePortfolio(privacy.seed, settings, new Date(), positions), isDemo: true }
      default:
        return { ...real, isDemo: false }
    }
  }, [positions, futureVests, settings, privacy, day])
}
