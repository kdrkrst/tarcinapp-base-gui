import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { parseOasSpec } from '../utils/oasParser'
import { useApiClient } from '../services/apiClient'

const BASE_TYPE_ORDER = ['entity', 'list', 'relation', 'entity-reaction', 'list-reaction']

const BASE_TYPE_LABELS = {
  entity: 'Entities',
  list: 'Lists',
  relation: 'Relations',
  'entity-reaction': 'Entity Reactions',
  'list-reaction': 'List Reactions',
}

/**
 * Simple in-memory cache for dashboard count requests.
 * Module-level so it survives re-renders; clears on full page reload.
 * TTL: 60 seconds.
 */
const CACHE_TTL_MS = 60_000
const countCache = new Map() // key → { value, expiresAt }

function cacheGet(key) {
  const entry = countCache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) { countCache.delete(key); return undefined }
  return entry.value
}

function cacheSet(key, value) {
  countCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Decode the `sub` claim from a JWT without verifying the signature. */
function parseJwtSub(token) {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return json.sub ?? null
  } catch {
    return null
  }
}

/** Fetch count with a 60 s in-memory cache, falling back to collection GET. */
async function fetchCount(get, collectionPath, query) {
  const qs = query ? `?${query}` : ''
  const cacheKey = collectionPath + qs

  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached

  let result
  try {
    const res = await get(collectionPath + '/count' + qs)
    result = res?.count ?? '?'
  } catch {
    try {
      const res = await get(collectionPath + qs)
      result = Array.isArray(res) ? res.length : '?'
    } catch {
      return null // don't cache errors
    }
  }

  cacheSet(cacheKey, result)
  return result
}

// Per-section color theme (all colors as raw values for inline styles)
const SECTION_THEME = {
  entity:           { rgb: '16,185,129',  accent: '#34d399', label: 'rgba(6,95,70,0.9)',    header: 'rgba(16,185,129,0.55)' },
  list:             { rgb: '139,92,246',  accent: '#a78bfa', label: 'rgba(91,33,182,0.9)',   header: 'rgba(139,92,246,0.55)' },
  relation:         { rgb: '14,165,233',  accent: '#38bdf8', label: 'rgba(3,105,161,0.9)',   header: 'rgba(14,165,233,0.55)' },
  'entity-reaction':{ rgb: '245,158,11',  accent: '#fbbf24', label: 'rgba(146,64,14,0.9)',   header: 'rgba(245,158,11,0.55)' },
  'list-reaction':  { rgb: '244,63,94',   accent: '#fb7185', label: 'rgba(159,18,57,0.9)',   header: 'rgba(244,63,94,0.55)'  },
}
const FALLBACK_THEME = SECTION_THEME.entity

function ChevronIcon({ open }) {
  return (
    <svg className={`w-3 h-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// One entity rendered inside the hero (no box — just number + name)
function HeroEntityStat({ label, routePath, collectionPath, hasSet, get }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    const q = hasSet
      ? [
          fetchCount(get, collectionPath, 'set[and][0][or][0][actives]=true&set[and][1][or][0][publics]=true'),
          fetchCount(get, collectionPath, 'set[pendings]=true'),
          fetchCount(get, collectionPath, 'set[expireds]=true'),
        ]
      : [fetchCount(get, collectionPath, '')]
    Promise.all(q).then(([a, b, c]) => {
      if (!cancelled) setData(hasSet ? { activePublic: a, pending: b, expired: c } : { total: a })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, hasSet])

  const mainNum = data ? (data.total ?? data.activePublic) : null
  const loading = data === null

  return (
    <Link to={routePath} className="group/stat flex flex-col gap-2 select-none">
      {loading ? (
        <div className="h-20 w-14 bg-white/5 rounded-xl animate-pulse" />
      ) : (
        <span className="text-[5.5rem] font-black tabular-nums leading-none tracking-tight text-white transition-colors duration-300 group-hover/stat:text-emerald-300">
          {mainNum ?? '—'}
        </span>
      )}
      <span className="text-lg font-semibold text-slate-300 transition-colors duration-200 group-hover/stat:text-white">
        {label}
      </span>
      {/* Per-entity pill hints */}
      {hasSet && (
        <div className="flex flex-wrap gap-1.5 mt-0.5 min-h-[1.25rem]">
          {loading ? (
            <div className="h-4 w-20 bg-white/5 rounded-full animate-pulse" />
          ) : (
            <>
              {(data?.pending ?? 0) > 0 && (
                <span className="text-[10px] bg-amber-500/15 text-amber-400/90 px-2 py-0.5 rounded-full font-medium">
                  {data.pending} pending
                </span>
              )}
              {(data?.expired ?? 0) > 0 && (
                <span className="text-[10px] bg-slate-800/80 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                  {data.expired} expired
                </span>
              )}
            </>
          )}
        </div>
      )}
    </Link>
  )
}

// Mine expand for the entity hero (aggregates all entity items)
function HeroMineExpand({ items, userId, get }) {
  const [expanded, setExpanded] = useState(false)
  const [mineData, setMineData] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleExpand = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    if (next && mineData === null && !loading) {
      setLoading(true)
      Promise.all(
        items.map(item =>
          Promise.all([
            fetchCount(get, item.collectionPath, `set[and][0][or][0][actives]=true&set[and][1][or][0][publics]=true&set[owners][userIds]=${encodeURIComponent(userId)}`),
            fetchCount(get, item.collectionPath, `set[pendings]=true&set[owners][userIds]=${encodeURIComponent(userId)}`),
          ]).then(([ap, p]) => ({ label: item.label, routePath: item.routePath, activePublic: ap, pending: p }))
        )
      ).then(results => { setMineData(results); setLoading(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, mineData, loading, userId])

  return (
    <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={handleExpand}
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors duration-200"
        style={{ color: expanded ? '#818cf8' : 'rgba(100,116,139,0.8)' }}
      >
        <span>My Activity</span>
        <ChevronIcon open={expanded} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'max-h-48 mt-5' : 'max-h-0'}`}>
        {loading ? (
          <div className="flex gap-10">
            {items.map(item => (
              <div key={item.id} className="space-y-2">
                <div className="h-8 w-12 bg-white/5 rounded animate-pulse" />
                <div className="h-3 w-16 bg-white/3 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : mineData && (
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            {mineData.map(d => (
              <div key={d.label}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-black text-indigo-400 tabular-nums leading-none">{d.activePublic ?? '—'}</span>
                  <span className="text-sm text-slate-500 font-medium">{d.label}</span>
                </div>
                {(d.pending ?? 0) > 0 && (
                  <span className="text-[10px] text-indigo-500/60 font-medium">{d.pending} pending</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Wide hero banner for entities (full-width, no per-entity boxes)
function EntityHeroSection({ items, userId, get }) {
  return (
    <section>
      <div className="relative overflow-hidden rounded-3xl"
           style={{ background: 'linear-gradient(135deg, rgba(2,44,34,0.75) 0%, rgba(10,18,36,0.95) 55%, rgba(15,23,42,1) 100%)' }}>
        {/* Deep emerald sweep from top-left */}
        <div className="pointer-events-none absolute inset-0"
             style={{ background: 'radial-gradient(ellipse at -15% -20%, rgba(16,185,129,0.22) 0%, transparent 55%)' }} />
        {/* Second softer sweep from bottom right */}
        <div className="pointer-events-none absolute inset-0"
             style={{ background: 'radial-gradient(ellipse at 110% 110%, rgba(16,185,129,0.06) 0%, transparent 50%)' }} />
        {/* Top shimmer line */}
        <div className="absolute top-0 inset-x-0 h-px"
             style={{ background: 'linear-gradient(to right, transparent 0%, rgba(16,185,129,0.5) 30%, rgba(16,185,129,0.2) 70%, transparent 100%)' }} />
        {/* Subtle dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.025]"
             style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="relative p-8 lg:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-10"
             style={{ color: 'rgba(52,211,153,0.55)' }}>
            Entities · active &amp; public
          </p>

          <div className="flex flex-wrap items-end gap-x-14 gap-y-8 mb-8">
            {items.map(item => (
              <HeroEntityStat key={item.id} {...item} get={get} />
            ))}
          </div>

          {userId && <HeroMineExpand items={items} userId={userId} get={get} />}
        </div>
      </div>
    </section>
  )
}

// Standard card for non-entity types
function ResourceCard({ label, routePath, collectionPath, hasSet, userId, get, theme }) {
  const [primary, setPrimary] = useState(null)
  const [mine, setMine] = useState(null)
  const [mineLoading, setMineLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const promises = hasSet
      ? [
          fetchCount(get, collectionPath, 'set[and][0][or][0][actives]=true&set[and][1][or][0][publics]=true'),
          fetchCount(get, collectionPath, 'set[pendings]=true'),
          fetchCount(get, collectionPath, 'set[expireds]=true'),
        ]
      : [fetchCount(get, collectionPath, '')]
    Promise.all(promises).then(([a, b, c]) => {
      if (!cancelled) setPrimary(hasSet ? { activePublic: a, pending: b, expired: c } : { total: a })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, hasSet])

  const handleExpand = useCallback((e) => {
    e.preventDefault()
    const next = !expanded
    setExpanded(next)
    if (next && mine === null && !mineLoading && userId) {
      setMineLoading(true)
      Promise.all([
        fetchCount(get, collectionPath, `set[and][0][or][0][actives]=true&set[and][1][or][0][publics]=true&set[owners][userIds]=${encodeURIComponent(userId)}`),
        fetchCount(get, collectionPath, `set[pendings]=true&set[owners][userIds]=${encodeURIComponent(userId)}`),
      ]).then(([ap, p]) => { setMine({ activePublic: ap, pending: p }); setMineLoading(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, mine, mineLoading, userId, collectionPath])

  const loading = primary === null
  const heroNumber = primary ? (primary.total ?? primary.activePublic) : null
  const showMineToggle = hasSet && !!userId

  return (
    <div
      className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: `linear-gradient(145deg, rgba(${theme.rgb},0.05) 0%, rgba(15,23,42,0.97) 55%)`,
        border: `1px solid rgba(${theme.rgb},0.13)`,
        '--theme-rgb': theme.rgb,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${theme.rgb},0.28)` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = `rgba(${theme.rgb},0.13)` }}
    >
      {/* Hover glow */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
           style={{ background: `radial-gradient(ellipse at 5% 5%, rgba(${theme.rgb},0.1) 0%, transparent 60%)` }} />
      {/* Top shimmer */}
      <div className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
           style={{ background: `linear-gradient(to right, transparent, rgba(${theme.rgb},0.6), transparent)` }} />
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] opacity-30 group-hover:opacity-70 transition-opacity duration-300"
           style={{ background: `linear-gradient(to bottom, ${theme.accent}, rgba(${theme.rgb},0.1))` }} />

      {/* Main link area */}
      <Link to={routePath} className="relative flex-1 flex flex-col pl-7 pr-6 pt-6 pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500 mb-5 group-hover:text-slate-400 transition-colors duration-200">
          {label}
        </p>

        <div className="mb-1">
          {loading ? (
            <div className="h-14 w-16 bg-slate-800 rounded-xl animate-pulse" />
          ) : (
            <p className="text-6xl font-black tabular-nums leading-none tracking-tight text-white">
              {heroNumber ?? '—'}
            </p>
          )}
        </div>

        <p className="text-[11px] font-medium mb-5" style={{ color: theme.label }}>
          {hasSet ? 'active & public' : 'total'}
        </p>

        {hasSet && (
          <div className="flex flex-wrap gap-2 mt-auto">
            {loading ? (
              <div className="h-5 w-24 bg-slate-800 rounded-full animate-pulse" />
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400/90">
                  <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                  {primary?.pending ?? '—'} pending
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800/80 text-slate-500">
                  <span className="w-1 h-1 rounded-full bg-slate-600 flex-shrink-0" />
                  {primary?.expired ?? '—'} expired
                </span>
              </>
            )}
          </div>
        )}
      </Link>

      {showMineToggle && (
        <>
          <button
            onClick={handleExpand}
            className="relative flex items-center justify-between px-7 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors duration-200 hover:bg-white/[0.02]"
            style={{ borderTop: `1px solid rgba(${theme.rgb},0.1)`, color: expanded ? theme.accent : 'rgba(100,116,139,0.8)' }}
          >
            <span>Mine</span>
            <span style={{ color: expanded ? theme.accent : 'rgba(71,85,105,0.8)' }}>
              <ChevronIcon open={expanded} />
            </span>
          </button>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'max-h-32' : 'max-h-0'}`}>
            <div className="px-7 pt-3 pb-5 grid grid-cols-2 gap-4"
                 style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,0.07) 0%, transparent 70%)' }}>
              {mineLoading ? (
                <>
                  <div className="space-y-2"><div className="h-7 w-10 bg-slate-800 rounded animate-pulse" /><div className="h-3 w-14 bg-slate-800/60 rounded animate-pulse" /></div>
                  <div className="space-y-2"><div className="h-7 w-8 bg-slate-800 rounded animate-pulse" /><div className="h-3 w-12 bg-slate-800/60 rounded animate-pulse" /></div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: '#818cf8' }}>{mine?.activePublic ?? '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1.5">active & public</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'rgba(165,180,252,0.55)' }}>{mine?.pending ?? '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1.5">pending</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SectionGroup({ type, label, items, userId, get }) {
  const theme = SECTION_THEME[type] ?? FALLBACK_THEME
  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-px h-4 rounded-full" style={{ background: theme.header }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.header }}>
          {label}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(item => (
          <ResourceCard key={item.id} {...item} userId={userId} get={get} theme={theme} />
        ))}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { oasSpec, token } = useApp()
  const { get } = useApiClient()
  const { navItems } = oasSpec ? parseOasSpec(oasSpec) : { navItems: [] }

  const userId = useMemo(() => parseJwtSub(token), [token])

  const groups = BASE_TYPE_ORDER.reduce((acc, type) => {
    const items = navItems.filter(item => item.baseType === type)
    if (items.length) acc.push({ type, label: BASE_TYPE_LABELS[type] ?? type, items })
    return acc
  }, [])

  const ungrouped = navItems.filter(item => !BASE_TYPE_ORDER.includes(item.baseType))
  if (ungrouped.length) groups.push({ type: null, label: 'Other', items: ungrouped })

  if (navItems.length === 0) {
    return <p className="text-slate-500 text-sm">No resources found in the OpenAPI spec.</p>
  }

  return (
    <div className="space-y-10">
      {groups.map(({ type, label, items }) =>
        type === 'entity' ? (
          <EntityHeroSection key="entity" items={items} userId={userId} get={get} />
        ) : (
          <SectionGroup key={type ?? '__other'} type={type} label={label} items={items} userId={userId} get={get} />
        )
      )}
    </div>
  )
}

