import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Generic data-fetching hook for resource list pages.
 *
 * @param {() => Promise<any[]>} fetcher  – async function that returns the records
 * @returns {{ data, loading, error, refresh }}
 */
export function useResourceList(fetcher) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestSeqRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      // Ignore stale responses from earlier requests.
      if (requestId !== requestSeqRef.current) return
      setData(Array.isArray(result) ? result : [])
    } catch (err) {
      if (requestId !== requestSeqRef.current) return
      setError(err?.message ?? 'Failed to load data')
    } finally {
      if (requestId !== requestSeqRef.current) return
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}
