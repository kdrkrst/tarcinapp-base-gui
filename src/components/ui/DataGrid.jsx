import { useEffect, useRef, useState } from 'react'

/**
 * Shared DataGrid component.
 *
 * Props:
 *   columns  – [{ key, label, render? }]
 *   data     – array of row objects
 *   loading  – bool
 *   error    – string | null
 *   onRefresh – () => void
 *   onRowClick – (row) => void
 */
export default function DataGrid({ columns, data, loading, error, onRefresh, onRowClick }) {
  const [copiedId, setCopiedId] = useState(null)
  const resetCopyTimerRef = useRef(null)

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
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/60 border-b border-slate-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.map((row, i) => (
            <tr
              key={row._id ?? i}
              className={`transition-colors ${onRowClick ? 'hover:bg-slate-800/40 cursor-pointer' : 'hover:bg-slate-800/40'}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-300 whitespace-nowrap max-w-[220px] truncate">
                  {col.render
                    ? col.render(row[col.key], row)
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
