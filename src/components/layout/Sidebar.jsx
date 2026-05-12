import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec } from '../../utils/oasParser'

function NavIcon({ d, size = 'w-4 h-4' }) {
  return (
    <svg
      className={`${size} flex-shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

export default function Sidebar() {
  const { oasSpec, disconnect } = useApp()
  const { navItems } = oasSpec ? parseOasSpec(oasSpec) : { navItems: [] }
  const [expanded, setExpanded] = useState({})

  function toggle(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 border-r border-slate-800">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="overflow-hidden">
          <p className="text-white font-semibold text-sm leading-none">Tarcinapp</p>
          <p className="text-slate-400 text-xs mt-0.5 truncate">
            {oasSpec?.info?.title ?? 'Entity Platform'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Dashboard */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
              isActive
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`
          }
        >
          <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          Dashboard
        </NavLink>

        {navItems.length > 0 && (
          <p className="px-2 mt-4 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Resources
          </p>
        )}

        {navItems.map((item) => (
          <div key={item.id}>
            <div className="flex items-center">
              <NavLink
                to={item.routePath}
                className={({ isActive }) =>
                  `flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }
              >
                <NavIcon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                {item.label}
              </NavLink>

              {item.children.length > 0 && (
                <button
                  onClick={() => toggle(item.id)}
                  className="p-1.5 mr-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={expanded[item.id] ? 'Collapse' : 'Expand'}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded[item.id] ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>

            {expanded[item.id] && item.children.length > 0 && (
              <div className="ml-4 mt-0.5 pl-2 border-l border-slate-800 space-y-0.5">
                {item.children.map((child) => (
                  <NavLink
                    key={child.id}
                    to={child.routePath}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-600/80 text-white font-medium'
                          : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                      }`
                    }
                  >
                    <NavIcon d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Disconnect */}
      <div className="px-4 py-4 border-t border-slate-800">
        <button
          onClick={disconnect}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Disconnect
        </button>
      </div>
    </aside>
  )
}

