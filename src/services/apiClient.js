/**
 * Generic API client
 *
 * Uses the endpoint and token stored in AppContext.
 * No static resource bindings — callers pass the path directly.
 */

import { useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'

/**
 * Low-level fetch. Throws on network errors and non-2xx responses.
 *
 * @param {string} baseUrl   Base URL (no trailing slash)
 * @param {string} path      Path starting with /
 * @param {string|null} token  Bearer token (optional)
 * @param {RequestInit} options  Additional fetch options
 */
export async function apiFetch(baseUrl, path, token, options = {}) {
  const url = `${baseUrl}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (err) {
    const netErr = new Error(
      `Network/CORS error while calling ${path}. Check API server reachability and CORS headers. (${err?.message ?? 'fetch failed'})`
    )
    netErr.cause = err
    throw netErr
  }

  if (!res.ok) {
    let body
    try {
      body = await res.json()
    } catch {
      body = { message: res.statusText }
    }
    const e = new Error(body?.error?.message ?? body?.message ?? res.statusText)
    e.status = res.status
    e.body = body
    throw e
  }

  if (res.status === 204) return null

  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json()

  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Low-level fetch that returns data + response metadata (headers, status).
 * Same error behaviour as apiFetch.
 */
export async function apiFetchWithMeta(baseUrl, path, token, options = {}) {
  const url = `${baseUrl}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (err) {
    const netErr = new Error(
      `Network/CORS error while calling ${path}. Check API server reachability and CORS headers. (${err?.message ?? 'fetch failed'})`
    )
    netErr.cause = err
    throw netErr
  }

  const responseHeaders = {}
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  const status = res.status

  if (!res.ok) {
    let body
    try {
      body = await res.json()
    } catch {
      body = { message: res.statusText }
    }
    const e = new Error(body?.error?.message ?? body?.message ?? res.statusText)
    e.status = res.status
    e.body = body
    throw e
  }

  if (res.status === 204) return { data: null, headers: responseHeaders, status }

  const ct = res.headers.get('content-type') ?? ''
  let data
  if (ct.includes('application/json')) {
    data = await res.json()
  } else {
    const text = await res.text()
    if (!text) {
      data = null
    } else {
      try { data = JSON.parse(text) } catch { data = text }
    }
  }

  return { data, headers: responseHeaders, status }
}

/**
 * React hook – returns bound GET/POST/PATCH/DELETE helpers using the current
 * endpoint and token from context.
 */
export function useApiClient() {
  const { endpoint, token } = useApp()

  const get = useCallback(
    (path) => apiFetch(endpoint, path, token),
    [endpoint, token]
  )

  const getWithMeta = useCallback(
    (path) => apiFetchWithMeta(endpoint, path, token),
    [endpoint, token]
  )

  const post = useCallback(
    (path, body) =>
      apiFetch(endpoint, path, token, { method: 'POST', body: JSON.stringify(body) }),
    [endpoint, token]
  )

  const patch = useCallback(
    (path, body) =>
      apiFetch(endpoint, path, token, { method: 'PATCH', body: JSON.stringify(body) }),
    [endpoint, token]
  )

  const put = useCallback(
    (path, body) =>
      apiFetch(endpoint, path, token, { method: 'PUT', body: JSON.stringify(body) }),
    [endpoint, token]
  )

  const del = useCallback(
    (path) => apiFetch(endpoint, path, token, { method: 'DELETE' }),
    [endpoint, token]
  )

  return useMemo(() => ({ get, getWithMeta, post, patch, put, del }), [get, getWithMeta, post, patch, put, del])
}
