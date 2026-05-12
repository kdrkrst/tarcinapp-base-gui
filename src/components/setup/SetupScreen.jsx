import { useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'

export default function SetupScreen() {
  const { connect, connectWithUploadedSpec, oasStatus, oasError } = useApp()
  const [endpoint, setEndpoint] = useState('http://localhost:8081')
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await connect(endpoint.trim(), token.trim() || null)
    setSubmitting(false)
  }

  async function handleFile(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      await connectWithUploadedSpec({
        spec: null,
        endpoint: endpoint.trim(),
        token: token.trim() || null,
      })
      return
    }

    setSubmitting(true)
    try {
      const text = await file.text()
      const spec = JSON.parse(text)
      await connectWithUploadedSpec({
        spec,
        endpoint: endpoint.trim(),
        token: token.trim() || null,
      })
    } catch {
      await connectWithUploadedSpec({
        spec: null,
        endpoint: endpoint.trim(),
        token: token.trim() || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setIsDragging(false)
  }

  const isLoading = submitting || oasStatus === 'loading'

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">Tarcinapp</p>
            <p className="text-slate-400 text-sm mt-0.5">Entity Platform GUI</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
          <h1 className="text-white font-semibold text-xl mb-1">Connect to API</h1>
          <p className="text-slate-400 text-sm mb-6">
            Enter your API endpoint, or upload an OpenAPI JSON file. The UI will be generated automatically from the spec.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`mb-5 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-950/20'
                : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
            }`}
          >
            <p className="text-sm text-slate-300">
              Drag and drop OpenAPI JSON file here
            </p>
            <p className="text-xs text-slate-500 mt-1">or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
            >
              Choose JSON File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                API Endpoint <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                required
                placeholder="http://localhost:8081"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Will fetch{' '}
                <code className="bg-slate-800 px-1 py-0.5 rounded font-mono">
                  {(endpoint || 'http://...').replace(/\/$/, '')}/openapi.json
                </code>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Bearer Token{' '}
                <span className="text-slate-500 text-xs font-normal">(optional)</span>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiJ9…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {oasError && (
              <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800 rounded-lg p-3">
                <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-red-300 text-sm">{oasError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium text-sm transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Connecting…
                </span>
              ) : (
                'Connect'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          You can also set{' '}
          <code className="font-mono">VITE_API_ENDPOINT</code> and{' '}
          <code className="font-mono">VITE_API_TOKEN</code> environment variables to skip this screen.
        </p>
      </div>
    </div>
  )
}
