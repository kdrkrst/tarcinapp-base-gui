import { useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec } from '../../utils/oasParser'

export default function TopBar({ onToggleSidebar }) {
  const location = useLocation()
  const { oasSpec, endpoint, setEndpoint, serverOptions, token, bypassCache, setBypassCache, retry } = useApp()
  const { navItems } = oasSpec ? parseOasSpec(oasSpec) : { navItems: [] }

  const endpointChoices =
    serverOptions.length > 0
      ? serverOptions
      : endpoint
        ? [{ url: endpoint, description: null }]
        : []

  const normalizedChoices = endpoint && !endpointChoices.some((s) => s.url === endpoint)
    ? [{ url: endpoint, description: 'Current' }, ...endpointChoices]
    : endpointChoices

  // Derive active page title from current route
  function getTitle() {
    if (location.pathname === '/') return 'Dashboard'
    const parts = location.pathname.split('/').filter(Boolean)
    // /r/:tagSlug/:subResource  or  /r/:tagSlug
    if (parts[0] === 'r') {
      const tagSlug = parts[1]
      const subResource = parts[2]
      const navItem = navItems.find((n) => n.id === tagSlug)
      if (navItem) {
        if (subResource) {
          const child = navItem.children.find(
            (c) => c.subResource === decodeURIComponent(subResource)
          )
          return child ? `${navItem.label} › ${child.label}` : navItem.label
        }
        return navItem.label
      }
    }
    return 'Dashboard'
  }

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-gray-950 border-b border-slate-800 flex-shrink-0">
      {/* Left: hamburger + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-slate-100">{getTitle()}</h1>
      </div>

      {/* Right: endpoint selector + auth indicator */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <label htmlFor="endpoint-select" className="sr-only">Endpoint</label>
          <select
            id="endpoint-select"
            value={endpoint ?? ''}
            onChange={(e) => setEndpoint(e.target.value || null)}
            className="bg-transparent text-xs text-slate-300 font-mono max-w-[280px] truncate focus:outline-none"
          >
            {normalizedChoices.map((s) => (
              <option key={s.url} value={s.url} className="bg-slate-900 text-slate-100">
                {s.description ? `${s.description} - ${s.url}` : s.url}
              </option>
            ))}
          </select>
        </div>

        {token && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-xs text-slate-300">Authenticated</span>
          </div>
        )}

        <button
          onClick={retry}
          title="Reload OAS spec from backend"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-xs font-medium">Reload</span>
        </button>

        <button
          onClick={() => setBypassCache(!bypassCache)}
          title={bypassCache ? 'Cache bypass ON — click to enable cache' : 'Cache enabled — click to bypass cache'}
          aria-pressed={bypassCache}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
            bypassCache
              ? 'bg-amber-900/40 border-amber-600/60 text-amber-400 hover:bg-amber-900/60'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
          <span className="text-xs font-medium">{bypassCache ? 'Cache OFF' : 'Cache ON'}</span>
        </button>


      </div>
    </header>
  )
}

