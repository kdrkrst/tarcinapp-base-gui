import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/**
 * Toggles a field in the field selector state machine.
 * Modes:
 *   'all'     – all fields selected, no filter[fields] params
 *   'exclude' – some fields unchecked, send filter[fields][x]=false for excluded
 *   'none'    – all unchecked, no params
 *   'include' – some re-checked after none, send filter[fields][x]=true for included
 */
function toggleFieldSelection(fieldName, allFields, current) {
  const { mode, selected } = current

  if (mode === 'all') {
    return { mode: 'exclude', selected: new Set([fieldName]) }
  }

  if (mode === 'exclude') {
    const isChecked = !selected.has(fieldName)
    if (isChecked) {
      // unchecking → add to excludes
      const next = new Set(selected)
      next.add(fieldName)
      return next.size === allFields.length
        ? { mode: 'none', selected: new Set() }
        : { mode: 'exclude', selected: next }
    } else {
      // re-checking → remove from excludes
      const next = new Set(selected)
      next.delete(fieldName)
      return next.size === 0
        ? { mode: 'all', selected: new Set() }
        : { mode: 'exclude', selected: next }
    }
  }

  if (mode === 'none') {
    return { mode: 'include', selected: new Set([fieldName]) }
  }

  // mode === 'include'
  const isChecked = selected.has(fieldName)
  if (isChecked) {
    const next = new Set(selected)
    next.delete(fieldName)
    return next.size === 0
      ? { mode: 'none', selected: new Set() }
      : { mode: 'include', selected: next }
  } else {
    const next = new Set(selected)
    next.add(fieldName)
    return { mode: 'include', selected: next }
  }
}

function isFieldChecked(fieldName, fieldSelectorState) {
  const { mode, selected } = fieldSelectorState
  if (mode === 'all') return true
  if (mode === 'exclude') return !selected.has(fieldName)
  if (mode === 'none') return false
  return selected.has(fieldName) // 'include'
}

function buildFilterFieldsParams(qs, fieldSelectorState) {
  const { mode, selected } = fieldSelectorState
  if (mode === 'exclude') {
    for (const f of selected) qs.set(`filter[fields][${f}]`, 'false')
  } else if (mode === 'include') {
    for (const f of selected) qs.set(`filter[fields][${f}]`, 'true')
  }
}

function parseJwt(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function formatClaimValue(value) {
  if (value === null || value === undefined) return <span className="text-slate-500 italic">null</span>
  if (typeof value === 'boolean') return <span className="text-amber-400 font-mono">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-sky-400 font-mono">{value}</span>
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {value.map((v, i) => (
          <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">{String(v)}</span>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    return <span className="text-slate-400 font-mono text-[10px] break-all">{JSON.stringify(value)}</span>
  }
  return <span className="text-slate-300 font-mono break-all">{String(value)}</span>
}

function IdentityTab({ token }) {
  const claims = parseJwt(token)

  if (!token) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-xs">
        No token configured.
      </div>
    )
  }

  if (!claims) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-xs">
        Token is not a valid JWT.
      </div>
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const exp = typeof claims.exp === 'number' ? claims.exp : null
  const iat = typeof claims.iat === 'number' ? claims.iat : null
  const isExpired = exp !== null && now > exp

  const roles = claims.roles ?? claims.role ?? claims.realm_access?.roles ?? null
  const rolesArray = Array.isArray(roles) ? roles : (roles != null ? [roles] : null)

  const SPECIAL_KEYS = new Set(['roles', 'role', 'realm_access', 'exp', 'iat', 'nbf', 'sub', 'iss', 'aud', 'jti'])
  const genericClaims = Object.entries(claims).filter(([k]) => !SPECIAL_KEYS.has(k))

  function fmtTime(ts) {
    return new Date(ts * 1000).toLocaleString()
  }

  return (
    <div className="space-y-5">
      {/* Token status */}
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${isExpired ? 'bg-rose-800 text-rose-100' : 'bg-emerald-800 text-emerald-100'}`}>
          {isExpired ? 'Expired' : 'Valid'}
        </span>
        {exp !== null && (
          <span className="text-[10px] text-slate-500 font-mono">{isExpired ? 'Expired' : 'Expires'} {fmtTime(exp)}</span>
        )}
      </div>

      {/* Roles */}
      {rolesArray !== null && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Roles</p>
          <div className="flex flex-wrap gap-1.5">
            {rolesArray.length === 0
              ? <span className="text-xs text-slate-600 italic">No roles</span>
              : rolesArray.map((r) => (
                  <span key={r} className="px-2 py-0.5 text-xs rounded-md bg-violet-600/20 text-violet-300 border border-violet-700 font-mono">{r}</span>
                ))
            }
          </div>
        </div>
      )}

      {/* Subject / Issuer / Audience / JTI */}
      {(claims.sub || claims.iss || claims.aud || claims.jti) && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Identity</p>
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
            {[['sub', claims.sub], ['iss', claims.iss], ['aud', claims.aud], ['jti', claims.jti]]
              .filter(([, v]) => v != null)
              .map(([key, value]) => (
                <div key={key} className="px-3 py-1.5 bg-slate-950">
                  <p className="text-[10px] text-slate-500 font-mono">{key}</p>
                  <div className="text-xs mt-0.5">{formatClaimValue(value)}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      {(iat !== null || exp !== null || claims.nbf != null) && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Timestamps</p>
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
            {[['iat', iat], ['exp', exp], ['nbf', claims.nbf]]
              .filter(([, v]) => v != null)
              .map(([key, ts]) => (
                <div key={key} className="px-3 py-1.5 bg-slate-950">
                  <p className="text-[10px] text-slate-500 font-mono">{key}</p>
                  <p className="text-xs text-slate-300 font-mono">{fmtTime(ts)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* All other claims */}
      {genericClaims.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Claims</p>
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
            {genericClaims.map(([key, value]) => (
              <div key={key} className="px-3 py-1.5 bg-slate-950">
                <p className="text-[10px] text-slate-500 font-mono">{key}</p>
                <div className="text-xs mt-0.5">{formatClaimValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ResourcePage() {
  const { tagSlug } = useParams()
  const navigate = useNavigate()
  const { oasSpec, endpoint, token } = useApp()
  const { get, getWithMeta, post, del } = useApiClient()
  const [statusSelections, setStatusSelections] = useState([])
  const [visibilitySelections, setVisibilitySelections] = useState([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [queryInfoOpen, setQueryInfoOpen] = useState(false)
  const [queryDuration, setQueryDuration] = useState(null)
  const [responseHeaders, setResponseHeaders] = useState(null)
  const [responseStatus, setResponseStatus] = useState(null)
  const [curlMode, setCurlMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchDebounceRef = useRef(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPayload, setCreatePayload] = useState('{}')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [toastError, setToastError] = useState(null)
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false)
  // fieldSelectorState: { mode: 'all'|'exclude'|'none'|'include', selected: Set<string> }
  const [fieldSelectorState, setFieldSelectorState] = useState({ mode: 'all', selected: new Set() })
  const [selectedQ, setSelectedQ] = useState(null)
  const [qDropdownOpen, setQDropdownOpen] = useState(false)
  const qDropdownRef = useRef(null)
  const [queryInfoTab, setQueryInfoTab] = useState('request')
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [requestHeaders, setRequestHeaders] = useState(null)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  const { navItems } = parseOasSpec(oasSpec)
  const navItem = navItems.find((n) => n.id === tagSlug)

  const canCreate = navItem?.collectionMethods?.includes('post')
  const canDeleteItem = navItem?.itemPathTemplate && navItem?.itemMethods?.includes('delete')
  const showFieldSelector = !!(navItem?.hasFilterFields || navItem?.hasFieldset || navItem?.hasFields)
  const qEnumValues = navItem?.qEnumValues ?? null
  const [fieldSearch, setFieldSearch] = useState('')

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
    if (debouncedSearch) qs.set('s', debouncedSearch)
    if (selectedQ) qs.set('q', selectedQ)
    buildFilterFieldsParams(qs, fieldSelectorState)
    return formatQueryPreview(qs)
  }, [page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections, debouncedSearch, selectedQ, fieldSelectorState])

  useEffect(() => {
    setPage(0)
    setSearchInput('')
    setDebouncedSearch('')
    setFieldSelectorState({ mode: 'all', selected: new Set() })
    setSelectedQ(null)
    setQDropdownOpen(false)
  }, [navItem?.collectionPath, statusSelections, visibilitySelections])

  useEffect(() => {
    if (!toastError) return undefined

    const timeoutId = window.setTimeout(() => {
      setToastError(null)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toastError])

  useEffect(() => {
    if (!qDropdownOpen) return undefined
    const handleClickOutside = (e) => {
      if (qDropdownRef.current && !qDropdownRef.current.contains(e.target)) {
        setQDropdownOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [qDropdownOpen])

  useEffect(() => {
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(0)
    }, 350)
    return () => window.clearTimeout(searchDebounceRef.current)
  }, [searchInput])

  const fetcher = useCallback(async () => {
    if (!navItem?.collectionPath) return []

    const qs = new URLSearchParams()
    qs.set(paginationKeys.limitKey, String(pageSize))
    qs.set(paginationKeys.skipKey, String(page * pageSize))
    buildSetQuery(qs, statusSelections, visibilitySelections)
    if (debouncedSearch) qs.set('s', debouncedSearch)
    if (selectedQ) qs.set('q', selectedQ)
    buildFilterFieldsParams(qs, fieldSelectorState)

    const start = performance.now()
    const { data, headers, status, requestHeaders: reqHeaders } = await getWithMeta(`${navItem.collectionPath}?${qs.toString()}`)
    setQueryDuration(Math.round(performance.now() - start))
    setResponseHeaders(headers)
    setResponseStatus(status)
    setRequestHeaders(reqHeaders ?? null)
    return data ?? []
  }, [getWithMeta, navItem?.collectionPath, page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections, debouncedSearch, selectedQ, fieldSelectorState])

  const { data, loading, error, refresh } = useResourceList(fetcher)

  // Merge schema fields with fields discovered from actual response data
  const availableFields = useMemo(() => {
    const fromSchema = navItem?.availableFields ?? []
    const fromData = new Set()
    for (const row of data) {
      for (const k of Object.keys(row)) fromData.add(k)
    }
    const merged = new Set([...fromSchema, ...fromData])
    return [...merged].sort()
  }, [navItem?.availableFields, data])

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
    return deriveColumns(data)
  }, [data])

  const hasNextPage = data.length === pageSize

  const fullRequestUrl = `${endpoint ?? ''}${navItem?.collectionPath ?? ''}${querySummary}`

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

  const curlCommand = useMemo(() => {
    const lines = [`curl '${fullRequestUrl}'`]
    const hdrs = requestHeaders ?? (token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' })
    for (const [key, value] of Object.entries(hdrs)) {
      lines.push(`  -H '${key}: ${value}'`)
    }
    return lines.join(' \\\n')
  }, [fullRequestUrl, requestHeaders, token])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(curlMode ? curlCommand : fullRequestUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard permission denied
    }
  }, [curlMode, curlCommand, fullRequestUrl])

  const handleResizeMouseDown = useCallback((e) => {
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = sidebarWidth

    const onMouseMove = (ev) => {
      if (!isResizing.current) return
      const delta = resizeStartX.current - ev.clientX
      const next = Math.min(800, Math.max(240, resizeStartWidth.current + delta))
      setSidebarWidth(next)
    }

    const onMouseUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [sidebarWidth])

  if (!navItem) {
    return (
      <div className="text-slate-400 text-sm p-4">
        Resource not found: <code className="font-mono bg-slate-800 px-1 rounded">{tagSlug}</code>
      </div>
    )
  }

  return (
    <div className="flex -m-6 min-h-[calc(100vh-3.5rem)]">
      <div className="flex-1 p-6 min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {showFieldSelector && (
            <button
              onClick={() => setFieldSelectorOpen((v) => !v)}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border ${
                fieldSelectorOpen
                  ? 'bg-blue-700 border-blue-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Select fields"
              aria-label="Select fields"
            >
              {/* Columns icon — three vertical bars */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="4" height="18" rx="1" strokeLinejoin="round" />
                <rect x="10" y="3" width="4" height="18" rx="1" strokeLinejoin="round" />
                <rect x="17" y="3" width="4" height="18" rx="1" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {qEnumValues && (
            <div className="relative" ref={qDropdownRef}>
              <button
                onClick={() => setQDropdownOpen((v) => !v)}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  selectedQ
                    ? 'bg-blue-700 border-blue-500 text-white'
                    : qDropdownOpen
                    ? 'bg-slate-700 border-slate-500 text-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Predefined query (q)"
                aria-label="Select predefined query"
                aria-expanded={qDropdownOpen}
              >
                <span>Q</span>
                {selectedQ && <span className="text-blue-200 font-mono">: {selectedQ}</span>}
                <svg className={`w-3 h-3 transition-transform ${qDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {qDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-20 min-w-[10rem] rounded-xl border border-slate-700 bg-slate-900 shadow-xl py-1">
                  {selectedQ && (
                    <button
                      onClick={() => { setSelectedQ(null); setQDropdownOpen(false); setPage(0) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800 italic"
                    >
                      Clear selection
                    </button>
                  )}
                  {qEnumValues.map((val) => (
                    <button
                      key={val}
                      onClick={() => { setSelectedQ(val); setQDropdownOpen(false); setPage(0) }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                        selectedQ === val
                          ? 'bg-blue-700/40 text-blue-300'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {navItem.hasValidityDates && (
            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
              {STATUS_OPTIONS.map((option) => {
                const selected = statusSelections.includes(option.key)
                return (
                  <button
                    key={option.key}
                    onClick={() => setStatusSelections((current) => toggleSelection(current, option.key))}
                    className={`px-3 py-1.5 text-xs rounded-none first:rounded-l-lg last:rounded-r-lg transition-colors ${
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
          )}

          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = visibilitySelections.includes(option.key)
              return (
                <button
                  key={option.key}
                  onClick={() => setVisibilitySelections((current) => toggleSelection(current, option.key))}
                  className={`px-3 py-1.5 text-xs rounded-none first:rounded-l-lg last:rounded-r-lg transition-colors ${
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

        {navItem.hasSearch && (
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name…"
              className="pl-8 pr-3 py-2.5 text-xs rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-52"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

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

            <button
              onClick={() => setQueryInfoOpen((v) => !v)}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border ${
                queryInfoOpen
                  ? 'bg-blue-700 border-blue-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Query info"
              aria-label="Query info"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {fieldSelectorOpen && showFieldSelector && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Select Fields</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFieldSelectorState({ mode: 'all', selected: new Set() })}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Select all
              </button>
              <button
                onClick={() => setFieldSelectorState({ mode: 'none', selected: new Set() })}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          {/* Search within fields */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              placeholder="Filter fields…"
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {fieldSearch && (
              <button
                onClick={() => setFieldSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear field search"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {availableFields.length === 0 ? (
            <p className="text-xs text-slate-500">No fields found in schema or response.</p>
          ) : (() => {
            const filtered = fieldSearch
              ? availableFields.filter((f) => f.toLowerCase().includes(fieldSearch.toLowerCase()))
              : availableFields
            return filtered.length === 0 ? (
              <p className="text-xs text-slate-500">No fields match &ldquo;{fieldSearch}&rdquo;.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                {filtered.map((field) => {
                  const checked = isFieldChecked(field, fieldSelectorState)
                  return (
                    <label key={field} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setFieldSelectorState((prev) =>
                            toggleFieldSelection(field, availableFields, prev)
                          )
                        }
                        className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-slate-300 group-hover:text-white truncate">{field}</span>
                    </label>
                  )
                })}
              </div>
            )
          })()}

          {fieldSelectorState.mode !== 'all' && fieldSelectorState.mode !== 'none' && (
            <p className="text-[10px] text-slate-500 font-mono">
              {fieldSelectorState.mode === 'exclude'
                ? `Excluding: ${[...fieldSelectorState.selected].join(', ')}`
                : `Including only: ${[...fieldSelectorState.selected].join(', ')}`}
            </p>
          )}
          {fieldSelectorState.mode === 'none' && (
            <p className="text-[10px] text-slate-500 font-mono">No fields selected — no filter[fields] parameter added.</p>
          )}
        </div>
      )}

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

      <div className="overflow-x-auto">
        <DataGrid
          columns={columns}
          data={data}
          loading={loading}
          error={error}
          onRefresh={refresh}
          onRowClick={navItem?.itemPathTemplate ? handleRowClick : undefined}
          hasValidityDates={navItem?.hasValidityDates}
          onRowDelete={canDeleteItem ? handleDeleteRow : undefined}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {!loading && !error && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>
                {`${data.length} record(s) returned`}
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

      {queryInfoOpen && (
        <div
          className="flex-shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden relative"
          style={{ width: sidebarWidth }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
            title="Drag to resize"
          />

          {/* Tabs + close button */}
          <div className="flex items-center border-b border-slate-800 flex-shrink-0">
            {['request', 'identity'].map((tab) => (
              <button
                key={tab}
                onClick={() => setQueryInfoTab(tab)}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                  queryInfoTab === tab
                    ? 'text-blue-400 border-b-2 border-blue-500 -mb-px bg-slate-900'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setQueryInfoOpen(false)}
              className="px-3 py-2 text-slate-500 hover:text-slate-300"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {queryInfoTab === 'identity' && (
              <IdentityTab token={token} />
            )}

            {queryInfoTab === 'request' && (
            <>
            {/* ── REQUEST ── */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Request</p>

              {/* Method badge + URL/cURL toggle */}
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-blue-700 text-white tracking-wide">GET</span>
                <div className="flex items-center bg-slate-800 rounded-md p-0.5 text-xs gap-0.5">
                  <button
                    onClick={() => setCurlMode(false)}
                    className={`px-2.5 py-0.5 rounded transition-colors ${!curlMode ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    URL
                  </button>
                  <button
                    onClick={() => setCurlMode(true)}
                    className={`px-2.5 py-0.5 rounded transition-colors ${curlMode ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    cURL
                  </button>
                </div>
              </div>

              {/* Copyable URL / cURL box */}
              <button
                onClick={handleCopy}
                className={`w-full text-left text-xs font-mono rounded-lg px-3 py-2 border flex items-start gap-2 group transition-colors ${
                  copied
                    ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="flex-1 break-all whitespace-pre-wrap">{curlMode ? curlCommand : fullRequestUrl}</span>
                <span className="flex-shrink-0 mt-0.5">
                  {copied ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </span>
              </button>

              {/* Applied filters */}
              {statusSelections.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status filter</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.filter((o) => statusSelections.includes(o.key)).map((o) => (
                      <span key={o.key} className="px-2 py-0.5 text-xs rounded-md bg-blue-600/20 text-blue-300 border border-blue-700">{o.label}</span>
                    ))}
                  </div>
                </div>
              )}

              {visibilitySelections.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Visibility filter</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VISIBILITY_OPTIONS.filter((o) => visibilitySelections.includes(o.key)).map((o) => (
                      <span key={o.key} className="px-2 py-0.5 text-xs rounded-md bg-violet-600/20 text-violet-300 border border-violet-700">{o.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── RESPONSE ── */}
            {responseStatus !== null && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Response</p>

                {/* Status + Duration */}
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${responseStatus >= 200 && responseStatus < 300 ? 'bg-emerald-800 text-emerald-100' : 'bg-rose-800 text-rose-100'}`}>
                    {responseStatus}
                  </span>
                  {queryDuration !== null && (
                    <span className="text-xs text-slate-400 font-mono">{queryDuration} ms</span>
                  )}
                </div>

                {/* Response headers */}
                {responseHeaders && Object.keys(responseHeaders).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Headers</p>
                    <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                      {Object.entries(responseHeaders).map(([key, value]) => (
                        <div key={key} className="px-3 py-1.5 bg-slate-950">
                          <p className="text-[10px] text-slate-500 font-mono">{key}</p>
                          <p className="text-xs text-slate-300 font-mono break-all">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
