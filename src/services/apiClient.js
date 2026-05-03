/**
 * API Client
 *
 * All resource calls go through this module.
 * When `useDummyData` is true in context, the client resolves
 * from the selected dummy dataset instead of hitting the server.
 */

import { useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'

/**
 * Build the Authorization header value for the current user.
 * Returns null when no-auth user is selected.
 */
function buildAuthHeader(token) {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Low-level fetch wrapper. Throws on non-2xx responses.
 */
async function apiFetch(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`
  let res
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (err) {
    // Browser-level failures (often CORS, DNS, offline, mixed-content) reject before a Response exists.
    const netErr = new Error(
      `Network/CORS error while calling ${path}. Check API server reachability and CORS headers. (${err?.message ?? 'fetch failed'})`
    )
    netErr.cause = err
    throw netErr
  }
  if (!res.ok) {
    let body
    try { body = await res.json() } catch { body = { message: res.statusText } }
    const err = new Error(body?.error?.message ?? body?.message ?? res.statusText)
    err.status = res.status
    err.body = body
    throw err
  }
  if (res.status === 204) return null

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return res.json()
  }

  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * React hook – returns bound API functions for every resource type.
 */
export function useApi() {
  const { currentUser, selectedServerUrl, useDummyData, currentDataset } = useApp()

  const authHeaders = useMemo(
    () => buildAuthHeader(currentUser.token),
    [currentUser.token]
  )

  const dummyList = useCallback((key) => {
    return Promise.resolve(currentDataset?.[key] ?? [])
  }, [currentDataset])

  const dummyById = useCallback((key, id) => {
    const item = (currentDataset?.[key] ?? []).find((r) => r._id === id)
    if (!item) return Promise.reject(new Error('Not found in dummy dataset'))
    return Promise.resolve(item)
  }, [currentDataset])

  // ── Entities ─────────────────────────────────────────────────────────────
  const entities = useMemo(() => ({
    list: (params = '') =>
      useDummyData
        ? dummyList('entities')
        : apiFetch(selectedServerUrl, `/api/v1/entities${params}`, { headers: authHeaders }),

    getById: (id) =>
      useDummyData
        ? dummyById('entities', id)
        : apiFetch(selectedServerUrl, `/api/v1/entities/${id}`, { headers: authHeaders }),

    count: () =>
      useDummyData
        ? Promise.resolve({ count: (currentDataset?.entities ?? []).length })
        : apiFetch(selectedServerUrl, '/api/v1/entities/count', { headers: authHeaders }),

    create: (body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: `dummy-${Date.now()}` })
        : apiFetch(selectedServerUrl, '/api/v1/entities', {
            method: 'POST', body: JSON.stringify(body), headers: authHeaders,
          }),

    update: (id, body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: id })
        : apiFetch(selectedServerUrl, `/api/v1/entities/${id}`, {
            method: 'PATCH', body: JSON.stringify(body), headers: authHeaders,
          }),

    delete: (id) =>
      useDummyData
        ? Promise.resolve(null)
        : apiFetch(selectedServerUrl, `/api/v1/entities/${id}`, {
            method: 'DELETE', headers: authHeaders,
          }),
  }), [authHeaders, dummyById, dummyList, selectedServerUrl, useDummyData, currentDataset])

  // ── Lists ─────────────────────────────────────────────────────────────────
  const lists = useMemo(() => ({
    list: (params = '') =>
      useDummyData
        ? dummyList('lists')
        : apiFetch(selectedServerUrl, `/api/v1/lists${params}`, { headers: authHeaders }),

    getById: (id) =>
      useDummyData
        ? dummyById('lists', id)
        : apiFetch(selectedServerUrl, `/api/v1/lists/${id}`, { headers: authHeaders }),

    count: () =>
      useDummyData
        ? Promise.resolve({ count: (currentDataset?.lists ?? []).length })
        : apiFetch(selectedServerUrl, '/api/v1/lists/count', { headers: authHeaders }),

    create: (body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: `dummy-${Date.now()}` })
        : apiFetch(selectedServerUrl, '/api/v1/lists', {
            method: 'POST', body: JSON.stringify(body), headers: authHeaders,
          }),

    update: (id, body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: id })
        : apiFetch(selectedServerUrl, `/api/v1/lists/${id}`, {
            method: 'PATCH', body: JSON.stringify(body), headers: authHeaders,
          }),

    delete: (id) =>
      useDummyData
        ? Promise.resolve(null)
        : apiFetch(selectedServerUrl, `/api/v1/lists/${id}`, {
            method: 'DELETE', headers: authHeaders,
          }),
  }), [authHeaders, dummyById, dummyList, selectedServerUrl, useDummyData, currentDataset])

  // ── Entity Reactions ──────────────────────────────────────────────────────
  const entityReactions = useMemo(() => ({
    list: (params = '') =>
      useDummyData
        ? dummyList('entityReactions')
        : apiFetch(selectedServerUrl, `/api/v1/entity-reactions${params}`, { headers: authHeaders }),

    getById: (id) =>
      useDummyData
        ? dummyById('entityReactions', id)
        : apiFetch(selectedServerUrl, `/api/v1/entity-reactions/${id}`, { headers: authHeaders }),

    count: () =>
      useDummyData
        ? Promise.resolve({ count: (currentDataset?.entityReactions ?? []).length })
        : apiFetch(selectedServerUrl, '/api/v1/entity-reactions/count', { headers: authHeaders }),

    create: (body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: `dummy-${Date.now()}` })
        : apiFetch(selectedServerUrl, '/api/v1/entity-reactions', {
            method: 'POST', body: JSON.stringify(body), headers: authHeaders,
          }),

    update: (id, body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: id })
        : apiFetch(selectedServerUrl, `/api/v1/entity-reactions/${id}`, {
            method: 'PATCH', body: JSON.stringify(body), headers: authHeaders,
          }),

    delete: (id) =>
      useDummyData
        ? Promise.resolve(null)
        : apiFetch(selectedServerUrl, `/api/v1/entity-reactions/${id}`, {
            method: 'DELETE', headers: authHeaders,
          }),
  }), [authHeaders, dummyById, dummyList, selectedServerUrl, useDummyData, currentDataset])

  // ── List Reactions ────────────────────────────────────────────────────────
  const listReactions = useMemo(() => ({
    list: (params = '') =>
      useDummyData
        ? dummyList('listReactions')
        : apiFetch(selectedServerUrl, `/api/v1/list-reactions${params}`, { headers: authHeaders }),

    getById: (id) =>
      useDummyData
        ? dummyById('listReactions', id)
        : apiFetch(selectedServerUrl, `/api/v1/list-reactions/${id}`, { headers: authHeaders }),

    count: () =>
      useDummyData
        ? Promise.resolve({ count: (currentDataset?.listReactions ?? []).length })
        : apiFetch(selectedServerUrl, '/api/v1/list-reactions/count', { headers: authHeaders }),

    create: (body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: `dummy-${Date.now()}` })
        : apiFetch(selectedServerUrl, '/api/v1/list-reactions', {
            method: 'POST', body: JSON.stringify(body), headers: authHeaders,
          }),

    update: (id, body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: id })
        : apiFetch(selectedServerUrl, `/api/v1/list-reactions/${id}`, {
            method: 'PATCH', body: JSON.stringify(body), headers: authHeaders,
          }),

    delete: (id) =>
      useDummyData
        ? Promise.resolve(null)
        : apiFetch(selectedServerUrl, `/api/v1/list-reactions/${id}`, {
            method: 'DELETE', headers: authHeaders,
          }),
  }), [authHeaders, dummyById, dummyList, selectedServerUrl, useDummyData, currentDataset])

  // ── Relations ─────────────────────────────────────────────────────────────
  const relations = useMemo(() => ({
    list: (params = '') =>
      useDummyData
        ? dummyList('relations')
        : apiFetch(selectedServerUrl, `/api/v1/relations${params}`, { headers: authHeaders }),

    getById: (id) =>
      useDummyData
        ? dummyById('relations', id)
        : apiFetch(selectedServerUrl, `/api/v1/relations/${id}`, { headers: authHeaders }),

    count: () =>
      useDummyData
        ? Promise.resolve({ count: (currentDataset?.relations ?? []).length })
        : apiFetch(selectedServerUrl, '/api/v1/relations/count', { headers: authHeaders }),

    create: (body) =>
      useDummyData
        ? Promise.resolve({ ...body, _id: `dummy-${Date.now()}` })
        : apiFetch(selectedServerUrl, '/api/v1/relations', {
            method: 'POST', body: JSON.stringify(body), headers: authHeaders,
          }),

    delete: (id) =>
      useDummyData
        ? Promise.resolve(null)
        : apiFetch(selectedServerUrl, `/api/v1/relations/${id}`, {
            method: 'DELETE', headers: authHeaders,
          }),
  }), [authHeaders, dummyById, dummyList, selectedServerUrl, useDummyData, currentDataset])

  return useMemo(
    () => ({ entities, lists, entityReactions, listReactions, relations }),
    [entities, lists, entityReactions, listReactions, relations]
  )
}
