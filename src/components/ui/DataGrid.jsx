import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import ItemEditModal from './ItemEditModal'
import { useApiClient } from '../../services/apiClient'

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
      <pre className="mt-0.5 text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
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
  const [objectExpanded, setObjectExpanded] = useState(false)
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

  const isExpandableObj = detectedType === 'object' && typeof value === 'object' && value !== null

  return (
    <div className="py-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${TYPE_COLOR[detectedType] ?? 'text-slate-500'}`}>
          <TypeIcon type={detectedType} />
        </span>
        <span className="text-slate-500 text-[11px] font-mono flex-shrink-0 w-36 truncate" title={fieldKey}>
          {fieldKey}
        </span>
        <span className="min-w-0">
          {isExpandableObj ? (
            <button
              type="button"
              onClick={() => setObjectExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-mono hover:text-emerald-300 transition-colors"
            >
              <span>{'{…}'}</span>
              <svg className={`w-2.5 h-2.5 transition-transform ${objectExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            renderCompactValue(fieldKey, value, detectedType)
          )}
        </span>
      </div>
      {isExpandableObj && objectExpanded && (
        <pre className="ml-6 mt-1 text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ManagedFieldsPanel({ row, onEdit, onActivate, onDeactivate, onDelete }) {
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
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/70 -mx-4 px-4">
        {(onActivate || onDeactivate) && (
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            {onActivate && (
              <button
                onClick={onActivate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-300 hover:text-emerald-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Activate
              </button>
            )}
            {onActivate && onDeactivate && <span className="w-px bg-slate-700" />}
            {onDeactivate && (
              <button
                onClick={onDeactivate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-900/30 hover:bg-amber-800/50 text-amber-400 hover:text-amber-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Deactivate
              </button>
            )}
          </div>
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

const TRAVERSAL_PAGE_SIZE = 10

function RelatedItemCard({ item, copiedId, onCopyId, onEdit, visibleFields }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const id = item._id
  const shortId = id ? (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id) : null
  const unmanagedFields = Object.entries(item).filter(([k]) => {
    if (k.startsWith('_')) return false
    if (visibleFields !== null && visibleFields !== undefined && !visibleFields.has(k)) return false
    return true
  })

  const status = computeRowStatus(item)
  const borderColor = STATUS_SHADOW_COLOR[status]

  const visibilityLabel = item._visibility
    ? item._visibility.charAt(0).toUpperCase() + item._visibility.slice(1)
    : null
  const visibilityColor = item._visibility === 'public'
    ? 'text-emerald-400'
    : item._visibility === 'protected'
      ? 'text-amber-400'
      : item._visibility === 'private'
        ? 'text-rose-400'
        : 'text-slate-500'

  // Organize fields like ManagedFieldsPanel does
  const accessFields = []
  const otherFields = []
  const nonManagedFields = []

  if (isExpanded) {
    // Collect non-managed fields (not starting with _)
    for (const key of Object.keys(item)) {
      if (!key.startsWith('_')) {
        nonManagedFields.push({ key, meta: null, value: item[key] })
      }
    }

    // Collect managed fields in order
    for (const key of MANAGED_FIELD_ORDER) {
      if (EXCLUDE_FROM_PANEL.has(key)) continue
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue
      const entry = { key, meta: MANAGED_FIELDS_META[key] ?? null, value: item[key] }
      if (ACCESS_FIELDS.has(key)) accessFields.push(entry)
      else otherFields.push(entry)
    }
    // Collect any remaining managed fields not in the order list
    for (const key of Object.keys(item)) {
      if (key.startsWith('_') && !MANAGED_FIELD_ORDER.includes(key) && !EXCLUDE_FROM_PANEL.has(key)) {
        const entry = { key, meta: null, value: item[key] }
        if (ACCESS_FIELDS.has(key)) accessFields.push(entry)
        else otherFields.push(entry)
      }
    }
  }

  return (
    <div className="rounded border border-slate-800 hover:border-slate-600 transition-colors">
      <div
        className="group flex items-center gap-2 pl-3 pr-2 py-1.5 hover:bg-slate-800/50 transition-colors min-w-0"
        style={{ boxShadow: `inset 3px 0 0 ${borderColor}` }}
      >
        {/* short ID + copy */}
        {id && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="font-mono text-[10px] text-slate-500" title={id}>{shortId}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCopyId(id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-500 hover:text-slate-300"
              title="Copy ID"
              aria-label="Copy ID"
            >
              {copiedId === id ? (
                <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
          </div>
        )}
        {/* kind badge */}
        {item._kind && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-violet-900/40 border border-violet-700/50 text-violet-300 text-[10px]">{item._kind}</span>
        )}
        {/* name + visibility grouped, left-aligned */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {item._name && (
            <span className="text-slate-200 text-xs font-medium truncate min-w-0" title={item._name}>{item._name}</span>
          )}
          {visibilityLabel && (
            <span className={`flex-shrink-0 text-[10px] font-medium ${visibilityColor}`}>{visibilityLabel}</span>
          )}
        </div>
        {/* unmanaged fields inline as key: value pairs */}
        {unmanagedFields.map(([k, v]) => (
          <span key={k} className="flex-shrink-0 text-[10px] text-slate-500 hidden sm:inline">
            <span className="text-slate-600">{k}:</span>{' '}
            <span className="text-slate-300 font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </span>
        ))}
        {/* expand button */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-blue-300 hover:bg-slate-700"
          title={isExpanded ? "Collapse fields" : "Expand all fields"}
          aria-label={isExpanded ? "Collapse fields" : "Expand all fields"}
        >
          <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {/* edit button */}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(item) }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-700"
            title="View / Edit record"
            aria-label="View / Edit record"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
        )}
      </div>
      {/* Expanded fields view - matching ManagedFieldsPanel layout */}
      {isExpanded && (
        <div className="border-t border-slate-800 bg-slate-950/40 px-3 py-2">
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
        </div>
      )}
    </div>
  )
}

function ExpandedRowPanel({
  row, fullRecord, fullRecordLoading,
  traversals, selectedTraversal, onSelectTraversal,
  traversalData, traversalLoading, traversalPage, traversalHasNextPage,
  onTraversalPrev, onTraversalNext,
  onAddItem, onDeleteAll, onUpdateAll,
  copiedId, onCopyId,
  onEdit, onActivate, onDeactivate, onDelete,
  onViewTraversalItem,
  traversalStatusFilter, onTraversalStatusFilterChange,
  traversalVisibilityFilter, onTraversalVisibilityFilterChange,
  traversalSortField, onTraversalSortFieldChange,
  traversalSortDir, onTraversalSortDirChange,
  traversalVisibleFields, onTraversalVisibleFieldsChange,
}) {
  const displayRecord = fullRecord ?? row
  const title = displayRecord._name ?? displayRecord._kind ?? null

  // Synthetic traversals derived from relation/reaction ID fields
  const syntheticTraversals = []
  if (displayRecord._entityId) {
    syntheticTraversals.push({ subResource: '__entity', label: 'Related Entity', synthetic: true, fieldValue: displayRecord._entityId, methods: [] })
  }
  if (displayRecord._listId) {
    syntheticTraversals.push({ subResource: '__list', label: 'Related List', synthetic: true, fieldValue: displayRecord._listId, methods: [] })
  }
  const allTraversals = [...(traversals ?? []), ...syntheticTraversals]
  const hasTraversalOptions = allTraversals.length > 0

  // Derive available sort/visible fields from traversal data
  const availableFields = selectedTraversal && !selectedTraversal.synthetic && traversalData.length > 0
    ? [...new Set(traversalData.flatMap((item) => Object.keys(item)))]
    : []
  const availableSortFields = availableFields.filter((k) => !['_slug', '_fromMetadata', '_toMetadata'].includes(k))
  const availableVisibleFields = availableFields.filter((k) => !k.startsWith('_'))

  const showFilterBar = selectedTraversal && !selectedTraversal.synthetic

  return (
    <div className="bg-slate-950/60 border-t border-slate-700/40">
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-slate-800">
        {/* Record name */}
        {title && (
          <div className="flex items-center gap-1.5 px-4 flex-shrink-0">
            {fullRecordLoading && (
              <svg className="animate-spin w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            <span className="text-xs font-semibold text-slate-300 truncate max-w-[180px]" title={title}>{title}</span>
            <span className="text-slate-700 select-none">|</span>
          </div>
        )}
        {/* Tabs */}
        <div className="flex items-stretch overflow-x-auto">
          <button
            onClick={() => onSelectTraversal(null)}
            className={`px-3 py-2 text-[11px] whitespace-nowrap border-b-2 transition-colors ${
              !selectedTraversal
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            Record
          </button>
          {allTraversals.map((t) => (
            <button
              key={t.subResource}
              onClick={() => onSelectTraversal(t)}
              className={`px-3 py-2 text-[11px] whitespace-nowrap border-b-2 transition-colors ${
                selectedTraversal?.subResource === t.subResource
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-slate-500 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar – only for real (non-synthetic) traversals */}
      {showFilterBar && (
        <div className="px-4 py-2 border-b border-slate-800/70 flex flex-wrap gap-x-4 gap-y-2 items-center">
          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Status</span>
            <div className="inline-flex rounded border border-slate-700 overflow-hidden">
              {[null, 'actives', 'pendings', 'expireds'].map((val, i) => (
                <button
                  key={i}
                  onClick={() => onTraversalStatusFilterChange(val)}
                  className={`px-2 py-0.5 text-[10px] border-r border-slate-700 last:border-r-0 transition-colors ${
                    traversalStatusFilter === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {val === null ? 'All' : val.charAt(0).toUpperCase() + val.slice(1, -1)}
                </button>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Visibility</span>
            <div className="inline-flex rounded border border-slate-700 overflow-hidden">
              {[null, 'publics', 'protecteds', 'privates'].map((val, i) => (
                <button
                  key={i}
                  onClick={() => onTraversalVisibilityFilterChange(val)}
                  className={`px-2 py-0.5 text-[10px] border-r border-slate-700 last:border-r-0 transition-colors ${
                    traversalVisibilityFilter === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {val === null ? 'All' : val.charAt(0).toUpperCase() + val.slice(1, -1)}
                </button>
              ))}
            </div>
          </div>

          {/* Sort field + direction */}
          {availableSortFields.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Sort</span>
              <select
                value={traversalSortField}
                onChange={(e) => onTraversalSortFieldChange(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-600"
              >
                <option value="">— none —</option>
                {availableSortFields.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              {traversalSortField && (
                <div className="inline-flex rounded border border-slate-700 overflow-hidden">
                  {['ASC', 'DESC'].map((dir) => (
                    <button
                      key={dir}
                      onClick={() => onTraversalSortDirChange(dir)}
                      className={`px-2 py-0.5 text-[10px] border-r border-slate-700 last:border-r-0 transition-colors ${
                        traversalSortDir === dir
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Visible fields */}
          {availableVisibleFields.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Fields</span>
              <div className="flex flex-wrap gap-1">
                {availableVisibleFields.map((f) => {
                  const active = traversalVisibleFields === null || traversalVisibleFields.has(f)
                  return (
                    <button
                      key={f}
                      onClick={() => {
                        if (traversalVisibleFields === null) {
                          // currently all visible; hide this one
                          const next = new Set(availableVisibleFields.filter((x) => x !== f))
                          onTraversalVisibleFieldsChange(next.size === 0 ? null : next)
                        } else {
                          const next = new Set(traversalVisibleFields)
                          if (next.has(f)) {
                            next.delete(f)
                            onTraversalVisibleFieldsChange(next.size === 0 ? null : next)
                          } else {
                            next.add(f)
                            onTraversalVisibleFieldsChange(
                              next.size === availableVisibleFields.length ? null : next
                            )
                          }
                        }
                      }}
                      className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                        active
                          ? 'border-slate-600 bg-slate-700 text-slate-200'
                          : 'border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {f}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content: full record fields or traversal cards */}
      {!selectedTraversal ? (
        <ManagedFieldsPanel
          row={displayRecord}
          onEdit={onEdit}
          onActivate={onActivate}
          onDeactivate={onDeactivate}
          onDelete={onDelete}
        />
      ) : (
        <div>
          {traversalLoading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-xs text-slate-400">Loading {selectedTraversal.label}…</span>
            </div>
          ) : traversalData.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-500 text-xs">
              No {selectedTraversal.label} found.
            </div>
          ) : (
            <div>
              <div className="px-3 py-1.5 flex flex-col gap-1">
                {traversalData.map((item, idx) => (
                  <RelatedItemCard
                    key={item._id ?? idx}
                    item={item}
                    copiedId={copiedId}
                    onCopyId={onCopyId}
                    onEdit={onViewTraversalItem}
                    visibleFields={traversalVisibleFields}
                  />
                ))}
              </div>
            </div>
          )}
          {!selectedTraversal?.synthetic && (
          <div className="flex items-center gap-2 px-4 pt-2 pb-2.5 border-t border-slate-800/70">
            <button
              onClick={onTraversalPrev}
              disabled={traversalPage === 0 || traversalLoading}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={onTraversalNext}
              disabled={!traversalHasNextPage || traversalLoading}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <span className="text-[10px] text-slate-500 font-mono">page {traversalPage + 1}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {onAddItem && (
                <button
                  onClick={onAddItem}
                  disabled={traversalLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-800/60 text-emerald-400 hover:text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={`Add to ${selectedTraversal?.label}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add
                </button>
              )}
              {onUpdateAll && (
                <button
                  onClick={onUpdateAll}
                  disabled={traversalLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={`Update all ${selectedTraversal?.label}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Update All
                </button>
              )}
              {onDeleteAll && (
                <button
                  onClick={onDeleteAll}
                  disabled={traversalLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-rose-900/30 hover:bg-rose-800/50 border border-rose-800/50 text-rose-400 hover:text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={`Delete all ${selectedTraversal?.label}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete All
                </button>
              )}
            </div>
          </div>
          )}
        </div>
      )}
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

export default function DataGrid({ columns, data, loading, error, onRefresh, onRowClick, hasValidityDates, onRowDelete, onRowActivate, onRowDeactivate, sortOrder, onSortColumn, traversals, onFetchItem, onFetchTraversal, onTraversalPost, onTraversalOpenCreate, onTraversalDeleteAll, onTraversalPatchAll, onFetchRelatedRecord, onTraversalRelateToList, externalRefreshKey = 0, relateTraversalIds = null }) {
  const [copiedId, setCopiedId] = useState(null)
  const resetCopyTimerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [colTooltip, setColTooltip] = useState(null)
  const [expandedRowId, setExpandedRowId] = useState(null)
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null)
  const [pendingActivateRow, setPendingActivateRow] = useState(null)
  const [pendingDeactivateRow, setPendingDeactivateRow] = useState(null)
  const [actionsExpanded, setActionsExpanded] = useState(false)
  const scrollRoRef = useRef(null)
  const scrollContainerRef = useCallback((el) => {
    if (scrollRoRef.current) { scrollRoRef.current.disconnect(); scrollRoRef.current = null }
    if (!el) return
    el.style.setProperty('--cw', el.clientWidth + 'px')
    const ro = new ResizeObserver(() => el.style.setProperty('--cw', el.clientWidth + 'px'))
    ro.observe(el)
    scrollRoRef.current = ro
  }, [])

  // Traversal / full-record expansion state
  const [fullRecord, setFullRecord] = useState(null)
  const [fullRecordLoading, setFullRecordLoading] = useState(false)
  const [selectedTraversal, setSelectedTraversal] = useState(null)
  const [traversalData, setTraversalData] = useState([])
  const [traversalLoading, setTraversalLoading] = useState(false)
  const [traversalPage, setTraversalPage] = useState(0)
  const [rowTraversalDropdownOpenId, setRowTraversalDropdownOpenId] = useState(null)
  const [traversalActionModal, setTraversalActionModal] = useState(null) // { type: 'post'|'patch' }
  const [traversalDeleteAllPending, setTraversalDeleteAllPending] = useState(false)
  const [traversalActionLoading, setTraversalActionLoading] = useState(false)
  const [traversalActionError, setTraversalActionError] = useState(null)
  const [traversalRefreshKey, setTraversalRefreshKey] = useState(0)
  const [relatedRecordModal, setRelatedRecordModal] = useState(null) // null | { loading, record, navItem, error }
  // Traversal card filter state
  const [traversalStatusFilter, setTraversalStatusFilter] = useState(null) // 'actives'|'pendings'|'expireds'|null
  const [traversalVisibilityFilter, setTraversalVisibilityFilter] = useState(null) // 'publics'|'protecteds'|'privates'|null
  const [traversalSortField, setTraversalSortField] = useState('')
  const [traversalSortDir, setTraversalSortDir] = useState('ASC')
  const [traversalVisibleFields, setTraversalVisibleFields] = useState(null) // null = all, or Set<string>
  const api = useApiClient()
  const rowTraversalDropdownRef = useRef(null)
  const pendingTraversalRef = useRef(null)
  const hasTraversals = traversals?.length > 0
  const expandedRow = data?.find((r, i) => (r._id ?? i) === expandedRowId) ?? null

  const actionColWidth = Math.max(40, [onRowClick, onRowDelete, onRowActivate, onRowDeactivate, hasTraversals ? true : null].filter(Boolean).length * 36)



  // Reset expansion state when the expanded row changes
  useEffect(() => {
    setFullRecord(null)
    setFullRecordLoading(false)
    const pending = pendingTraversalRef.current
    pendingTraversalRef.current = null
    setSelectedTraversal(pending)
    setTraversalData([])
    setTraversalPage(0)
  }, [expandedRowId])

  // Fetch the full record (no fieldset) when a row is expanded
  useEffect(() => {
    if (!expandedRowId || !onFetchItem) return undefined
    const expandedRow = data.find((r, i) => (r._id ?? i) === expandedRowId)
    if (!expandedRow) return undefined
    let cancelled = false
    setFullRecordLoading(true)
    onFetchItem(expandedRow)
      .then((rec) => { if (!cancelled && rec) setFullRecord(rec) })
      .catch(() => { /* fall back to list data */ })
      .finally(() => { if (!cancelled) setFullRecordLoading(false) })
    return () => { cancelled = true }
  // data intentionally omitted — refetch only when row identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRowId, onFetchItem])

  // Fetch related items when a traversal is selected or page changes
  useEffect(() => {
    if (!selectedTraversal || !expandedRowId) return undefined
    let cancelled = false
    setTraversalLoading(true)
    setTraversalData([])
    if (selectedTraversal.synthetic) {
      // Synthetic traversal: fetch a single record by its related ID field
      if (!onFetchRelatedRecord || !selectedTraversal.fieldValue) {
        setTraversalLoading(false)
        return undefined
      }
      onFetchRelatedRecord(selectedTraversal.fieldValue)
        .then((result) => { if (!cancelled) setTraversalData(result?.record ? [result.record] : []) })
        .catch(() => { if (!cancelled) setTraversalData([]) })
        .finally(() => { if (!cancelled) setTraversalLoading(false) })
      return () => { cancelled = true }
    }
    if (!onFetchTraversal) {
      setTraversalLoading(false)
      return undefined
    }
    const row = data?.find((r, i) => (r._id ?? i) === expandedRowId)
    if (!row) {
      setTraversalLoading(false)
      return undefined
    }
    onFetchTraversal(row, selectedTraversal.pathTemplate, traversalPage, TRAVERSAL_PAGE_SIZE, {
      statusFilter: traversalStatusFilter,
      visibilityFilter: traversalVisibilityFilter,
      sortField: traversalSortField,
      sortDir: traversalSortDir,
    })
      .then((items) => { if (!cancelled) setTraversalData(Array.isArray(items) ? items : []) })
      .catch(() => { if (!cancelled) setTraversalData([]) })
      .finally(() => { if (!cancelled) setTraversalLoading(false) })
    return () => { cancelled = true }
  // data intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTraversal, traversalPage, expandedRowId, onFetchTraversal, traversalRefreshKey, externalRefreshKey, onFetchRelatedRecord, traversalStatusFilter, traversalVisibilityFilter, traversalSortField, traversalSortDir])

  // Click-outside: row-level traversal dropdown
  useEffect(() => {
    if (rowTraversalDropdownOpenId === null) return undefined
    const handler = (e) => {
      if (rowTraversalDropdownRef.current && !rowTraversalDropdownRef.current.contains(e.target)) {
        setRowTraversalDropdownOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [rowTraversalDropdownOpenId])

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
            {columns.map((col) => {
              const sortEntry = sortOrder?.find((s) => s.field === col.key)
              const isSorted = !!sortEntry
              return (
              <th
                key={col.key}
                className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap select-none transition-colors ${
                  onSortColumn ? 'cursor-pointer hover:bg-slate-700/50' : 'cursor-default'
                } ${isSorted ? 'text-blue-400' : 'text-slate-400'}`}
                onClick={onSortColumn ? () => onSortColumn(col.key) : undefined}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setColTooltip({ key: col.key, x: rect.left, y: rect.bottom + 4 })
                }}
                onMouseLeave={() => setColTooltip(null)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {isSorted ? (
                    sortEntry.dir === 'ASC' ? (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    )
                  ) : onSortColumn ? (
                    <svg className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                    </svg>
                  ) : null}
                </span>
              </th>
              )
            })}
            <th className="p-0 sticky right-0 bg-slate-900 border-l border-slate-700/50">
              <div className="flex items-center justify-center py-3 px-1" style={{ width: 34 }}>
                <button
                  onClick={() => setActionsExpanded(v => !v)}
                  className="flex items-center justify-center w-6 h-6 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                  title={actionsExpanded ? 'Collapse actions' : 'Expand actions'}
                  aria-label={actionsExpanded ? 'Collapse actions' : 'Expand actions'}
                >
                  {actionsExpanded ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 19.5l7.5-7.5-7.5-7.5m6 15l7.5-7.5-7.5-7.5" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                    </svg>
                  )}
                </button>
              </div>
            </th>
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
                      : (col.key === '_entityId' || col.key === '_listId') && row[col.key] && onFetchRelatedRecord
                      ? (
                        <button
                          className="group/rlink text-sky-400 hover:text-sky-200 font-mono text-xs transition-colors"
                          title={`View related record: ${row[col.key]}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            const relId = row[col.key]
                            setRelatedRecordModal({ loading: true, record: null, navItem: null, error: null })
                            onFetchRelatedRecord(relId)
                              .then((result) => setRelatedRecordModal({ loading: false, record: result?.record ?? null, navItem: result?.navItem ?? null, error: result ? null : 'Record not found' }))
                              .catch((err) => setRelatedRecordModal({ loading: false, record: null, navItem: null, error: err?.message ?? 'Not found' }))
                          }}
                        >
                          <span className="underline underline-offset-2 group-hover/rlink:no-underline">{shortId(row[col.key])}</span>
                          <svg className="w-3 h-3 inline-block ml-1 opacity-0 group-hover/rlink:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </button>
                      )
                      : String(row[col.key] ?? '—')}
                </td>
              ))}
              <td className="p-0 text-center sticky right-0 bg-slate-900 group-hover:bg-slate-800 border-l border-slate-700/50">
                <div
                  className="overflow-hidden transition-all duration-200 ease-in-out"
                  style={{
                    maxWidth: actionsExpanded ? `${actionColWidth + 16}px` : '0px',
                    padding: actionsExpanded ? '12px 8px' : '12px 0px',
                  }}
                >
                <div className="flex items-center justify-center gap-1">
                {(onRowActivate || (onRowDeactivate && computeRowStatus(row) === 'active')) && (
                  <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
                    {onRowActivate && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingActivateRow(row) }}
                        className="p-1.5 text-slate-600 hover:text-emerald-400 hover:bg-emerald-900/30 transition-colors"
                        title="Activate (set valid from now)"
                        aria-label="Activate"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                    {onRowActivate && onRowDeactivate && computeRowStatus(row) === 'active' && (
                      <span className="w-px bg-slate-700 self-stretch" />
                    )}
                    {onRowDeactivate && computeRowStatus(row) === 'active' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDeactivateRow(row) }}
                        className="p-1.5 text-slate-600 hover:text-amber-400 hover:bg-amber-900/30 transition-colors"
                        title="Deactivate (set valid until now)"
                        aria-label="Deactivate"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    )}
                  </div>
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
                {hasTraversals && (
                  <div className="relative" ref={rowTraversalDropdownOpenId === rowId ? rowTraversalDropdownRef : null}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRowTraversalDropdownOpenId(rowTraversalDropdownOpenId === rowId ? null : rowId)
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-violet-900/30 transition-colors"
                      title="Browse related items"
                      aria-label="Browse related items"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                    </button>
                    {rowTraversalDropdownOpenId === rowId && (
                      <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        {traversals.map((t) => (
                          <button
                            key={t.subResource}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (expandedRowId === rowId) {
                                setSelectedTraversal(t)
                                setTraversalPage(0)
                              } else {
                                pendingTraversalRef.current = t
                                setExpandedRowId(rowId)
                              }
                              setRowTraversalDropdownOpenId(null)
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr>
                <td colSpan={columns.length + 1} className="p-0 border-b border-slate-700">
                  <div style={{ position: 'sticky', left: 0, width: 'var(--cw, 100%)' }}>
                    <ExpandedRowPanel
                      row={row}
                      fullRecord={fullRecord}
                      fullRecordLoading={fullRecordLoading}
                      traversals={traversals}
                      selectedTraversal={selectedTraversal}
                      onSelectTraversal={(t) => {
                        setSelectedTraversal(t)
                        setTraversalPage(0)
                        setTraversalStatusFilter(null)
                        setTraversalVisibilityFilter(null)
                        setTraversalSortField('')
                        setTraversalSortDir('ASC')
                        setTraversalVisibleFields(null)
                      }}
                      traversalData={traversalData}
                      traversalLoading={traversalLoading}
                      traversalPage={traversalPage}
                      traversalHasNextPage={traversalData.length === TRAVERSAL_PAGE_SIZE}
                      onTraversalPrev={() => setTraversalPage((p) => Math.max(0, p - 1))}
                      onTraversalNext={() => setTraversalPage((p) => p + 1)}
                      onAddItem={
                        (onTraversalRelateToList && relateTraversalIds?.has(selectedTraversal?.pathTemplate))
                          ? () => onTraversalRelateToList(expandedRow, selectedTraversal)
                          : selectedTraversal?.methods?.includes('post') && (onTraversalOpenCreate || onTraversalPost)
                            ? () => {
                                if (onTraversalOpenCreate) {
                                  onTraversalOpenCreate(expandedRow, selectedTraversal)
                                } else {
                                  setTraversalActionModal({ type: 'post', body: '{\n  \n}' })
                                }
                              }
                            : undefined
                      }
                      onUpdateAll={selectedTraversal?.methods?.includes('patch') && onTraversalPatchAll ? () => setTraversalActionModal({ type: 'patch', body: '{\n  \n}' }) : undefined}
                      onDeleteAll={selectedTraversal?.methods?.includes('delete') && onTraversalDeleteAll ? () => setTraversalDeleteAllPending(true) : undefined}
                      copiedId={copiedId}
                      onCopyId={(id) => {
                        navigator.clipboard.writeText(id).catch(() => {})
                        setCopiedId(id)
                        if (resetCopyTimerRef.current) clearTimeout(resetCopyTimerRef.current)
                        resetCopyTimerRef.current = setTimeout(() => setCopiedId(null), 1800)
                      }}
                      onEdit={onRowClick ? () => onRowClick(row) : undefined}
                      onActivate={onRowActivate ? () => setPendingActivateRow(row) : undefined}
                      onDeactivate={onRowDeactivate && computeRowStatus(row) === 'active' ? () => setPendingDeactivateRow(row) : undefined}
                      onDelete={onRowDelete ? () => setPendingDeleteRow(row) : undefined}
                      onViewTraversalItem={onFetchRelatedRecord ? (item) => {
                        const id = item._id ?? item.id
                        if (id) {
                          setRelatedRecordModal({ loading: true, record: null, navItem: null, error: null })
                          onFetchRelatedRecord(id)
                            .then((result) => setRelatedRecordModal({ loading: false, record: result?.record ?? item, navItem: result?.navItem ?? null, error: null }))
                            .catch(() => setRelatedRecordModal({ loading: false, record: item, navItem: null, error: null }))
                        } else {
                          setRelatedRecordModal({ loading: false, record: item, navItem: null, error: null })
                        }
                      } : undefined}
                      traversalStatusFilter={traversalStatusFilter}
                      onTraversalStatusFilterChange={(v) => { setTraversalStatusFilter(v); setTraversalPage(0) }}
                      traversalVisibilityFilter={traversalVisibilityFilter}
                      onTraversalVisibilityFilterChange={(v) => { setTraversalVisibilityFilter(v); setTraversalPage(0) }}
                      traversalSortField={traversalSortField}
                      onTraversalSortFieldChange={(v) => { setTraversalSortField(v); setTraversalPage(0) }}
                      traversalSortDir={traversalSortDir}
                      onTraversalSortDirChange={setTraversalSortDir}
                      traversalVisibleFields={traversalVisibleFields}
                      onTraversalVisibleFieldsChange={setTraversalVisibleFields}
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
      <ConfirmDialog
        open={pendingActivateRow !== null}
        title="Activate record?"
        message="This will set the valid-from date to now. You can undo this later by editing the field."
        confirmLabel="Yes, activate"
        confirmVariant="success"
        onConfirm={() => { onRowActivate(pendingActivateRow); setPendingActivateRow(null) }}
        onCancel={() => setPendingActivateRow(null)}
      />
      <ConfirmDialog
        open={pendingDeactivateRow !== null}
        title="Deactivate record?"
        message="This will set the valid-until date to now, making the record inactive. You can undo this later by editing the field."
        confirmLabel="Yes, deactivate"
        confirmVariant="warning"
        onConfirm={() => { onRowDeactivate(pendingDeactivateRow); setPendingDeactivateRow(null) }}
        onCancel={() => setPendingDeactivateRow(null)}
      />
      <ConfirmDialog
        open={traversalDeleteAllPending}
        title={`Delete all ${selectedTraversal?.label}?`}
        message="This will delete all related items in this traversal. This action cannot be undone."
        confirmLabel="Yes, delete all"
        confirmVariant="danger"
        onConfirm={async () => {
          setTraversalDeleteAllPending(false)
          if (onTraversalDeleteAll && expandedRow && selectedTraversal) {
            try { await onTraversalDeleteAll(expandedRow, selectedTraversal.pathTemplate) } catch { /* caller handles errors */ }
            setTraversalRefreshKey((k) => k + 1)
          }
        }}
        onCancel={() => setTraversalDeleteAllPending(false)}
      />
      {traversalActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setTraversalActionModal(null); setTraversalActionError(null) }} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">
                {traversalActionModal.type === 'post' ? `Add to ${selectedTraversal?.label}` : `Update all ${selectedTraversal?.label}`}
              </h3>
              <textarea
                rows={10}
                value={traversalActionModal.body}
                onChange={(e) => setTraversalActionModal((m) => ({ ...m, body: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 resize-y focus:outline-none focus:border-blue-600"
                spellCheck={false}
                autoFocus
              />
              {traversalActionError && <p className="text-xs text-rose-400">{traversalActionError}</p>}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setTraversalActionModal(null); setTraversalActionError(null) }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={traversalActionLoading}
                  onClick={async () => {
                    setTraversalActionLoading(true)
                    setTraversalActionError(null)
                    try {
                      const cb = traversalActionModal.type === 'post' ? onTraversalPost : onTraversalPatchAll
                      await cb(expandedRow, selectedTraversal.pathTemplate, traversalActionModal.body)
                      setTraversalActionModal(null)
                      setTraversalRefreshKey((k) => k + 1)
                    } catch (err) {
                      setTraversalActionError(err?.message ?? 'Request failed')
                    } finally {
                      setTraversalActionLoading(false)
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                >
                  {traversalActionLoading ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Related record modal – opens from _entityId/_listId cell clicks or traversal card edit buttons */}
      {relatedRecordModal && (
        relatedRecordModal.navItem && !relatedRecordModal.loading && relatedRecordModal.record ? (
          <ItemEditModal
            navItem={relatedRecordModal.navItem}
            initialRecord={relatedRecordModal.record}
            api={api}
            onClose={() => setRelatedRecordModal(null)}
            onSaved={() => { setTraversalRefreshKey((k) => k + 1) }}
          />
        ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRelatedRecordModal(null)}
          />
          <div className="relative z-10 w-full max-w-2xl mx-4 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900 flex-shrink-0">
              <div>
                {relatedRecordModal.record && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {relatedRecordModal.record._name ?? relatedRecordModal.record._kind ?? 'Record'}
                    </h3>
                    {relatedRecordModal.record._kind && relatedRecordModal.record._name && (
                      <span className="text-[11px] text-violet-400 font-mono">{relatedRecordModal.record._kind}</span>
                    )}
                  </>
                )}
                {!relatedRecordModal.record && !relatedRecordModal.loading && (
                  <h3 className="text-sm font-semibold text-slate-100">Related Record</h3>
                )}
                {relatedRecordModal.loading && (
                  <h3 className="text-sm font-semibold text-slate-400">Loading…</h3>
                )}
              </div>
              <button
                onClick={() => setRelatedRecordModal(null)}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {relatedRecordModal.loading && (
                <div className="flex items-center justify-center py-12 gap-2">
                  <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-slate-400 text-sm">Fetching record…</span>
                </div>
              )}
              {relatedRecordModal.error && (
                <div className="p-4 text-rose-400 text-sm">{relatedRecordModal.error}</div>
              )}
              {relatedRecordModal.record && (
                <ManagedFieldsPanel row={relatedRecordModal.record} />
              )}
            </div>
          </div>
        </div>
        )
      )}
    </div>
  )
}
