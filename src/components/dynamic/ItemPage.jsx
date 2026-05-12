import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec } from '../../utils/oasParser'
import { useApiClient } from '../../services/apiClient'
import { useResourceList } from '../../hooks/useResourceList'
import Toast from '../ui/Toast'

function buildItemPath(template, id) {
  return template.replace(/\{[^}]+\}/, encodeURIComponent(id))
}

export default function ItemPage() {
  const { tagSlug, itemId } = useParams()
  const navigate = useNavigate()
  const { oasSpec } = useApp()
  const api = useApiClient()
  const { navItems } = parseOasSpec(oasSpec)
  const navItem = navItems.find((n) => n.id === tagSlug)

  const itemPath = useMemo(() => {
    if (!navItem?.itemPathTemplate || !itemId) return null
    return buildItemPath(navItem.itemPathTemplate, itemId)
  }, [navItem?.itemPathTemplate, itemId])

  const fetcher = useCallback(() => {
    if (!itemPath) return Promise.resolve([])
    return api.get(itemPath).then((obj) => [obj])
  }, [api, itemPath])

  const { data, loading, error, refresh } = useResourceList(fetcher)
  const item = data[0] ?? {}
  const [bodyText, setBodyText] = useState('{}')
  const [actionError, setActionError] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [acting, setActing] = useState(false)
  const [toastError, setToastError] = useState(null)

  useEffect(() => {
    if (!toastError) return undefined

    const timeoutId = window.setTimeout(() => {
      setToastError(null)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toastError])

  if (!navItem || !itemPath) {
    return <div className="text-slate-400 text-sm p-4">Item route is not available for this resource.</div>
  }

  async function runAction(type) {
    setActionError(null)
    setActionSuccess(null)
    setActing(true)
    try {
      if (type === 'delete') {
        await api.del(itemPath)
        setActionSuccess('Deleted successfully')
        navigate(`/r/${tagSlug}`)
        return
      }

      const payload = JSON.parse(bodyText || '{}')
      if (type === 'patch') {
        await api.patch(itemPath, payload)
        setActionSuccess('PATCH successful')
      } else if (type === 'put') {
        await api.put(itemPath, payload)
        setActionSuccess('PUT successful')
      }
      await refresh()
    } catch (err) {
      const message = err?.message ?? 'Operation failed'
      setActionError(message)
      setToastError(message)
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => navigate(`/r/${tagSlug}`)}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
        >
          Back to list
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-200">Current item (GET)</h3>
          <button
            onClick={refresh}
            className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <pre className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-auto max-h-[360px]">
            {JSON.stringify(item, null, 2)}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-200">Single item operations</h3>

        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={10}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={`{\n  "_name": "Updated name"\n}`}
        />

        <div className="flex flex-wrap gap-2">
          {navItem.itemMethods.includes('patch') && (
            <button
              onClick={() => runAction('patch')}
              disabled={acting}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
            >
              PATCH
            </button>
          )}

          {navItem.itemMethods.includes('put') && (
            <button
              onClick={() => runAction('put')}
              disabled={acting}
              className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
            >
              PUT
            </button>
          )}

          {navItem.itemMethods.includes('delete') && (
            <button
              onClick={() => runAction('delete')}
              disabled={acting}
              className="px-3 py-1.5 text-sm rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white"
            >
              DELETE
            </button>
          )}
        </div>

        {actionError && <p className="text-red-400 text-sm">{actionError}</p>}
        {actionSuccess && <p className="text-emerald-400 text-sm">{actionSuccess}</p>}
      </div>

      <Toast message={toastError} onClose={() => setToastError(null)} type="error" />
    </div>
  )
}
