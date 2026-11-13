import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../services/api'

/**
 * GET a resource. `url` may be null to skip fetching. Re-fetches when url/params change.
 * Returns { data, loading, error, reload, setData }.
 */
export function useApi(url, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(url))
  const [error, setError] = useState(null)
  const key = JSON.stringify(params || {})
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!url) return
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(url, { params: JSON.parse(key) })
      if (mine === seq.current) setData(res.data)
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [url, key])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load, setData }
}

export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
