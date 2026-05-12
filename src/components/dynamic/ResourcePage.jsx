import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec, deriveColumns, resolvePaginationQueryKeys } from '../../utils/oasParser'
import { useApiClient } from '../../services/apiClient'
import { useResourceList } from '../../hooks/useResourceList'
import DataGrid from '../ui/DataGrid'
import Toast from '../ui/Toast'

const STATUS_OPTIONS = [
  { key: 'actives', label: 'Actives' },
  { key: 'pendings', label: 'Pendings' },
  { key: 'expireds', label: 'Expireds' },
]

const VISIBILITY_OPTIONS = [
  { key: 'publics', label: 'Public' },
  { key: 'protecteds', label: 'Protected' },
  { key: 'privates', label: 'Private' },
]

function buildItemPath(template, id) {
  return template.replace(/\{[^}]+\}/, encodeURIComponent(id))
}

function toggleSelection(selectedValues, value) {
  return selectedValues.includes(value)
    ? selectedValues.filter((entry) => entry !== value)
    : [...selectedValues, value]
}

function buildSetQuery(queryString, statusSelections, visibilitySelections) {
  const groups = []
  if (statusSelections.length) groups.push(statusSelections)
  if (visibilitySelections.length) groups.push(visibilitySelections)

  if (!groups.length) return queryString

  if (groups.length === 1) {
    const [group] = groups
    if (group.length === 1) {
      queryString.set(`set[${group[0]}]`, 'true')
      return queryString
    }

    group.forEach((entry, index) => {
      queryString.set(`set[or][${index}][${entry}]`, 'true')
    })
    return queryString
  }

  groups.forEach((group, groupIndex) => {
    group.forEach((entry, entryIndex) => {
      queryString.set(`set[and][${groupIndex}][or][${entryIndex}][${entry}]`, 'true')
    })
  })

  return queryString
}

function formatQueryPreview(queryString) {
  const entries = []
  queryString.forEach((value, key) => {
    entries.push(value === '' ? key : `${key}=${value}`)
  })
  return entries.length ? `?${entries.join('&')}` : ''
}

export default function ResourcePage() {
  const { tagSlug } = useParams()
  const navigate = useNavigate()
  const { oasSpec } = useApp()
  const { get, post, del } = useApiClient()
  const [statusSelections, setStatusSelections] = useState(['actives'])
  const [visibilitySelections, setVisibilitySelections] = useState([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [queryCopied, setQueryCopied] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPayload, setCreatePayload] = useState('{}')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [toastError, setToastError] = useState(null)

  const { navItems } = parseOasSpec(oasSpec)
  const navItem = navItems.find((n) => n.id === tagSlug)

  const canCreate = navItem?.collectionMethods?.includes('post')
  const canDeleteItem = navItem?.itemPathTemplate && navItem?.itemMethods?.includes('delete')

  const paginationKeys = useMemo(
    () => resolvePaginationQueryKeys(oasSpec, navItem?.collectionPath, 'get'),
    [oasSpec, navItem?.collectionPath]
  )

  const hasAnySetSelection = statusSelections.length > 0 || visibilitySelections.length > 0

  const querySummary = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set(paginationKeys.limitKey, String(pageSize))
    qs.set(paginationKeys.skipKey, String(page * pageSize))
    buildSetQuery(qs, statusSelections, visibilitySelections)
    return formatQueryPreview(qs)
  }, [page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections])

  useEffect(() => {
    setPage(0)
  }, [navItem?.collectionPath, statusSelections, visibilitySelections])

  useEffect(() => {
    setQueryCopied(false)
  }, [querySummary])

  useEffect(() => {
    if (!queryCopied) return undefined

    const timeoutId = window.setTimeout(() => {
      setQueryCopied(false)
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [queryCopied])

  useEffect(() => {
    if (!toastError) return undefined

    const timeoutId = window.setTimeout(() => {
      setToastError(null)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toastError])

  const fetcher = useCallback(() => {
    if (!navItem?.collectionPath) return Promise.resolve([])
    if (!hasAnySetSelection) return Promise.resolve([])

    const qs = new URLSearchParams()
    qs.set(paginationKeys.limitKey, String(pageSize))
    qs.set(paginationKeys.skipKey, String(page * pageSize))
    buildSetQuery(qs, statusSelections, visibilitySelections)

    return get(`${navItem.collectionPath}?${qs.toString()}`)
  }, [get, hasAnySetSelection, navItem?.collectionPath, page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections])

  const { data, loading, error, refresh } = useResourceList(fetcher)

  const handleDeleteRow = useCallback(
    async (row) => {
      try {
        setToastError(null)
        const id = row?._id ?? row?.id
        if (!id || !navItem?.itemPathTemplate) return
        await del(buildItemPath(navItem.itemPathTemplate, id))
        await refresh()
      } catch (err) {
        setToastError(err?.message ?? 'Delete failed')
      }
    },
    [del, navItem?.itemPathTemplate, refresh]
  )

  const columns = useMemo(() => {
    const base = deriveColumns(data)

    if (canDeleteItem) {
      base.push({
        key: '__actions',
        label: 'Actions',
        render: (_, row) => (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteRow(row)
            }}
            className="px-2.5 py-1 text-xs rounded-md bg-rose-900/50 hover:bg-rose-800 text-rose-200 border border-rose-800"
          >
            Delete
          </button>
        ),
      })
    }

    return base
  }, [data, canDeleteItem, handleDeleteRow])

  const hasNextPage = data.length === pageSize

  const handleRowClick = useCallback(
    (row) => {
      if (!navItem?.itemPathTemplate) return
      const id = row?._id ?? row?.id
      if (!id) return
      navigate(`/r/${tagSlug}/item/${encodeURIComponent(id)}`)
    },
    [navigate, navItem?.itemPathTemplate, tagSlug]
  )

  const handleCreate = useCallback(async () => {
    if (!navItem?.collectionPath) return
    setCreateError(null)
    setCreating(true)
    try {
      const payload = JSON.parse(createPayload || '{}')
      await post(navItem.collectionPath, payload)
      setCreateOpen(false)
      setCreatePayload('{}')
      await refresh()
    } catch (err) {
      setCreateError(err?.message ?? 'Create failed')
    } finally {
      setCreating(false)
    }
  }, [post, navItem?.collectionPath, createPayload, refresh])

  const handleCopyQuery = useCallback(async () => {
    if (!querySummary) return
    try {
      await navigator.clipboard.writeText(querySummary)
      setQueryCopied(true)
    } catch {
      // clipboard access can fail if permissions are denied
    }
  }, [querySummary])

  if (!navItem) {
    return (
      <div className="text-slate-400 text-sm p-4">
        Resource not found: <code className="font-mono bg-slate-800 px-1 rounded">{tagSlug}</code>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
            {STATUS_OPTIONS.map((option) => {
              const selected = statusSelections.includes(option.key)
              return (
                <button
                  key={option.key}
                  onClick={() => setStatusSelections((current) => toggleSelection(current, option.key))}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = visibilitySelections.includes(option.key)
              return (
                <button
                  key={option.key}
                  onClick={() => setVisibilitySelections((current) => toggleSelection(current, option.key))}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                onClick={() => setCreateOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-700 hover:bg-blue-600 border border-blue-600 text-white transition-colors"
              >
                Add New
              </button>
            )}

            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>

            {hasAnySetSelection && (
              <div className="relative group">
                <button
                  onClick={handleCopyQuery}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                    queryCopied
                      ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={queryCopied ? 'Copied query' : 'Copy query'}
                  aria-label="Copy query"
                >
                  {queryCopied ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                <div className="pointer-events-none absolute right-0 top-full z-10 mt-2 hidden w-[min(36rem,80vw)] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs text-slate-300 font-mono shadow-xl break-all group-hover:block">
                  {querySummary}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <p className="text-sm text-slate-300">Create new item (JSON body)</p>
          <textarea
            rows={10}
            value={createPayload}
            onChange={(e) => setCreatePayload(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setCreateOpen(false)}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
            >
              Cancel
            </button>
          </div>
          {createError && <p className="text-red-400 text-sm">{createError}</p>}
        </div>
      )}

      <DataGrid
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRefresh={refresh}
        onRowClick={navItem?.itemPathTemplate ? handleRowClick : undefined}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {!loading && !error && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>
                {hasAnySetSelection
                  ? `${data.length} record(s) returned`
                  : 'No set filters selected · no backend request'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage || loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <label className="text-xs text-slate-400 flex items-center gap-1.5">
            Page size
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-300"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-500 font-mono">
            page={page + 1} offset={page * pageSize}
          </span>
        </div>
      </div>

      <Toast message={toastError} onClose={() => setToastError(null)} type="error" />
    </div>
  )
}
