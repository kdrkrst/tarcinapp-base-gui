import { useCallback } from 'react'
import { useApi } from '../services/apiClient'
import { useResourceList } from '../hooks/useResourceList'
import DataGrid from '../components/ui/DataGrid'
import { VisibilityBadge, KindBadge, DateCell } from '../components/ui/Badges'

const COLUMNS = [
  { key: '_id',              label: 'ID',        render: (v) => <span className="font-mono text-xs text-slate-400">{v}</span> },
  { key: '_kind',            label: 'Kind',      render: (v) => <KindBadge value={v} /> },
  { key: '_entityId',        label: 'Entity ID', render: (v) => <span className="font-mono text-xs text-slate-400">{v ?? '—'}</span> },
  { key: '_visibility',     label: 'Visibility',render: (v) => <VisibilityBadge value={v} /> },
  { key: '_createdBy',      label: 'Created By',render: (v) => <span className="text-xs font-mono text-slate-400">{v ?? '—'}</span> },
  { key: '_createdDateTime',label: 'Created',   render: (v) => <DateCell value={v} /> },
  { key: '_validFromDateTime',label: 'Valid From',render: (v) => <DateCell value={v} /> },
]

export default function EntityReactionsPage() {
  const api = useApi()
  const fetcher = useCallback(() => api.entityReactions.list(), [api])
  const { data, loading, error, refresh } = useResourceList(fetcher)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Entity Reactions</h2>
          <p className="text-sm text-slate-400 mt-0.5">All entity reactions from <code className="font-mono text-xs bg-slate-800 px-1 rounded">/api/v1/entity-reactions</code></p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="text-xs text-slate-500 font-mono">
        {!loading && !error && `${data.length} record(s) returned`}
      </div>
      <DataGrid columns={COLUMNS} data={data} loading={loading} error={error} onRefresh={refresh} />
    </div>
  )
}
