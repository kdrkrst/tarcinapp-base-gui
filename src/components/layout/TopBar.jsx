import { useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec } from '../../utils/oasParser'

export default function TopBar() {
  const location = useLocation()
  const { oasSpec, endpoint, setEndpoint, serverOptions, token } = useApp()
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
      {/* Page title */}
      <h1 className="text-base font-semibold text-slate-100">{getTitle()}</h1>

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

        {oasSpec && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700">
            <span className="text-xs text-slate-400">
              {oasSpec.info?.title ?? 'API'}{' '}
              <span className="text-slate-500">v{oasSpec.info?.version ?? '?'}</span>
            </span>
          </div>
        )}
      </div>
    </header>
  )
}

