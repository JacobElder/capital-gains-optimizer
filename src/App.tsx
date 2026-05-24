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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        <SettingsPanel />

        {/* Tab bar */}
        <div className="flex gap-0 bg-white border border-slate-200 rounded-lg p-0.5 w-fit shadow-sm">
          <button
            onClick={() => setTab('positions')}
            className={`text-sm px-5 py-2 rounded-md font-medium transition-colors ${
              tab === 'positions'
                ? 'bg-[#002B45] text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            Portfolio
          </button>
          <button
            onClick={() => setTab('vesting')}
            className={`text-sm px-5 py-2 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'vesting'
                ? 'bg-[#002B45] text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            Future Vests
            {futureVests.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                tab === 'vesting' ? 'bg-blue-300/20 text-blue-100' : 'bg-slate-200 text-slate-600'
              }`}>
                {futureVests.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'positions' ? <PositionList /> : <FutureVestingView />}
      </main>
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-slate-400 border-t border-slate-200 mt-6">
        Capital gains tax data reflects 2025 federal and state rates. This tool is for planning purposes only
        and does not constitute tax advice. Consult a qualified CPA or tax attorney before making investment decisions.
      </footer>
    </div>
  )
}
