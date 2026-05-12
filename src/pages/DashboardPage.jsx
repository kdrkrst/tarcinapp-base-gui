import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { parseOasSpec } from '../utils/oasParser'
import { useApiClient } from '../services/apiClient'

function ResourceCard({ label, routePath, collectionPath, get }) {
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    get(collectionPath + '/count')
      .then((res) => {
        if (!cancelled) setCount(res?.count ?? '?')
      })
      .catch(() => {
        get(collectionPath)
          .then((res) => {
            if (!cancelled) setCount(Array.isArray(res) ? res.length : '?')
          })
          .catch(() => {
            if (!cancelled) setError(true)
          })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath])

  return (
    <Link
      to={routePath}
      className="block bg-slate-900 rounded-xl border border-slate-800 p-5 hover:border-slate-700 hover:bg-slate-800/50 transition-all group"
    >
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">{label}</p>
      {loading ? (
        <div className="h-9 w-20 bg-slate-800 rounded-lg animate-pulse" />
      ) : error ? (
        <p className="text-red-400 text-2xl font-bold">—</p>
      ) : (
        <p className="text-3xl font-bold text-white">{count}</p>
      )}
      <p className="text-xs text-slate-600 font-mono mt-2 truncate group-hover:text-slate-500 transition-colors">
        {collectionPath}
      </p>
    </Link>
  )
}

export default function DashboardPage() {
  const { oasSpec } = useApp()
  const { get } = useApiClient()
  const { navItems } = oasSpec ? parseOasSpec(oasSpec) : { navItems: [] }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Dashboard</h2>
        {oasSpec && (
          <p className="text-sm text-slate-400 mt-0.5">
            {oasSpec.info?.title ?? 'API Overview'}{' '}
            <span className="text-slate-600">·</span>{' '}
            v{oasSpec.info?.version ?? '—'}
          </p>
        )}
      </div>

      {navItems.length === 0 ? (
        <p className="text-slate-500 text-sm">No resources found in the OpenAPI spec.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {navItems.map((item) => (
            <ResourceCard
              key={item.id}
              label={item.label}
              routePath={item.routePath}
              collectionPath={item.collectionPath}
              get={get}
            />
          ))}
        </div>
      )}
    </div>
  )
}
