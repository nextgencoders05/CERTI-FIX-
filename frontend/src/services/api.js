import axios from 'axios'
import { handleLocalApiRequest } from './localBackend'

const TOKEN_KEY = 'certifix_token'

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token) } catch { /* storage unavailable */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
  },
}

const explicitApiUrl = import.meta.env.VITE_API_URL
const isStaticHost =
  import.meta.env.VITE_STATIC_MODE === 'true' ||
  (!explicitApiUrl &&
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') || window.location.protocol === 'file:'))

const defaultAdapter = axios.getAdapter(axios.defaults.adapter)
let backendUnavailable = isStaticHost

async function hybridAdapter(config) {
  if (backendUnavailable) {
    return handleLocalApiRequest(config)
  }
  try {
    const res = await defaultAdapter(config)
    const contentType = String(res.headers?.['content-type'] || '').toLowerCase()
    if (
      contentType.includes('text/html') ||
      (typeof res.data === 'string' && /^\s*<!doctype html/i.test(res.data))
    ) {
      backendUnavailable = true
      return handleLocalApiRequest(config)
    }
    return res
  } catch (err) {
    // If no backend server is reachable or static server returns 404/405 without FastAPI JSON detail
    const status = err?.response?.status
    const hasFastApiDetail =
      err?.response?.data &&
      typeof err.response.data === 'object' &&
      'detail' in err.response.data
    if (!err?.response || ((status === 404 || status === 405 || status === 502 || status === 503 || status === 504) && !hasFastApiDetail)) {
      if (!explicitApiUrl) backendUnavailable = true
      return handleLocalApiRequest(config)
    }
    throw err
  }
}

const api = axios.create({
  baseURL: explicitApiUrl || '/api',
  timeout: 120000,
  adapter: hybridAdapter,
})

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear()
      window.dispatchEvent(new Event('certifix:logout'))
    }
    return Promise.reject(err)
  },
)

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err?.response) return 'Cannot reach the server. Check your connection and try again.'
  const detail = err.response.data?.detail
  if (typeof detail === 'string') return detail
  if (err.response.status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (err.response.status === 413) return 'The file is too large.'
  return fallback
}

/** Fetch an authenticated file and return an object URL (caller must revoke it). */
export async function fetchBlobUrl(url) {
  const res = await api.get(url, { responseType: 'blob' })
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
  return URL.createObjectURL(blob)
}

export async function downloadFile(url, filename) {
  const objectUrl = await fetchBlobUrl(url)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
}

export default api
