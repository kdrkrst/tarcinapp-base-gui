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
  const [tab, setTab] = useState('view')
  const [bodyText, setBodyText] = useState('{}')
  const [actionError, setActionError] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [acting, setActing] = useState(false)
  const [toastError, setToastError] = useState(null)

  useEffect(() => {
    if (!toastError) return undefined
    const timeoutId = window.setTimeout(() => setToastError(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [toastError])

  function close() {
    navigate(`/r/${tagSlug}`)
  }

  async function runAction(type) {
    setActionError(null)
    setActionSuccess(null)
    setActing(true)
    try {
      if (type === 'delete') {
        await api.del(itemPath)
        close()
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

  if (!navItem || !itemPath) return null

  const hasEdit = navItem.itemMethods?.some((m) => ['patch', 'put', 'delete'].includes(m))
  const decodedId = decodeURIComponent(itemId ?? '')

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-slate-900 border border-slate-700 shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 flex-shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">{navItem.label}</h2>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[380px]">{decodedId}</p>
            </div>
            <button
              onClick={close}
              className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-slate-700 flex-shrink-0 px-5">
            {['view', ...(hasEdit ? ['edit'] : [])].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2.5 px-1 mr-5 text-xs font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'view' ? 'View' : 'Edit'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {tab === 'view' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">Fields</span>
                  <button
                    onClick={refresh}
                    className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    title="Refresh"
                    aria-label="Refresh"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                {loading ? (
                  <p className="text-slate-400 text-sm">Loading…</p>
                ) : error ? (
                  <p className="text-red-400 text-sm">{error}</p>
                ) : (
                  <>
                    {/* Business fields: _name first, then non-underscore fields */}
                    <div className="space-y-3">
                      {'_name' in item && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Name</p>
                          <p className="text-sm text-slate-200">{item._name ?? '—'}</p>
                        </div>
                      )}
                      {Object.entries(item)
                        .filter(([k]) => !k.startsWith('_'))
                        .map(([key, val]) => (
                          <div key={key}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{key}</p>
                            <p className="text-sm text-slate-200 break-all">
                              {Array.isArray(val)
                                ? val.length === 0 ? '—' : val.join(', ')
                                : val === null || val === undefined ? '—'
                                : typeof val === 'object' ? JSON.stringify(val)
                                : String(val)}
                            </p>
                          </div>
                        ))}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-slate-700 pt-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Managed fields</p>
                      <div className="space-y-1.5">
                        {Object.entries(item)
                          .filter(([k]) => k.startsWith('_') && k !== '_name')
                          .map(([key, val]) => (
                            <div key={key} className="flex gap-3 items-baseline">
                              <span className="text-[11px] text-slate-500 font-mono w-44 shrink-0">{key}</span>
                              <span className="text-[11px] text-slate-300 break-all">
                                {Array.isArray(val)
                                  ? val.length === 0 ? '—' : val.join(', ')
                                  : val === null || val === undefined ? '—'
                                  : typeof val === 'object' ? JSON.stringify(val)
                                  : String(val)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'edit' && (
              <>
                <p className="text-xs text-slate-500">Request body (JSON)</p>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={10}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={'{\n  "_name": "Updated name"\n}'}
                />
                {actionError && <p className="text-red-400 text-xs">{actionError}</p>}
                {actionSuccess && <p className="text-emerald-400 text-xs">{actionSuccess}</p>}
              </>
            )}
          </div>

          {/* Footer */}
          {tab === 'edit' && (
            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-700 flex-shrink-0">
              {navItem.itemMethods.includes('patch') && (
                <button
                  onClick={() => runAction('patch')}
                  disabled={acting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                >
                  PATCH
                </button>
              )}
              {navItem.itemMethods.includes('put') && (
                <button
                  onClick={() => runAction('put')}
                  disabled={acting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                >
                  PUT
                </button>
              )}
              {navItem.itemMethods.includes('delete') && (
                <button
                  onClick={() => runAction('delete')}
                  disabled={acting}
                  className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white"
                >
                  DELETE
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <Toast message={toastError} onClose={() => setToastError(null)} type="error" />
    </>
  )
}
