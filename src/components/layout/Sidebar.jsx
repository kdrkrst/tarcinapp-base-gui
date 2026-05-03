import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../data/navigation'
import { useApp } from '../../context/AppContext'

function NavIcon({ path }) {
  return (
    <svg
      className="w-5 h-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

export default function Sidebar() {
  const { currentUser, useDummyData } = useApp()

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 border-r border-slate-800">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-none">Tarcinapp</p>
          <p className="text-slate-400 text-xs mt-0.5">Entity Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Navigation
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`
            }
          >
            <NavIcon path={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Active user / dummy data indicator */}
      <div className="px-4 py-4 border-t border-slate-800 space-y-2">
        {useDummyData && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-900/40 border border-amber-700/50">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300 font-medium">Dummy Data Active</span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-slate-300">
              {currentUser.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm text-slate-200 font-medium truncate">{currentUser.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {currentUser.token ? 'Authenticated' : 'No Auth'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
