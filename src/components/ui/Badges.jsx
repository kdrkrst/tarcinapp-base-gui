/** Visibility badge */
export function VisibilityBadge({ value }) {
  const map = {
    public:    'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    protected: 'bg-amber-900/40 text-amber-300 border-amber-800',
    private:   'bg-rose-900/40 text-rose-300 border-rose-800',
  }
  const cls = map[value] ?? 'bg-slate-800 text-slate-400 border-slate-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {value ?? '—'}
    </span>
  )
}

/** Generic kind / tag badge */
export function KindBadge({ value }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-800">
      {value ?? '—'}
    </span>
  )
}

/** Datetime cell formatter */
export function DateCell({ value }) {
  if (!value) return <span className="text-slate-600">—</span>
  const d = new Date(value)
  return (
    <span className="font-mono text-xs text-slate-400">
      {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}
