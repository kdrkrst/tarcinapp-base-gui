import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../../data/navigation'
import { useApp } from '../../context/AppContext'
import SettingsModal from '../settings/SettingsModal'

export default function TopBar() {
  const location = useLocation()
  const { currentUser, currentServer, useDummyData } = useApp()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const activeNav = NAV_ITEMS.find((n) =>
    n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path)
  )

  return (
    <>
      <header className="flex items-center justify-between h-14 px-6 bg-gray-950 border-b border-slate-800 flex-shrink-0">
        {/* Page title */}
        <div>
          <h1 className="text-base font-semibold text-slate-100">
            {activeNav?.label ?? 'Dashboard'}
          </h1>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Server badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700">
            <span className={`w-1.5 h-1.5 rounded-full ${useDummyData ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className="text-xs text-slate-300 font-mono truncate max-w-[200px]">
              {useDummyData ? 'dummy data' : currentServer.url}
            </span>
          </div>

          {/* User selector quick badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs text-slate-300 truncate max-w-[120px]">{currentUser.name}</span>
          </div>

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
