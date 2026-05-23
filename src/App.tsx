import { useState } from 'react'
import Header from './components/layout/Header'
import SettingsPanel from './components/layout/SettingsPanel'
import PositionList from './components/positions/PositionList'
import FutureVestingView from './components/vesting/FutureVestingView'
import { useAppStore } from './store/useAppStore'

type Tab = 'positions' | 'vesting'

export default function App() {
  const [tab, setTab] = useState<Tab>('positions')
  const futureVests = useAppStore(s => s.futureVests)

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <SettingsPanel />

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('positions')}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'positions'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Portfolio
          </button>
          <button
            onClick={() => setTab('vesting')}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'vesting'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Future Vests
            {futureVests.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                tab === 'vesting' ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
                {futureVests.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'positions' ? <PositionList /> : <FutureVestingView />}
      </main>
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-slate-700">
        Capital gains tax data reflects 2025 federal and state rates. This tool is for planning purposes only
        and does not constitute tax advice. Consult a qualified CPA or tax attorney before making investment decisions.
      </footer>
    </div>
  )
}
