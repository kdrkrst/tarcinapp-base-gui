import { useApp } from '../../context/AppContext'

export default function SettingsModal({ open, onClose }) {
  const {
    users, selectedUserId, setSelectedUserId, currentUser,
    servers, selectedServerUrl, setSelectedServerUrl,
    datasets, selectedDatasetKey, setSelectedDatasetKey,
    useDummyData, setUseDummyData,
  } = useApp()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex flex-col w-full max-w-md bg-slate-900 shadow-2xl slide-in overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <p className="text-sm text-slate-400 mt-0.5">Configure user, server and data source</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-6 space-y-8">

          {/* ── User Selection ─────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Active User
            </h3>
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    selectedUserId === user.id
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-slate-300">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{user.name}</p>
                      {selectedUserId === user.id && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-medium">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">{user.description}</p>
                    <p className="text-xs font-mono text-slate-500 mt-1 truncate">
                      {user.token ? `${user.token.slice(0, 32)}…` : 'No token — unauthenticated'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Server Selection ───────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Backend Server
            </h3>
            <div className="space-y-2">
              {servers.map((server) => (
                <button
                  key={server.url}
                  onClick={() => setSelectedServerUrl(server.url)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedServerUrl === server.url
                      ? 'border-emerald-500 bg-emerald-600/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    selectedServerUrl === server.url ? 'bg-emerald-400' : 'bg-slate-600'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-slate-100">{server.description}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{server.url}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Data Source ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Data Source
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-400">Use dummy data</span>
                <button
                  role="switch"
                  aria-checked={useDummyData}
                  onClick={() => setUseDummyData(!useDummyData)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    useDummyData ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      useDummyData ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>

            {useDummyData && (
              <div className="space-y-2">
                {Object.entries(datasets).map(([key, ds]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedDatasetKey(key)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedDatasetKey === key
                        ? 'border-amber-500 bg-amber-600/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{ds.label}</p>
                      {selectedDatasetKey === key && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-600 text-white font-medium">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{ds.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['entities', 'lists', 'entityReactions', 'listReactions', 'relations'].map((k) => (
                        <span key={k} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                          {k}: {ds[k]?.length ?? 0}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!useDummyData && (
              <p className="text-sm text-slate-400 px-1">
                Live API mode — requests go to the selected server above using the active user token.
              </p>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
