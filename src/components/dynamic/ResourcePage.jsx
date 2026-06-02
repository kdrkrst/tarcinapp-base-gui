import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Outlet } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { parseOasSpec, deriveColumns, resolvePaginationQueryKeys, getPostBodySchema } from '../../utils/oasParser'
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

function buildFilterOrderParams(qs, sortOrder) {
  if (!sortOrder.length) return
  if (sortOrder.length === 1) {
    qs.set('filter[order]', `${sortOrder[0].field} ${sortOrder[0].dir}`)
  } else {
    sortOrder.forEach(({ field, dir }, i) => {
      qs.set(`filter[order][${i}]`, `${field} ${dir}`)
    })
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

function TagInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState('')
  const items = Array.isArray(value) ? value : []

  const commit = () => {
    const trimmed = inputVal.trim()
    if (trimmed) onChange([...items, trimmed])
    setInputVal('')
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2 bg-slate-950 border border-slate-700 rounded-lg min-h-[38px] focus-within:ring-1 focus-within:border-blue-500 focus-within:ring-blue-500 cursor-text"
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.querySelector('input')?.focus() }}
    >
      {items.map((item, idx) => (
        <span key={idx} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-slate-700 rounded text-xs text-slate-200 font-mono">
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="text-slate-500 hover:text-white ml-0.5 leading-none"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          if (e.key === 'Backspace' && !inputVal && items.length > 0) onChange(items.slice(0, -1))
        }}
        placeholder={items.length === 0 ? 'Type and press Enter…' : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 focus:outline-none placeholder-slate-600"
      />
    </div>
  )
}

function buildPayloadFromForm(values, fields) {
  const payload = {}
  for (const field of fields) {
    const val = values[field.name]
    if (field.type === 'boolean') {
      if (val !== undefined) payload[field.name] = val === true || val === 'true'
      continue
    }
    if (val === undefined || val === null || val === '') continue
    if (field.type === 'integer') {
      const n = parseInt(val, 10)
      if (!isNaN(n)) payload[field.name] = n
    } else if (field.type === 'number') {
      const n = parseFloat(val)
      if (!isNaN(n)) payload[field.name] = n
    } else if (field.type === 'array') {
      if (Array.isArray(val)) {
        if (val.length > 0) payload[field.name] = val
      } else {
        try { payload[field.name] = JSON.parse(val) } catch { /* skip invalid JSON */ }
      }
    } else if (field.type === 'object') {
      try { payload[field.name] = JSON.parse(val) } catch { /* skip invalid JSON */ }
    } else {
      payload[field.name] = val
    }
  }
  return payload
}

function renderCreateField(field, value, onChange) {
  const cls = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500'

  if (field.type === 'boolean') {
    const checked = value === true || value === 'true'
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
          checked ? 'bg-blue-700 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
        }`}
      >
        <span className="font-mono">{checked ? 'true' : 'false'}</span>
      </button>
    )
  }

  if (field.enum) {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">— select —</option>
        {field.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  if (field.type === 'integer' || field.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        step={field.type === 'integer' ? '1' : 'any'}
        className={cls}
      />
    )
  }

  if (field.type === 'array') {
    return <TagInput value={value} onChange={onChange} />
  }

  if (field.type === 'object') {
    return (
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="{}"
        className={`${cls} font-mono text-xs`}
      />
    )
  }

  if (field.format === 'date-time') {
    return (
      <input
        type="datetime-local"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      />
    )
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  )
}

export default function ResourcePage() {
  const { tagSlug } = useParams()
  const navigate = useNavigate()
  const { oasSpec, endpoint, token } = useApp()
  const { get, getWithMeta, post, patch, del } = useApiClient()
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
  const [createTab, setCreateTab] = useState('form')
  const [createFormValues, setCreateFormValues] = useState({})
  const [toastError, setToastError] = useState(null)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  // fieldSelectorState: { mode: 'all'|'exclude'|'none'|'include', selected: Set<string> }
  const [fieldSelectorState, setFieldSelectorState] = useState({ mode: 'all', selected: new Set() })
  // sortOrder: [{ field: string, dir: 'ASC'|'DESC' }]
  const [sortOrder, setSortOrder] = useState([])
  const [selectedQ, setSelectedQ] = useState(null)
  const [selectedFieldset, setSelectedFieldset] = useState(null)
  const [queryInfoTab, setQueryInfoTab] = useState('request')
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [requestHeaders, setRequestHeaders] = useState(null)
  const [qDropdownOpen, setQDropdownOpen] = useState(false)
  const [fieldsetDropdownOpen, setFieldsetDropdownOpen] = useState(false)
  const qDropdownRef = useRef(null)
  const fieldsetDropdownRef = useRef(null)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  // Traversal create modal state
  const [traversalCreateState, setTraversalCreateState] = useState(null) // null | { row, traversal }
  const [traversalCreateTab, setTraversalCreateTab] = useState('form')
  const [traversalCreateFormValues, setTraversalCreateFormValues] = useState({})
  const [traversalCreatePayload, setTraversalCreatePayload] = useState('{}')
  const [traversalCreateError, setTraversalCreateError] = useState(null)
  const [traversalCreating, setTraversalCreating] = useState(false)
  // List relate modal state
  const [listRelateState, setListRelateState] = useState(null) // null | { row, traversal }
  const [listRelateRelation, setListRelateRelation] = useState(null) // selected relation nav item
  const [listRelateSelectedList, setListRelateSelectedList] = useState(null)
  const [listRelateSearch, setListRelateSearch] = useState('')
  const [listRelateResults, setListRelateResults] = useState([])
  const [listRelateSearchLoading, setListRelateSearchLoading] = useState(false)
  const [listRelatePage, setListRelatePage] = useState(0)
  const [listRelateHasMore, setListRelateHasMore] = useState(false)
  const [listRelateFormValues, setListRelateFormValues] = useState({})
  const [listRelating, setListRelating] = useState(false)
  const [listRelateError, setListRelateError] = useState(null)
  const listRelateSearchDebounceRef = useRef(null)
  const [traversalRefreshSignal, setTraversalRefreshSignal] = useState(0)

  const { navItems } = useMemo(() => parseOasSpec(oasSpec), [oasSpec])
  const navItem = useMemo(() => navItems.find((n) => n.id === tagSlug), [navItems, tagSlug])

  const postSchema = useMemo(
    () => getPostBodySchema(oasSpec, navItem?.collectionPath),
    [oasSpec, navItem?.collectionPath]
  )
  const writableFields = useMemo(() => {
    if (!postSchema?.properties) return []
    return Object.entries(postSchema.properties)
      .filter(([, prop]) => !prop.readOnly)
      .map(([name, prop]) => ({
        name,
        type: prop.type ?? 'string',
        format: prop.format ?? null,
        enum: Array.isArray(prop.enum) ? prop.enum : null,
        required: Array.isArray(postSchema.required) && postSchema.required.includes(name),
        description: prop.description ?? null,
      }))
  }, [postSchema])

  // Section 1: _name (if present) + all non-managed (no leading _) fields
  const primaryCreateFields = useMemo(() => {
    const nameField = writableFields.find((f) => f.name === '_name')
    const unmanaged = writableFields.filter((f) => !f.name.startsWith('_'))
    return nameField ? [nameField, ...unmanaged] : unmanaged
  }, [writableFields])

  // Section 2: managed (_) fields excluding _name
  const managedCreateFields = useMemo(
    () => writableFields.filter((f) => f.name.startsWith('_') && f.name !== '_name'),
    [writableFields]
  )

  // Traversal create: writable fields derived from the traversal's POST schema
  const traversalCreateWritableFields = useMemo(() => {
    if (!traversalCreateState?.traversal?.pathTemplate) return []
    const schema = getPostBodySchema(oasSpec, traversalCreateState.traversal.pathTemplate)
    if (!schema?.properties) return []
    return Object.entries(schema.properties)
      .filter(([, prop]) => !prop.readOnly)
      .map(([name, prop]) => ({
        name,
        type: prop.type ?? 'string',
        format: prop.format ?? null,
        enum: Array.isArray(prop.enum) ? prop.enum : null,
        required: Array.isArray(schema.required) && schema.required.includes(name),
        description: prop.description ?? null,
      }))
  }, [oasSpec, traversalCreateState])

  // Relation nav items that link entities to lists (have both _entityId and _listId in POST schema)
  const listRelationNavItems = useMemo(() => {
    return navItems.filter((ni) => {
      if (!ni.collectionMethods?.includes('post')) return false
      const schema = getPostBodySchema(oasSpec, ni.collectionPath)
      if (!schema?.properties) return false
      const props = schema.properties
      return '_entityId' in props && !props._entityId?.readOnly
        && '_listId' in props && !props._listId?.readOnly
    })
  }, [navItems, oasSpec])

  // List nav items for the picker (baseType === 'list' or path includes /lists/)
  const listNavItemsForPicker = useMemo(() => {
    return navItems.filter((n) => n.baseType === 'list' || n.collectionPath?.includes('/lists/'))
  }, [navItems])

  // Entity nav items for the picker (baseType === 'entity' or not a list/relation)
  const entityNavItemsForPicker = useMemo(() => {
    return navItems.filter((n) => n.baseType === 'entity' || (!n.baseType && n.collectionPath && !n.collectionPath.includes('/lists/')))
  }, [navItems])

  // Set of traversal pathTemplates on the current resource that should show the relate modal.
  // Three cases:
  //  1. subResource last-seg matches a known relation type (e.g. 'contains')
  //  2. path includes '/lists/'  → entity page, pick a list
  //  3. path includes '/entities/' → list page, pick an entity
  const relateTraversalIds = useMemo(() => {
    if (!navItem?.children) return new Set()
    const relationLastSegs = new Set(listRelationNavItems.map((ni) => {
      const parts = (ni.collectionPath ?? '').split('/').filter(Boolean)
      return parts[parts.length - 1]
    }).filter(Boolean))
    return new Set((navItem.children ?? []).filter((t) => {
      const lastSeg = (t.subResource ?? '').split('/').pop()
      if (listRelationNavItems.length > 0 && relationLastSegs.has(lastSeg)) return true
      // Use subResource prefix — 'lists/bookshelves' starts with 'lists/', 'reactions/likes' does not
      if (listNavItemsForPicker.length > 0 && t.subResource?.startsWith('lists/')) return true
      if (entityNavItemsForPicker.length > 0 && t.subResource?.startsWith('entities/')) return true
      return false
    }).map((t) => t.pathTemplate))
  }, [navItem, listRelationNavItems, listNavItemsForPicker, entityNavItemsForPicker])

  // Writable fields for the selected relation type (excluding _entityId and _listId)
  const listRelateWritableFields = useMemo(() => {
    if (!listRelateRelation?.collectionPath) return []
    const schema = getPostBodySchema(oasSpec, listRelateRelation.collectionPath)
    if (!schema?.properties) return []
    return Object.entries(schema.properties)
      .filter(([name, prop]) => !prop.readOnly && name !== '_entityId' && name !== '_listId')
      .map(([name, prop]) => ({
        name,
        type: prop.type ?? 'string',
        format: prop.format ?? null,
        enum: Array.isArray(prop.enum) ? prop.enum : null,
        required: Array.isArray(schema.required) && schema.required.includes(name),
        description: prop.description ?? null,
      }))
  }, [oasSpec, listRelateRelation])

  const canCreate = navItem?.collectionMethods?.includes('post')
  const canDeleteItem = navItem?.itemPathTemplate && navItem?.itemMethods?.includes('delete')
  const canActivate = !!navItem?.itemSchemaProps?.['_validFromDateTime'] && !!navItem?.itemPathTemplate && navItem?.itemMethods?.includes('patch')
  const canDeactivate = !!navItem?.itemSchemaProps?.['_validUntilDateTime'] && !!navItem?.itemPathTemplate && navItem?.itemMethods?.includes('patch')
  const showFieldSelector = !!(navItem?.hasFilterFields || navItem?.hasFieldset || navItem?.hasFields)
  const qEnumValues = navItem?.qEnumValues ?? null
  const fieldsetEnumValues = navItem?.fieldsetEnumValues ?? null
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
    if (debouncedSearch) {
      if (navItem?.hasSimplifiedSearch) qs.set('s', debouncedSearch)
      else qs.set('filter[where][_name][regexp]', `.*${debouncedSearch}.*`)
    }
    if (selectedQ) qs.set('q', selectedQ)
    if (selectedFieldset) qs.set('fieldset', selectedFieldset)
    buildFilterFieldsParams(qs, fieldSelectorState)
    buildFilterOrderParams(qs, sortOrder)
    return formatQueryPreview(qs)
  }, [page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections, debouncedSearch, selectedQ, selectedFieldset, fieldSelectorState, sortOrder])

  useEffect(() => {
    setPage(0)
    setSearchInput('')
    setDebouncedSearch('')
    setFieldSelectorState({ mode: 'all', selected: new Set() })
    setSelectedQ(null)
    setSelectedFieldset(null)
    setSortOrder([])
  }, [navItem?.collectionPath, statusSelections, visibilitySelections])

  useEffect(() => {
    if (!qDropdownOpen) return undefined
    const handler = (e) => { if (qDropdownRef.current && !qDropdownRef.current.contains(e.target)) setQDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [qDropdownOpen])

  useEffect(() => {
    if (!fieldsetDropdownOpen) return undefined
    const handler = (e) => { if (fieldsetDropdownRef.current && !fieldsetDropdownRef.current.contains(e.target)) setFieldsetDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fieldsetDropdownOpen])

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
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(0)
    }, 350)
    return () => window.clearTimeout(searchDebounceRef.current)
  }, [searchInput])

  // Fetch list/entity results when the relate modal is open or search changes
  useEffect(() => {
    if (!listRelateState) return undefined
    if (listRelateSearchDebounceRef.current) window.clearTimeout(listRelateSearchDebounceRef.current)
    listRelateSearchDebounceRef.current = window.setTimeout(async () => {
      const mode = listRelateState.mode ?? 'list-pick'
      const pickerItems = mode === 'entity-pick' ? entityNavItemsForPicker : listNavItemsForPicker
      if (pickerItems.length === 0) return
      setListRelateSearchLoading(true)
      try {
        let sources
        if (mode === 'entity-pick') {
          // Narrow entity type by traversal subResource last segment (e.g. 'books' from 'entities/books')
          const sub = listRelateState.traversal?.subResource ?? ''
          const lastSeg = sub.split('/').pop()
          const targets = pickerItems.filter((ln) =>
            !lastSeg || ln.collectionPath?.endsWith(`/${lastSeg}`) || ln.collectionPath?.includes(`/${lastSeg}`)
          )
          sources = targets.length > 0 ? targets : pickerItems
        } else {
          // Narrow list type by traversal subResource last segment (e.g. 'bookshelves' from 'lists/bookshelves')
          const sub = listRelateState.traversal?.subResource ?? ''
          const lastSeg = sub.split('/').pop()
          const targets = pickerItems.filter((ln) =>
            !lastSeg || ln.collectionPath?.endsWith(`/${lastSeg}`) || ln.collectionPath?.includes(`/${lastSeg}`)
          )
          sources = targets.length > 0 ? targets : pickerItems
        }
        const PICKER_PAGE_SIZE = 5
        const allResults = []
        for (const ln of sources) {
          const keys = resolvePaginationQueryKeys(oasSpec, ln.collectionPath, 'get')
          const qs = new URLSearchParams({ [keys.limitKey]: String(PICKER_PAGE_SIZE + 1) })
          qs.set(keys.skipKey, String(listRelatePage * PICKER_PAGE_SIZE))
          if (listRelateSearch.trim()) qs.set('s', listRelateSearch.trim())
          try {
            const data = await get(`${ln.collectionPath}?${qs}`)
            if (Array.isArray(data)) allResults.push(...data.map((r) => ({ ...r, _sourceNavItem: ln })))
          } catch { /* skip */ }
        }
        const hasMore = allResults.length > PICKER_PAGE_SIZE
        setListRelateHasMore(hasMore)
        setListRelateResults(hasMore ? allResults.slice(0, PICKER_PAGE_SIZE) : allResults)
      } finally {
        setListRelateSearchLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(listRelateSearchDebounceRef.current)
  }, [listRelateState, listRelateSearch, listRelatePage, listNavItemsForPicker, entityNavItemsForPicker, oasSpec, get])

  const fetcher = useCallback(async () => {
    if (!navItem?.collectionPath) return []

    const qs = new URLSearchParams()
    qs.set(paginationKeys.limitKey, String(pageSize))
    qs.set(paginationKeys.skipKey, String(page * pageSize))
    buildSetQuery(qs, statusSelections, visibilitySelections)
    if (debouncedSearch) {
      if (navItem?.hasSimplifiedSearch) qs.set('s', debouncedSearch)
      else qs.set('filter[where][_name][regexp]', `.*${debouncedSearch}.*`)
    }
    if (selectedQ) qs.set('q', selectedQ)
    if (selectedFieldset) qs.set('fieldset', selectedFieldset)
    buildFilterFieldsParams(qs, fieldSelectorState)
    buildFilterOrderParams(qs, sortOrder)

    const start = performance.now()
    const { data, headers, status, requestHeaders: reqHeaders } = await getWithMeta(`${navItem.collectionPath}?${qs.toString()}`)
    setQueryDuration(Math.round(performance.now() - start))
    setResponseHeaders(headers)
    setResponseStatus(status)
    setRequestHeaders(reqHeaders ?? null)
    return data ?? []
  }, [getWithMeta, navItem?.collectionPath, page, pageSize, paginationKeys.limitKey, paginationKeys.skipKey, statusSelections, visibilitySelections, debouncedSearch, selectedQ, selectedFieldset, fieldSelectorState, sortOrder])

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

  const handleActivateRow = useCallback(
    async (row) => {
      try {
        setToastError(null)
        const id = row?._id ?? row?.id
        if (!id || !navItem?.itemPathTemplate) return
        await patch(buildItemPath(navItem.itemPathTemplate, id), { _validFromDateTime: new Date().toISOString() })
        await refresh()
      } catch (err) {
        setToastError(err?.message ?? 'Activate failed')
      }
    },
    [patch, navItem?.itemPathTemplate, refresh]
  )

  const handleDeactivateRow = useCallback(
    async (row) => {
      try {
        setToastError(null)
        const id = row?._id ?? row?.id
        if (!id || !navItem?.itemPathTemplate) return
        await patch(buildItemPath(navItem.itemPathTemplate, id), { _validUntilDateTime: new Date().toISOString() })
        await refresh()
      } catch (err) {
        setToastError(err?.message ?? 'Deactivate failed')
      }
    },
    [patch, navItem?.itemPathTemplate, refresh]
  )

  const handleFetchItem = useCallback(async (row) => {
    const id = row?._id ?? row?.id
    if (!id || !navItem?.itemPathTemplate) return row
    return await get(buildItemPath(navItem.itemPathTemplate, id))
  }, [get, navItem?.itemPathTemplate])

  const handleFetchTraversal = useCallback(async (row, pathTemplate, page, pageSize, filters = {}) => {
    const id = row?._id ?? row?.id
    if (!id) return []
    const resolvedPath = pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
    const pKeys = resolvePaginationQueryKeys(oasSpec, pathTemplate, 'get')
    const qs = new URLSearchParams()
    qs.set(pKeys.limitKey, String(pageSize))
    qs.set(pKeys.skipKey, String(page * pageSize))
    buildSetQuery(qs, filters.statusFilter ? [filters.statusFilter] : [], filters.visibilityFilter ? [filters.visibilityFilter] : [])
    if (filters.sortField) qs.set('filter[order]', `${filters.sortField} ${filters.sortDir ?? 'ASC'}`)
    const result = await get(`${resolvedPath}?${qs.toString()}`)
    return Array.isArray(result) ? result : []
  }, [get, oasSpec])

  const handleTraversalPost = useCallback(async (row, pathTemplate, body) => {
    const id = row?._id ?? row?.id
    if (!id) return
    const resolvedPath = pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
    let parsed
    try { parsed = JSON.parse(body) } catch { throw new Error('Invalid JSON') }
    await post(resolvedPath, parsed)
    await refresh()
  }, [post, refresh])

  const handleTraversalOpenCreate = useCallback((row, traversal) => {
    setTraversalCreateState({ row, traversal })
    setTraversalCreateTab('form')
    const schema = getPostBodySchema(oasSpec, traversal.pathTemplate)
    const rowId = row?._id ?? row?.id
    const initialValues = {}
    if (schema?.properties && rowId) {
      if ('_entityId' in schema.properties && !schema.properties._entityId.readOnly) initialValues._entityId = rowId
      if ('_listId' in schema.properties && !schema.properties._listId.readOnly) initialValues._listId = rowId
    }
    setTraversalCreateFormValues(initialValues)
    setTraversalCreatePayload(Object.keys(initialValues).length ? JSON.stringify(initialValues, null, 2) : '{}')
    setTraversalCreateError(null)
  }, [oasSpec])

  const handleTraversalCreate = useCallback(async () => {
    if (!traversalCreateState) return
    const { row, traversal } = traversalCreateState
    const id = row?._id ?? row?.id
    if (!id) return
    const resolvedPath = traversal.pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
    setTraversalCreateError(null)
    setTraversalCreating(true)
    try {
      const payload = (traversalCreateTab === 'form' && traversalCreateWritableFields.length > 0)
        ? buildPayloadFromForm(traversalCreateFormValues, traversalCreateWritableFields)
        : JSON.parse(traversalCreatePayload || '{}')
      await post(resolvedPath, payload)
      setTraversalCreateState(null)
      await refresh()
    } catch (err) {
      setTraversalCreateError({ message: err?.message ?? 'Create failed', details: err?.body?.error?.details ?? [] })
    } finally {
      setTraversalCreating(false)
    }
  }, [post, refresh, traversalCreateState, traversalCreateTab, traversalCreateFormValues, traversalCreatePayload, traversalCreateWritableFields])

  const handleTraversalCreateTabSwitch = useCallback((tab) => {
    if (tab === 'json' && traversalCreateTab !== 'json') {
      setTraversalCreatePayload(JSON.stringify(buildPayloadFromForm(traversalCreateFormValues, traversalCreateWritableFields), null, 2))
    } else if (tab === 'form' && traversalCreateTab !== 'form') {
      try {
        const parsed = JSON.parse(traversalCreatePayload || '{}')
        const newValues = {}
        for (const field of traversalCreateWritableFields) {
          if (parsed[field.name] !== undefined) {
            if (field.type === 'array') newValues[field.name] = Array.isArray(parsed[field.name]) ? parsed[field.name] : []
            else if (field.type === 'object') newValues[field.name] = JSON.stringify(parsed[field.name], null, 2)
            else newValues[field.name] = String(parsed[field.name])
          }
        }
        setTraversalCreateFormValues(newValues)
      } catch { /* skip */ }
    }
    setTraversalCreateTab(tab)
  }, [traversalCreateTab, traversalCreateFormValues, traversalCreatePayload, traversalCreateWritableFields])

  const handleTraversalDeleteAll = useCallback(async (row, pathTemplate) => {
    const id = row?._id ?? row?.id
    if (!id) return
    const resolvedPath = pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
    await del(resolvedPath)
  }, [del])

  const handleTraversalPatchAll = useCallback(async (row, pathTemplate, body) => {
    const id = row?._id ?? row?.id
    if (!id) return
    const resolvedPath = pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
    let parsed
    try { parsed = JSON.parse(body) } catch { throw new Error('Invalid JSON') }
    await patch(resolvedPath, parsed)
  }, [patch])

  const handleTraversalRelateToList = useCallback((row, traversal) => {
    // Narrow relation types to those whose collection path matches the traversal sub-resource
    const lastSeg = (traversal.subResource ?? '').split('/').pop()
    const matchingRelations = listRelationNavItems.filter((ni) => {
      const niSeg = (ni.collectionPath ?? '').split('/').filter(Boolean).pop() ?? ''
      return !lastSeg || niSeg === lastSeg
    })
    const relevantRelations = matchingRelations.length > 0 ? matchingRelations : listRelationNavItems
    const autoRelation = relevantRelations.length === 1 ? relevantRelations[0] : null
    // Detect mode: if the current resource is a list, we need to pick an entity; otherwise pick a list
    const mode = navItem?.baseType === 'list' ? 'entity-pick' : 'list-pick'
    setListRelateState({ row, traversal, mode, relevantRelations })
    setListRelateRelation(autoRelation)
    setListRelateSelectedList(null)
    setListRelateSearch('')
    setListRelateResults([])
    setListRelateFormValues({})
    setListRelateError(null)
    setListRelatePage(0)
    setListRelateHasMore(false)
  }, [listRelationNavItems, navItem])

  const handleListRelateSubmit = useCallback(async () => {
    if (!listRelateState || !listRelateRelation || !listRelateSelectedList) return
    const rowId = listRelateState.row?._id ?? listRelateState.row?.id
    const pickedId = listRelateSelectedList._id ?? listRelateSelectedList.id
    const mode = listRelateState.mode ?? 'list-pick'
    const payload = {
      ...buildPayloadFromForm(listRelateFormValues, listRelateWritableFields),
      _entityId: mode === 'list-pick' ? rowId : pickedId,
      _listId: mode === 'list-pick' ? pickedId : rowId,
    }
    setListRelating(true)
    setListRelateError(null)
    try {
      await post(listRelateRelation.collectionPath, payload)
      setListRelateState(null)
      setTraversalRefreshSignal((k) => k + 1)
    } catch (err) {
      setListRelateError({ message: err?.message ?? 'Failed to create relation', details: err?.body?.error?.details ?? [] })
    } finally {
      setListRelating(false)
    }
  }, [post, listRelateState, listRelateRelation, listRelateSelectedList, listRelateFormValues, listRelateWritableFields])

  const handleFetchRelatedRecord = useCallback(async (id) => {
    for (const item of navItems) {
      if (!item.itemPathTemplate) continue
      try {
        const path = item.itemPathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(id))
        const result = await get(path)
        if (result && (result._id === id || result.id === id)) return { record: result, navItem: item }
      } catch { /* try next navItem */ }
    }
    return null
  }, [get, navItems])

  const handleSortColumn = useCallback((field) => {
    setSortOrder((prev) => {
      const existing = prev.find((s) => s.field === field)
      if (!existing) return [{ field, dir: 'ASC' }]
      if (existing.dir === 'ASC') return [{ field, dir: 'DESC' }]
      return []
    })
    setPage(0)
  }, [])

  const columns = useMemo(() => {
    const all = deriveColumns(data)
    return all.filter((col) => isFieldChecked(col.key, fieldSelectorState))
  }, [data, fieldSelectorState])

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
      const payload = createTab === 'form'
        ? buildPayloadFromForm(createFormValues, writableFields)
        : JSON.parse(createPayload || '{}')
      await post(navItem.collectionPath, payload)
      setCreateOpen(false)
      setCreatePayload('{}')
      setCreateFormValues({})
      await refresh()
    } catch (err) {
      setCreateError({
        message: err?.message ?? 'Create failed',
        details: err?.body?.error?.details ?? [],
      })
    } finally {
      setCreating(false)
    }
  }, [post, navItem?.collectionPath, createTab, createPayload, createFormValues, writableFields, refresh])

  const handleCreateTabSwitch = useCallback((tab) => {
    if (tab === 'json' && createTab !== 'json') {
      const payload = buildPayloadFromForm(createFormValues, writableFields)
      setCreatePayload(JSON.stringify(payload, null, 2))
    } else if (tab === 'form' && createTab !== 'form') {
      try {
        const parsed = JSON.parse(createPayload || '{}')
        const newValues = {}
        for (const field of writableFields) {
          if (parsed[field.name] !== undefined) {
            if (field.type === 'array') {
              newValues[field.name] = Array.isArray(parsed[field.name]) ? parsed[field.name] : []
            } else if (field.type === 'object') {
              newValues[field.name] = JSON.stringify(parsed[field.name], null, 2)
            } else {
              newValues[field.name] = String(parsed[field.name])
            }
          }
        }
        setCreateFormValues(newValues)
      } catch { /* invalid JSON, skip sync */ }
    }
    setCreateTab(tab)
  }, [createTab, createFormValues, createPayload, writableFields])

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
    <>
    <div className="flex -m-6 min-h-[calc(100vh-3.5rem)]">
      <div className="flex-1 p-6 min-w-0 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        {/* Left: search */}
        {navItem.hasSearch && (
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name…"
              className="w-full pl-8 pr-7 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label="Clear search">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Right: action buttons */}
        <div className="ml-auto inline-flex rounded-lg border border-slate-700 divide-x divide-slate-700 overflow-hidden">
          {/* Filter */}
          {(() => {
            const activeFilterCount = [
              selectedQ !== null,
              selectedFieldset !== null,
              statusSelections.length > 0,
              visibilitySelections.length > 0,
              fieldSelectorState.mode !== 'all',
              sortOrder.length > 0,
            ].filter(Boolean).length
            return (
              <button
                onClick={() => setFilterPanelOpen((v) => !v)}
                className={`relative flex items-center justify-center w-9 h-9 transition-colors ${
                  filterPanelOpen || activeFilterCount > 0
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Filters"
                aria-label="Filters"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M7 12h10M11 18h2" />
                </svg>
                {activeFilterCount > 0 && !filterPanelOpen && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-300" />
                )}
              </button>
            )
          })()}

          {/* Add New */}
          {canCreate && (
            <button
              onClick={() => { if (!createOpen) { setCreateFormValues({}); setCreatePayload('{}'); setCreateTab('form'); setCreateError(null) } setCreateOpen((v) => !v) }}
              className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-blue-700 text-slate-300 hover:text-white transition-colors"
              title="Add New"
              aria-label="Add New"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={refresh}
            className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Refresh"
            aria-label="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Query info */}
          <button
            onClick={() => setQueryInfoOpen((v) => !v)}
            className={`flex items-center justify-center w-9 h-9 transition-colors ${
              queryInfoOpen ? 'bg-blue-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
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

      {/* ── Filter panel ── */}
      {filterPanelOpen && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-4">

          {/* Panel header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Filters</p>
            <div className="flex items-center gap-3">
              {[selectedQ !== null, selectedFieldset !== null, statusSelections.length > 0, visibilitySelections.length > 0, fieldSelectorState.mode !== 'all', sortOrder.length > 0].some(Boolean) && (
                <button
                  onClick={() => { setSelectedQ(null); setSelectedFieldset(null); setStatusSelections([]); setVisibilitySelections([]); setFieldSelectorState({ mode: 'all', selected: new Set() }); setSortOrder([]); setPage(0) }}
                  className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setFilterPanelOpen(false)}
                className="flex items-center justify-center w-6 h-6 rounded text-slate-500 hover:text-white transition-colors"
                aria-label="Close filters"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick-filter row */}
          <div className="flex flex-wrap gap-6">
            {qEnumValues && (
              <div className="space-y-1.5" ref={qDropdownRef}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Query</p>
                <div className="relative">
                  <button
                    onClick={() => setQDropdownOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <span className="truncate">
                      {selectedQ
                        ? <span className="text-blue-300">{selectedQ}</span>
                        : <span className="text-slate-500">— none —</span>}
                    </span>
                    <svg className="w-3 h-3 ml-1.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {qDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedQ(null); setPage(0); setQDropdownOpen(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${selectedQ === null ? 'bg-blue-700/40 text-blue-300' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                        >
                          — none —
                        </button>
                        {qEnumValues.map((val) => {
                          const active = selectedQ === val
                          return (
                            <button
                              key={val}
                              onClick={() => { setSelectedQ(active ? null : val); setPage(0); setQDropdownOpen(false) }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${active ? 'bg-blue-700/40 text-blue-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                            >
                              {val}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {fieldsetEnumValues && (
              <div className="space-y-1.5" ref={fieldsetDropdownRef}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Fieldset</p>
                <div className="relative">
                  <button
                    onClick={() => setFieldsetDropdownOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <span className="truncate">
                      {selectedFieldset
                        ? <span className="text-blue-300">{selectedFieldset}</span>
                        : <span className="text-slate-500">— none —</span>}
                    </span>
                    <svg className="w-3 h-3 ml-1.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {fieldsetDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedFieldset(null); setPage(0); setFieldsetDropdownOpen(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${selectedFieldset === null ? 'bg-blue-700/40 text-blue-300' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                        >
                          — none —
                        </button>
                        {fieldsetEnumValues.map((val) => {
                          const active = selectedFieldset === val
                          return (
                            <button
                              key={val}
                              onClick={() => { setSelectedFieldset(active ? null : val); setPage(0); setFieldsetDropdownOpen(false) }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${active ? 'bg-blue-700/40 text-blue-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                            >
                              {val}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {navItem.hasSet && navItem.hasValidityDates && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Status</p>
                <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                  {STATUS_OPTIONS.map((option) => {
                    const selected = statusSelections.includes(option.key)
                    return (
                      <button
                        key={option.key}
                        onClick={() => setStatusSelections((cur) => toggleSelection(cur, option.key))}
                        className={`px-3 py-1.5 text-xs border-r border-slate-700 last:border-r-0 transition-colors ${
                          selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {navItem.hasSet && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Visibility</p>
              <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                {VISIBILITY_OPTIONS.map((option) => {
                  const selected = visibilitySelections.includes(option.key)
                  return (
                    <button
                      key={option.key}
                      onClick={() => setVisibilitySelections((cur) => toggleSelection(cur, option.key))}
                      className={`px-3 py-1.5 text-xs border-r border-slate-700 last:border-r-0 transition-colors ${
                        selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
            )}
          </div>

          {/* Column selector */}
          {showFieldSelector && (
            <>
              <hr className="border-slate-700" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Columns</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setFieldSelectorState({ mode: 'all', selected: new Set() })} className="text-xs text-slate-400 hover:text-slate-200 underline">Select all</button>
                    <button onClick={() => setFieldSelectorState({ mode: 'none', selected: new Set() })} className="text-xs text-slate-400 hover:text-slate-200 underline">Deselect all</button>
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
                    <button onClick={() => setFieldSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label="Clear field search">
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
                              onChange={() => setFieldSelectorState((prev) => toggleFieldSelection(field, availableFields, prev))}
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
            </>
          )}

          {/* Sort */}
          {navItem.hasFilterOrder && (
            <>
              <hr className="border-slate-700" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Sort</p>
                  {sortOrder.length > 0 && (
                    <button
                      onClick={() => { setSortOrder([]); setPage(0) }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {sortOrder.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 w-4 flex-shrink-0">{i + 1}.</span>
                    <select
                      value={entry.field}
                      onChange={(e) => setSortOrder((prev) => prev.map((s, idx) => idx === i ? { ...s, field: e.target.value } : s))}
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button
                      onClick={() => setSortOrder((prev) => prev.map((s, idx) => idx === i ? { ...s, dir: s.dir === 'ASC' ? 'DESC' : 'ASC' } : s))}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-mono flex-shrink-0"
                    >
                      {entry.dir === 'ASC' ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      )}
                      {entry.dir}
                    </button>
                    <button
                      onClick={() => { setSortOrder((prev) => prev.filter((_, idx) => idx !== i)); setPage(0) }}
                      className="flex-shrink-0 text-slate-500 hover:text-rose-400 transition-colors"
                      aria-label="Remove sort"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setSortOrder((prev) => [...prev, { field: availableFields[0] ?? '_id', dir: 'ASC' }])}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add sort field
                </button>

                {sortOrder.length > 0 && (
                  <p className="text-[10px] text-slate-500 font-mono">
                    {sortOrder.map((s) => `${s.field} ${s.dir}`).join(', ')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCreateOpen(false)}
          />
          {/* Modal panel */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
            <p className="text-sm font-semibold text-slate-200">Create new item</p>
            <button
              onClick={() => setCreateOpen(false)}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          {writableFields.length > 0 && (
            <div className="flex border-b border-slate-700 px-4 shrink-0">
              <button
                onClick={() => handleCreateTabSwitch('form')}
                className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  createTab === 'form'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Form
              </button>
              <button
                onClick={() => handleCreateTabSwitch('json')}
                className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  createTab === 'json'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                JSON
              </button>
            </div>
          )}

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto">

          {/* Form tab */}
          {createTab === 'form' && writableFields.length > 0 && (
            <div className="space-y-3">
              {primaryCreateFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {primaryCreateFields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                        {field.name}
                        {field.required && <span className="text-red-400">*</span>}
                      </label>
                      {renderCreateField(
                        field,
                        createFormValues[field.name],
                        (v) => setCreateFormValues((prev) => ({ ...prev, [field.name]: v }))
                      )}
                      {field.description && (
                        <p className="text-[10px] text-slate-500">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {primaryCreateFields.length > 0 && managedCreateFields.length > 0 && (
                <hr className="border-slate-700" />
              )}
              {managedCreateFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {managedCreateFields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                        {field.name}
                        {field.required && <span className="text-red-400">*</span>}
                      </label>
                      {renderCreateField(
                        field,
                        createFormValues[field.name],
                        (v) => setCreateFormValues((prev) => ({ ...prev, [field.name]: v }))
                      )}
                      {field.description && (
                        <p className="text-[10px] text-slate-500">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* JSON tab (or fallback when no schema) */}
          {(createTab === 'json' || writableFields.length === 0) && (
            <textarea
              rows={12}
              value={createPayload}
              onChange={(e) => setCreatePayload(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
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

          {/* Validation errors */}
          {createError && (
            <div className="text-red-400 text-sm space-y-1">
              <p>{createError.message}</p>
              {createError.details?.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-red-300">
                  {createError.details.map((d, i) => (
                    <li key={i}>{d.field ? `${d.field}: ${d.message}` : d.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        </div>
        </div>
      )}

      {/* Traversal create modal */}
      {traversalCreateState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTraversalCreateState(null)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <p className="text-sm font-semibold text-slate-200">
                Add to <span className="text-blue-400">{traversalCreateState.traversal.label}</span>
              </p>
              <button
                onClick={() => setTraversalCreateState(null)}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tab bar */}
            {traversalCreateWritableFields.length > 0 && (
              <div className="flex border-b border-slate-700 px-4 shrink-0">
                <button
                  onClick={() => handleTraversalCreateTabSwitch('form')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    traversalCreateTab === 'form'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Form
                </button>
                <button
                  onClick={() => handleTraversalCreateTabSwitch('json')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    traversalCreateTab === 'json'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  JSON
                </button>
              </div>
            )}

            {/* Content */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">

              {/* Form tab */}
              {traversalCreateTab === 'form' && traversalCreateWritableFields.length > 0 && (() => {
                const primaryFields = traversalCreateWritableFields.filter((f) => !f.name.startsWith('_') || f.name === '_name')
                const managedFields = traversalCreateWritableFields.filter((f) => f.name.startsWith('_') && f.name !== '_name')
                const nameField = primaryFields.find((f) => f.name === '_name')
                const otherPrimary = primaryFields.filter((f) => f.name !== '_name')
                const orderedPrimary = nameField ? [nameField, ...otherPrimary] : otherPrimary
                return (
                  <div className="space-y-3">
                    {orderedPrimary.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        {orderedPrimary.map((field) => (
                          <div key={field.name} className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                              {field.name}
                              {field.required && <span className="text-red-400">*</span>}
                            </label>
                            {renderCreateField(
                              field,
                              traversalCreateFormValues[field.name],
                              (v) => setTraversalCreateFormValues((prev) => ({ ...prev, [field.name]: v }))
                            )}
                            {field.description && <p className="text-[10px] text-slate-500">{field.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {orderedPrimary.length > 0 && managedFields.length > 0 && <hr className="border-slate-700" />}
                    {managedFields.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        {managedFields.map((field) => (
                          <div key={field.name} className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                              {field.name}
                              {field.required && <span className="text-red-400">*</span>}
                            </label>
                            {renderCreateField(
                              field,
                              traversalCreateFormValues[field.name],
                              (v) => setTraversalCreateFormValues((prev) => ({ ...prev, [field.name]: v }))
                            )}
                            {field.description && <p className="text-[10px] text-slate-500">{field.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* JSON tab (or fallback when no schema) */}
              {(traversalCreateTab === 'json' || traversalCreateWritableFields.length === 0) && (
                <textarea
                  rows={12}
                  value={traversalCreatePayload}
                  onChange={(e) => setTraversalCreatePayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  spellCheck={false}
                  autoFocus={traversalCreateWritableFields.length === 0}
                />
              )}

            </div>

            {/* Sticky footer: error + actions */}
            <div className="px-4 pb-4 pt-3 space-y-3 shrink-0 border-t border-slate-700/50">
              {/* Validation errors */}
              {traversalCreateError && (
                <div className="text-red-400 text-sm space-y-1">
                  <p>{traversalCreateError.message}</p>
                  {traversalCreateError.details?.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 text-red-300">
                      {traversalCreateError.details.map((d, i) => (
                        <li key={i}>{d.path ? `${d.path}: ${d.message}` : d.field ? `${d.field}: ${d.message}` : d.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTraversalCreate}
                  disabled={traversalCreating}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                >
                  {traversalCreating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => setTraversalCreateState(null)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relate modal (bidirectional: entity→pick list, or list→pick entity) */}
      {listRelateState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setListRelateState(null)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {listRelateState.mode === 'entity-pick' ? 'Add entity to list' : 'Relate to existing list'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">via <span className="text-slate-400">{listRelateState.traversal.label}</span></p>
              </div>
              <button
                onClick={() => setListRelateState(null)}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="px-4 pt-2 pb-2 space-y-4 overflow-y-auto flex-1">

              {/* Relationship type selector (shown only when multiple options exist) */}
              {(listRelateState.relevantRelations ?? listRelationNavItems).length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Relationship type</p>
                  <div className="flex flex-wrap gap-2">
                    {(listRelateState.relevantRelations ?? listRelationNavItems).map((ri) => (
                      <button
                        key={ri.id}
                        onClick={() => { setListRelateRelation(ri); setListRelateFormValues({}) }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          listRelateRelation?.id === ri.id
                            ? 'bg-blue-700 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {ri.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Item picker (entity or list depending on mode) */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  {listRelateState.mode === 'entity-pick' ? 'Select entity' : 'Select list'}
                  {listRelateSelectedList && (
                    <span className="ml-2 normal-case font-normal text-emerald-400">
                      ✓ {listRelateSelectedList._name ?? listRelateSelectedList._id}
                    </span>
                  )}
                </p>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                  </svg>
                  <input
                    type="text"
                    value={listRelateSearch}
                    onChange={(e) => { setListRelateSearch(e.target.value); setListRelatePage(0) }}
                    placeholder="Search by name…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  {listRelateSearchLoading && (
                    <div className="flex items-center justify-center py-6 text-slate-500 text-xs">Loading…</div>
                  )}
                  {!listRelateSearchLoading && listRelateResults.length === 0 && (
                    <div className="flex items-center justify-center py-6 text-slate-500 text-xs">No results</div>
                  )}
                  {!listRelateSearchLoading && listRelateResults.map((r) => {
                    const id = r._id ?? r.id
                    const isSelected = (listRelateSelectedList?._id ?? listRelateSelectedList?.id) === id
                    return (
                      <button
                        key={id}
                        onClick={() => setListRelateSelectedList(r)}
                        className={`w-full text-left flex items-center justify-between px-3 py-2 text-xs border-b border-slate-800 last:border-0 transition-colors ${
                          isSelected ? 'bg-blue-900/40 text-blue-300' : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="font-mono truncate">{r._name ?? id}</span>
                        <span className="shrink-0 ml-2 text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{r._sourceNavItem?.label ?? ''}</span>
                      </button>
                    )
                  })}
                </div>
                {/* Picker pagination */}
                {(listRelatePage > 0 || listRelateHasMore) && (
                  <div className="flex items-center justify-between pt-1.5">
                    <button
                      onClick={() => setListRelatePage((p) => Math.max(0, p - 1))}
                      disabled={listRelatePage === 0}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    >← Prev</button>
                    <span className="text-[10px] text-slate-500">Page {listRelatePage + 1}</span>
                    <button
                      onClick={() => setListRelatePage((p) => p + 1)}
                      disabled={!listRelateHasMore}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    >Next →</button>
                  </div>
                )}
              </div>

              {/* Auto-filled IDs preview */}
              {(listRelateState.row || listRelateSelectedList) && (
                <div className="flex gap-3 text-[10px] font-mono text-slate-500">
                  {listRelateState.mode === 'entity-pick' ? (
                    <>
                      <span>_listId: <span className="text-slate-300">{listRelateState.row?._id ?? listRelateState.row?.id ?? '—'}</span></span>
                      <span>_entityId: <span className={listRelateSelectedList ? 'text-emerald-400' : 'text-slate-600'}>{listRelateSelectedList?._id ?? listRelateSelectedList?.id ?? '—'}</span></span>
                    </>
                  ) : (
                    <>
                      <span>_entityId: <span className="text-slate-300">{listRelateState.row?._id ?? listRelateState.row?.id ?? '—'}</span></span>
                      <span>_listId: <span className={listRelateSelectedList ? 'text-emerald-400' : 'text-slate-600'}>{listRelateSelectedList?._id ?? listRelateSelectedList?.id ?? '—'}</span></span>
                    </>
                  )}
                </div>
              )}

              {/* Extra relation fields */}
              {listRelateRelation && listRelateWritableFields.length > 0 && (
                <>
                  <hr className="border-slate-700" />
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Relationship details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      {listRelateWritableFields.map((field) => (
                        <div key={field.name} className="flex flex-col gap-1">
                          <label className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                            {field.name}
                            {field.required && <span className="text-red-400">*</span>}
                          </label>
                          {renderCreateField(
                            field,
                            listRelateFormValues[field.name],
                            (v) => setListRelateFormValues((prev) => ({ ...prev, [field.name]: v }))
                          )}
                          {field.description && <p className="text-[10px] text-slate-500">{field.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sticky footer: error + actions */}
            <div className="px-4 pb-4 pt-3 space-y-3 shrink-0 border-t border-slate-700/50">
              {/* Error */}
              {listRelateError && (
                <div className="text-red-400 text-sm space-y-1">
                  <p>{listRelateError.message}</p>
                  {listRelateError.details?.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 text-red-300">
                      {listRelateError.details.map((d, i) => (
                        <li key={i}>{d.path ? `${d.path}: ${d.message}` : d.field ? `${d.field}: ${d.message}` : d.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleListRelateSubmit}
                  disabled={listRelating || !listRelateRelation || !listRelateSelectedList}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  {listRelating ? 'Saving…' : 'Save relation'}
                </button>
                <button
                  onClick={() => setListRelateState(null)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
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
          onRowActivate={canActivate ? handleActivateRow : undefined}
          onRowDeactivate={canDeactivate ? handleDeactivateRow : undefined}
          sortOrder={sortOrder}
          onSortColumn={navItem?.hasFilterOrder ? handleSortColumn : undefined}
          traversals={navItem?.children ?? []}
          onFetchItem={navItem?.itemPathTemplate ? handleFetchItem : undefined}
          onFetchTraversal={handleFetchTraversal}
          onTraversalPost={handleTraversalPost}
          onTraversalOpenCreate={handleTraversalOpenCreate}
          onTraversalDeleteAll={handleTraversalDeleteAll}
          onTraversalPatchAll={handleTraversalPatchAll}
          onFetchRelatedRecord={handleFetchRelatedRecord}
          onTraversalRelateToList={handleTraversalRelateToList}
          relateTraversalIds={relateTraversalIds}
          externalRefreshKey={traversalRefreshSignal}
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

        {navItem?.hasPagination && (
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
        )}
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
    <Outlet />
    </>
  )
}
