import { Fragment, useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

// ─── Managed fields registry ───────────────────────────────────────────────
const MANAGED_FIELDS_META = {
  _id:                  { label: 'ID',                  desc: 'Unique identifier of the record.',                                                                          type: 'string'   },
  _kind:                { label: 'Kind',                desc: 'Kind of the record. Immutable after creation. Used to segregate objects in the same collection.',            type: 'string'   },
  _name:                { label: 'Name',                desc: 'Name of the record. Mandatory field.',                                                                      type: 'string'   },
  _slug:                { label: 'Slug',                desc: 'Auto-filled slug derived from the name field on create or update.',                                         type: 'string'   },
  _visibility:          { label: 'Visibility',          desc: 'Record visibility level: private, protected, or public. Gateway enforces query behavior based on this.',    type: 'string'   },
  _version:             { label: 'Version',             desc: 'Auto-incremented on each update and replace. Read-only for callers.',                                       type: 'number'   },
  _entityId:            { label: 'Entity ID',           desc: 'ID of the related entity. Used in list-entity-relation and entity-reaction models.',                        type: 'string'   },
  _listId:              { label: 'List ID',             desc: 'ID of the related list. Used in list-entity-relation and list-reaction models.',                            type: 'string'   },
  _fromMetadata:        { label: 'From Metadata',       desc: 'Metadata of the source list, populated when querying list-entity-relation models.',                         type: 'object'   },
  _toMetadata:          { label: 'To Metadata',         desc: 'Metadata of the target entity, populated when querying list-entity-relation models.',                       type: 'object'   },
  _relationMetadata:    { label: 'Relation Metadata',   desc: 'Join-table metadata populated only on through-query endpoints (never on direct endpoints).',                type: 'object'   },
  _ownerUsers:          { label: 'Owner Users',         desc: 'Array of user IDs who own this record.',                                                                    type: 'array'    },
  _ownerGroups:         { label: 'Owner Groups',        desc: 'Array of group names who own this record.',                                                                 type: 'array'    },
  _ownerUsersCount:     { label: 'Owner Users Count',   desc: 'Number of items in the ownerUsers array. Useful for querying records with no owners.',                      type: 'number'   },
  _ownerGroupsCount:    { label: 'Owner Groups Count',  desc: 'Number of items in the ownerGroups array. Useful for querying records with no owners.',                     type: 'number'   },
  _viewerUsers:         { label: 'Viewer Users',        desc: 'Array of user IDs who can view this record.',                                                               type: 'array'    },
  _viewerGroups:        { label: 'Viewer Groups',       desc: 'Array of group names who can view this record.',                                                            type: 'array'    },
  _viewerUsersCount:    { label: 'Viewer Users Count',  desc: 'Number of items in the viewerUsers array. Useful for querying records with no viewers.',                    type: 'number'   },
  _viewerGroupsCount:   { label: 'Viewer Groups Count', desc: 'Number of items in the viewerGroups array. Useful for querying records with no viewers.',                   type: 'number'   },
  _parentsCount:        { label: 'Parents Count',       desc: 'Number of parent records. Useful for retrieving only root-level records.',                                  type: 'number'   },
  _createdBy:           { label: 'Created By',          desc: 'ID of the user who created this record.',                                                                   type: 'string'   },
  _createdDateTime:     { label: 'Created At',          desc: 'Datetime when the record was created. May be modified by admin users.',                                     type: 'datetime' },
  _lastUpdatedDateTime: { label: 'Last Updated At',     desc: 'Datetime of the last update operation. May be modified by admin users.',                                    type: 'datetime' },
  _lastUpdatedBy:       { label: 'Last Updated By',     desc: 'ID of the user who performed the last update. May be modified by admin users.',                             type: 'string'   },
  _validFromDateTime:   { label: 'Valid From',          desc: 'Datetime when the record becomes valid. Can be treated as the approval time.',                              type: 'datetime' },
  _validUntilDateTime:  { label: 'Valid Until',         desc: 'Datetime when the record validity ends. Can be used instead of deleting records.',                          type: 'datetime' },
  _idempotencyKey:      { label: 'Idempotency Key',     desc: "Hashed string for uniqueness, computed using the record's fields.",                                         type: 'string'   },
  _recordType:          { label: 'Record Type',         desc: 'Virtual read-only field indicating record type: entity, list, relation, entityReaction, or listReaction.',  type: 'string'   },
}

const MANAGED_FIELD_ORDER = [
  '_id', '_name', '_slug', '_kind', '_visibility', '_version', '_recordType',
  '_entityId', '_listId',
  '_createdBy', '_createdDateTime', '_lastUpdatedDateTime', '_lastUpdatedBy',
  '_validFromDateTime', '_validUntilDateTime',
  '_ownerUsers', '_ownerGroups', '_ownerUsersCount', '_ownerGroupsCount',
  '_viewerUsers', '_viewerGroups', '_viewerUsersCount', '_viewerGroupsCount',
  '_parentsCount', '_idempotencyKey',
  '_fromMetadata', '_toMetadata', '_relationMetadata',
]

function TypeIcon({ type }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0'
  if (type === 'datetime') return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
  if (type === 'array') return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
  if (type === 'number') return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  )
  if (type === 'object') return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l-4 4 4 4m10-8l4 4-4 4m-5-12l-2 16" />
    </svg>
  )
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
    </svg>
  )
}

function ManagedFieldValue({ fieldKey, value, type }) {
  if (value === undefined || value === null) {
    return <span className="text-slate-600 italic text-xs">null</span>
  }
  const isArr = type === 'array' || Array.isArray(value)
  if (isArr) {
    const arr = Array.isArray(value) ? value : [value]
    if (arr.length === 0) return <span className="text-slate-600 italic text-xs">empty array</span>
    return (
      <div className="flex flex-wrap gap-1.5 mt-0.5">
        {arr.map((item, idx) => (
          <span key={idx} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
            {String(item)}
          </span>
        ))}
      </div>
    )
  }
  if (type === 'datetime') {
    return (
      <span className="text-slate-200 text-xs font-mono" title={fmt(value)}>{timeAgo(value)}</span>
    )
  }
  if (type === 'object' && typeof value === 'object') {
    return (
      <pre className="mt-0.5 text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap break-all leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }
  if (type === 'number') {
    return <span className="text-sky-300 font-mono text-sm font-medium">{value}</span>
  }
  if (fieldKey === '_visibility') {
    const colors = {
      public:    'bg-emerald-900/40 text-emerald-300 border-emerald-700/60',
      protected: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
      private:   'bg-rose-900/40 text-rose-300 border-rose-700/60',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${colors[value] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
        {value}
      </span>
    )
  }
  if (fieldKey === '_recordType') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-700/60 text-violet-300 text-xs font-medium">
        {value}
      </span>
    )
  }
  return <span className="text-slate-200 font-mono text-xs break-all">{String(value)}</span>
}

function renderCompactValue(key, value, type) {
  if (value === null || value === undefined)
    return <span className="text-slate-600 italic text-[11px]">—</span>

  if (type === 'array' || Array.isArray(value)) {
    const arr = Array.isArray(value) ? value : []
    if (arr.length === 0)
      return <span className="text-slate-600 italic text-[11px]">empty</span>
    const preview = arr.slice(0, 3).map(String).join(', ')
    return (
      <span className="text-sky-300 text-[11px] font-mono" title={arr.join(', ')}>
        {preview}{arr.length > 3 ? <span className="text-slate-500"> +{arr.length - 3}</span> : ''}
      </span>
    )
  }
  if (type === 'datetime') {
    return <span className="text-violet-300 text-[11px] font-mono" title={fmt(value)}>{timeAgo(value)}</span>
  }
  if (type === 'object' && typeof value === 'object') {
    return <span className="text-emerald-400 text-[11px] font-mono cursor-help" title={JSON.stringify(value, null, 2)}>{'{…}'}</span>
  }
  if (type === 'number') {
    return <span className="text-sky-300 text-[11px] font-mono">{value}</span>
  }
  if (key === '_visibility') {
    const colors = { public: 'text-emerald-400', protected: 'text-amber-400', private: 'text-rose-400' }
    return <span className={`text-[11px] font-medium ${colors[value] ?? 'text-slate-300'}`}>{value}</span>
  }
  if (key === '_recordType') {
    return <span className="text-violet-300 text-[11px]">{value}</span>
  }
  const str = String(value)
  const display = str.length > 32 ? `${str.slice(0, 14)}…${str.slice(-8)}` : str
  return <span className="text-slate-200 text-[11px] font-mono" title={str.length > 32 ? str : undefined}>{display}</span>
}

const EXCLUDE_FROM_PANEL = new Set(['_id', '_name', '_kind'])

const ACCESS_FIELDS = new Set([
  '_visibility',
  '_ownerUsers', '_ownerGroups', '_ownerUsersCount', '_ownerGroupsCount',
  '_viewerUsers', '_viewerGroups', '_viewerUsersCount', '_viewerGroupsCount',
])

function FieldRow({ fieldKey, meta, value }) {
  const detectedType = meta?.type
    ?? (Array.isArray(value) ? 'array'
      : typeof value === 'object' && value !== null ? 'object'
      : typeof value)

  const TYPE_COLOR = {
    datetime: 'text-violet-400',
    array:    'text-sky-400',
    number:   'text-sky-400',
    object:   'text-emerald-400',
    string:   'text-slate-500',
  }

  return (
    <div className="flex items-center gap-2 py-1 min-w-0">
      <span className={`flex-shrink-0 ${TYPE_COLOR[detectedType] ?? 'text-slate-500'}`}>
        <TypeIcon type={detectedType} />
      </span>
      <span className="text-slate-500 text-[11px] font-mono flex-shrink-0 w-36 truncate" title={fieldKey}>
        {fieldKey}
      </span>
      <span className="min-w-0 truncate">
        {renderCompactValue(fieldKey, value, detectedType)}
      </span>
    </div>
  )
}

function ManagedFieldsPanel({ row, onEdit, onActivate, onDelete }) {
  const accessFields = []
  const otherFields = []
  const nonManagedFields = []

  // Collect non-managed fields (not starting with _)
  for (const key of Object.keys(row)) {
    if (!key.startsWith('_')) {
      nonManagedFields.push({ key, meta: null, value: row[key] })
    }
  }

  for (const key of MANAGED_FIELD_ORDER) {
    if (EXCLUDE_FROM_PANEL.has(key)) continue
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue
    const entry = { key, meta: MANAGED_FIELDS_META[key] ?? null, value: row[key] }
    if (ACCESS_FIELDS.has(key)) accessFields.push(entry)
    else otherFields.push(entry)
  }
  for (const key of Object.keys(row)) {
    if (key.startsWith('_') && !MANAGED_FIELD_ORDER.includes(key) && !EXCLUDE_FROM_PANEL.has(key)) {
      const entry = { key, meta: null, value: row[key] }
      if (ACCESS_FIELDS.has(key)) accessFields.push(entry)
      else otherFields.push(entry)
    }
  }

  if (nonManagedFields.length === 0 && accessFields.length === 0 && otherFields.length === 0) return null

  return (
    <div className="bg-slate-950/60 border-t border-slate-700/40 px-4 py-2.5">
      <div className="flex gap-6 flex-wrap">
        {nonManagedFields.length > 0 && (
          <div className="min-w-0" style={{ width: 280 }}>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-1.5">Fields</p>
            {nonManagedFields.map(({ key, meta, value }) => (
              <FieldRow key={key} fieldKey={key} meta={meta} value={value} />
            ))}
          </div>
        )}
        {otherFields.length > 0 && (
          <div className="min-w-0" style={{ width: 440 }}>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-1.5">Record</p>
            {otherFields.map(({ key, meta, value }) => (
              <FieldRow key={key} fieldKey={key} meta={meta} value={value} />
            ))}
          </div>
        )}
        {accessFields.length > 0 && (
          <div className="w-72 flex-shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-1.5">Access & Visibility</p>
            {accessFields.map(({ key, meta, value }) => (
              <FieldRow key={key} fieldKey={key} meta={meta} value={value} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/70">
        {onActivate && (
          <button
            onClick={onActivate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-300 hover:text-emerald-100 border border-emerald-700/50 hover:border-emerald-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Activate
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-900/30 hover:bg-rose-800/50 text-rose-400 hover:text-rose-200 border border-rose-800/50 hover:border-rose-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function computeRowStatus(row) {
  const from = row._validFromDateTime ? new Date(row._validFromDateTime) : null
  const until = row._validUntilDateTime ? new Date(row._validUntilDateTime) : null
  const now = new Date()
  if (!from && !until) return 'pending'
  if (until && until < now) return 'expired'
  if (from && from > now) return 'pending'
  return 'active'
}

const STATUS_SHADOW_COLOR = {
  active: '#10b981',
  pending: '#fbbf24',
  expired: '#f43f5e',
}

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return fmt(dateStr)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

const RELATIVE_DATE_KEYS = new Set(['_updatedDateTime', '_createdDateTime', '_lastUpdatedDateTime'])

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function DataGrid({ columns, data, loading, error, onRefresh, onRowClick, hasValidityDates, onRowDelete, onRowActivate }) {
  const [copiedId, setCopiedId] = useState(null)
  const resetCopyTimerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [colTooltip, setColTooltip] = useState(null)
  const [expandedRowId, setExpandedRowId] = useState(null)
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null)
  const scrollContainerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(null)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const shortId = (id) => {
    if (!id) return '—'
    if (id.length <= 14) return id
    return `${id.slice(0, 6)}...${id.slice(-4)}`
  }

  const copyId = async (e, value) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(value)
      if (resetCopyTimerRef.current) {
        clearTimeout(resetCopyTimerRef.current)
      }
      resetCopyTimerRef.current = setTimeout(() => {
        setCopiedId(null)
      }, 1800)
    } catch {
      // clipboard permission can be denied
    }
  }

  useEffect(() => {
    return () => {
      if (resetCopyTimerRef.current) {
        clearTimeout(resetCopyTimerRef.current)
      }
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        <svg className="animate-spin w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        No records found
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="overflow-x-auto rounded-xl border border-slate-800">
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-16">Valid from</span>
              <span className="text-slate-200 font-mono">{fmt(tooltip.row._validFromDateTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-16">Valid until</span>
              <span className="text-slate-200 font-mono">{fmt(tooltip.row._validUntilDateTime)}</span>
            </div>
          </div>
        </div>
      )}
      {colTooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 shadow-xl"
          style={{ left: colTooltip.x, top: colTooltip.y }}
        >
          <span className="font-mono text-xs text-slate-300">{colTooltip.key}</span>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/60 border-b border-slate-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-default"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setColTooltip({ key: col.key, x: rect.left, y: rect.bottom + 4 })
                }}
                onMouseLeave={() => setColTooltip(null)}
              >
                {col.label}
              </th>
            ))}
            <th className="w-10 px-2 py-3 sticky right-0 bg-slate-800/60" style={{ minWidth: Math.max(40, [onRowClick, onRowDelete, onRowActivate].filter(Boolean).length * 36) }} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.map((row, i) => {
            const status = hasValidityDates ? computeRowStatus(row) : null
            const rowId = row._id ?? i
            const isExpanded = expandedRowId === rowId
            return (
            <Fragment key={rowId}>
            <tr
              className="group transition-colors hover:bg-slate-800/40 cursor-pointer"
              onClick={() => setExpandedRowId(isExpanded ? null : rowId)}
            >
              {columns.map((col, colIdx) => (
                <td
                  key={col.key}
                  className="px-4 py-3 text-slate-300 whitespace-nowrap max-w-[220px] truncate"
                  style={colIdx === 0 && status ? {
                    boxShadow: `inset ${hoveredRow === i ? 7 : 4}px 0 0 ${STATUS_SHADOW_COLOR[status]}`,
                    transition: 'box-shadow 150ms ease',
                  } : undefined}
                  onMouseEnter={colIdx === 0 && status ? (e) => {
                    setHoveredRow(i)
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTooltip({ x: rect.left + 16, y: rect.bottom + 6, row })
                  } : undefined}
                  onMouseLeave={colIdx === 0 && status ? () => {
                    setHoveredRow(null)
                    setTooltip(null)
                  } : undefined}
                >
                  {col.render
                    ? col.render(row[col.key], row)
                    : RELATIVE_DATE_KEYS.has(col.key) && row[col.key]
                      ? (
                        <span title={fmt(row[col.key])} className="cursor-default">
                          {timeAgo(row[col.key])}
                        </span>
                      )
                      : col.key === '_id' && typeof row[col.key] === 'string'
                      ? (
                        <div className="flex items-center gap-1.5" title={row[col.key]}>
                          <span className="font-mono text-xs text-slate-300">{shortId(row[col.key])}</span>
                          <button
                            onClick={(e) => copyId(e, row[col.key])}
                            className={`px-1.5 py-0.5 rounded border text-[10px] leading-none ${
                              copiedId === row[col.key]
                                ? 'border-emerald-600 bg-emerald-900/40 text-emerald-300'
                                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                            }`}
                            title={copiedId === row[col.key] ? 'Copied' : 'Copy full ID'}
                            aria-label="Copy ID"
                          >
                            {copiedId === row[col.key] ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )
                      : String(row[col.key] ?? '—')}
                </td>
              ))}
              <td className="px-2 py-3 text-center sticky right-0 bg-slate-900 group-hover:bg-slate-800/40" style={{ minWidth: Math.max(40, [onRowClick, onRowDelete, onRowActivate].filter(Boolean).length * 36) }}>
                <div className="flex items-center justify-center gap-1">
                {onRowActivate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRowActivate(row) }}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-900/30 transition-colors"
                    title="Activate (set valid from now)"
                    aria-label="Activate"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
                {onRowClick && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRowClick(row) }}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-900/30 transition-colors"
                    title="Edit record"
                    aria-label="Edit record"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                )}
                {onRowDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteRow(row) }}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-900/30 transition-colors"
                    title="Delete record"
                    aria-label="Delete record"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr className="border-b border-slate-700">
                <td colSpan={columns.length + 1} className="p-0">
                  <div style={{ position: 'sticky', left: 0, width: containerWidth ?? '100%' }}>
                    <ManagedFieldsPanel
                      row={row}
                      onEdit={onRowClick ? () => onRowClick(row) : undefined}
                      onActivate={onRowActivate ? () => onRowActivate(row) : undefined}
                      onDelete={onRowDelete ? () => setPendingDeleteRow(row) : undefined}
                    />
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
            )
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={pendingDeleteRow !== null}
        title="Delete record"
        message="This action cannot be undone."
        confirmLabel="Yes, delete"
        onConfirm={() => { onRowDelete(pendingDeleteRow); setPendingDeleteRow(null) }}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </div>
  )
}
