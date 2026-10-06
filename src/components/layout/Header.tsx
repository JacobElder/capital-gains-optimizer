import { useAppStore } from '../../store/useAppStore'
import { TAX_YEAR } from '../../data/federalTaxBrackets'
import type { PrivacyMode } from '../../types'

const MODE_LABELS: Record<PrivacyMode, string> = {
  off: 'My data',
  anonymize: 'Anonymized',
  sample: 'Sample portfolio',
}

export default function Header() {
  const privacy = useAppStore(s => s.privacy)
  const setPrivacy = useAppStore(s => s.setPrivacy)
  const reshuffleDemo = useAppStore(s => s.reshuffleDemo)
  const isDemo = privacy.mode !== 'off'

  return (
    <header className="bg-[#002B45] px-4 py-0">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 min-h-14 py-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1B6B3A] rounded flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="11,3 15,3 15,7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none tracking-tight">Capital Gains Optimizer</h1>
            <p className="text-xs text-blue-300/70 mt-0.5">STCG vs LTCG tax planning · {TAX_YEAR} rates</p>
          </div>
        </div>

        {/* Demo / privacy controls */}
        <div className="flex items-center gap-2 text-xs">
          {isDemo && (
            <span className="rounded bg-amber-400/90 text-[#002B45] font-bold px-2 py-0.5 tracking-wide">DEMO DATA</span>
          )}
          <label className="sr-only" htmlFor="privacy-mode">Data shown</label>
          <select
            id="privacy-mode"
            value={privacy.mode}
            onChange={e => setPrivacy({ mode: e.target.value as PrivacyMode })}
            className="bg-white/10 border border-white/20 text-white rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
            title="Show your real data, an anonymized copy of it, or an invented sample portfolio"
          >
            {(Object.keys(MODE_LABELS) as PrivacyMode[]).map(m => (
              <option key={m} value={m} className="text-slate-900">{MODE_LABELS[m]}</option>
            ))}
          </select>
          {privacy.mode === 'anonymize' && (
            <label className="flex items-center gap-1.5 text-blue-100 cursor-pointer">
              <input
                type="checkbox"
                checked={privacy.maskTickers}
                onChange={e => setPrivacy({ maskTickers: e.target.checked })}
                className="w-3.5 h-3.5 accent-[#1B6B3A]"
              />
              Mask tickers
            </label>
          )}
          {isDemo && (
            <button
              onClick={reshuffleDemo}
              className="border border-white/20 text-white hover:bg-white/10 rounded-md px-2.5 py-1.5 font-medium"
              title="Generate a different random version"
            >
              ↻ Reshuffle
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
