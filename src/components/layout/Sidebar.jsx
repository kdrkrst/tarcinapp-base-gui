import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec } from '../../utils/oasParser'

// Icon path per base type — used as a visual indicator on each nav item
const BASE_TYPE_ICON = {
  entity:           'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  list:             'M4 6h16M4 10h16M4 14h16M4 18h16',
  relation:         'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  'entity-reaction':'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'list-reaction':  'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  unknown:          'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
}

const BASE_TYPE_LABEL = {
  entity:           'Entities',
  list:             'Lists',
  relation:         'Relations',
  'entity-reaction':'Entity Reactions',
  'list-reaction':  'List Reactions',
}

const BASE_TYPE_ORDER = ['entity', 'list', 'relation', 'entity-reaction', 'list-reaction']

/** Group navItems by baseType, preserving BASE_TYPE_ORDER. Unknown types go last. */
function groupByBaseType(navItems) {
  const groups = {}
  for (const item of navItems) {
    const key = item.baseType ?? 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  const orderedKeys = [
    ...BASE_TYPE_ORDER.filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !BASE_TYPE_ORDER.includes(k)),
  ]
  return orderedKeys.map((key) => ({ baseType: key, items: groups[key] }))
}

function NavIcon({ d, size = 'w-3.5 h-3.5' }) {
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

export default function Sidebar({ collapsed = false, onToggle }) {
  const { oasSpec, disconnect, retry, bypassCache, setBypassCache } = useApp()
  const { navItems } = oasSpec ? parseOasSpec(oasSpec) : { navItems: [] }
  const [expanded, setExpanded] = useState({})
  const navGroups = groupByBaseType(navItems)

  function toggle(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside
      className={`flex flex-col min-h-screen bg-slate-900 border-r border-slate-800 transition-all duration-200 flex-shrink-0 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Brand */}
      <div className={`flex items-center border-b border-slate-800 ${collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-5 py-3'}`}>
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-semibold text-sm leading-none">Tarcinapp</p>
            <p className="text-slate-400 text-xs mt-0.5 truncate">
              {oasSpec?.info?.title ?? 'Entity Platform'}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-2 space-y-0 overflow-y-auto ${collapsed ? 'px-1.5' : 'px-2'}`}>
        {/* Dashboard */}
        <NavLink
          to="/"
          end
          title={collapsed ? 'Dashboard' : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-md text-xs transition-all duration-150 ${
              collapsed ? 'justify-center px-0 py-1.5' : 'gap-2 px-2.5 py-1.5'
            } ${
              isActive
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`
          }
        >
          <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          {!collapsed && 'Dashboard'}
        </NavLink>

        {navGroups.map(({ baseType, items }) => (
          <div key={baseType}>
            {!collapsed && (
              <p className="px-2 pt-3 pb-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {BASE_TYPE_LABEL[baseType] ?? baseType}
              </p>
            )}
            {items.map((item) => {
              const iconPath = BASE_TYPE_ICON[item.baseType ?? 'unknown'] ?? BASE_TYPE_ICON.unknown
              return (
                <div key={item.id}>
                  <div className="flex items-center">
                    <NavLink
                      to={item.routePath}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center rounded-md text-xs transition-all duration-150 ${
                          collapsed ? 'flex-1 justify-center px-0 py-1.5' : 'flex-1 gap-2 px-2.5 py-1.5'
                        } ${
                          isActive
                            ? 'bg-blue-600 text-white font-medium'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        }`
                      }
                    >
                      <NavIcon d={iconPath} />
                      {!collapsed && item.label}
                    </NavLink>

                    {!collapsed && item.children.length > 0 && (
                      <button
                        onClick={() => toggle(item.id)}
                        className="p-1 mr-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
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

                  {!collapsed && expanded[item.id] && item.children.length > 0 && (
                    <div className="ml-3 mt-0 pl-2 border-l border-slate-800 space-y-0">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.id}
                          to={child.routePath}
                          className={({ isActive }) =>
                            `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-150 ${
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
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className={`py-3 border-t border-slate-800 ${collapsed ? 'flex flex-col items-center gap-1 px-2' : 'flex flex-row items-center gap-1 px-3'}`}>
        <button
          onClick={retry}
          title="Reload OAS spec"
          aria-label="Reload OAS spec"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={() => setBypassCache(!bypassCache)}
          title={bypassCache ? 'Cache bypass ON — click to enable cache' : 'Cache enabled — click to bypass'}
          aria-pressed={bypassCache}
          aria-label="Toggle cache"
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
            bypassCache ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
        </button>

        <button
          onClick={disconnect}
          title="Disconnect"
          aria-label="Disconnect"
          className={`flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors${collapsed ? '' : ' ml-auto'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

